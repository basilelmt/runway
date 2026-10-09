import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AskChart, AskStreamEvent } from '@shared/api-types';
import type { ISODate } from '@shared/dates';
import { askAnswerSchema, type AskRequest } from '@shared/schemas';
import type { Db } from '../db/client';
import { listAccounts } from '../repos/accounts';
import { ClaudeError, claudeErrorFromResult, claudeNotInstalled, spawnClaudeStream, type StreamExec } from '../services/claude';
import { listBudgetedEnvelopes } from '../services/state';
import { validateActions } from './actions';
import { answerJsonSchema, buildAskSystemPrompt, stepText } from './prompt';
import { openReadOnly, runReadOnlyQuery } from './query';

export const ASK_TIMEOUT_MS = 120_000;
const mcpScript = fileURLToPath(new URL('./mcp-server.ts', import.meta.url));
const tsxBin = fileURLToPath(new URL('../../../node_modules/.bin/tsx', import.meta.url));

export type AskDeps = {
  stream?: StreamExec;
  /** Chemin de la base, vide pour une base en mémoire (tests). */
  dbPath: string;
  model?: string;
  newSessionId?: () => string;
  signal: AbortSignal;
};

type ResultEvent = { is_error?: boolean; result?: string; structured_output?: unknown; session_id?: string };

/**
 * Arguments de `claude -p` : contexte isolé (ni CLAUDE.md, ni skills, ni mémoire, prompt système de Runway),
 * aucun outil intégré, un seul outil MCP en lecture seule.
 */
export function askArgs(input: { question: string; sessionId: string | null; newSessionId: string; systemPrompt: string; dbPath: string; model?: string }): string[] {
  const mcp = { mcpServers: { runway: { command: tsxBin, args: [mcpScript], env: { RUNWAY_DB: input.dbPath } } } };
  const args = [
    '-p',
    '--setting-sources', '',
    '--settings', JSON.stringify({ autoMemoryEnabled: false }),
    '--system-prompt', input.systemPrompt,
    '--tools', '',
    '--mcp-config', JSON.stringify(mcp),
    '--strict-mcp-config',
    '--allowedTools', 'mcp__runway__query',
    '--output-format', 'stream-json',
    '--verbose',
    '--json-schema', JSON.stringify(answerJsonSchema),
  ];
  if (input.sessionId) args.push('--resume', input.sessionId);
  else args.push('--session-id', input.newSessionId);
  if (input.model) args.push('--model', input.model);
  args.push(input.question);
  return args;
}

/** Pose la question à Claude et émet les étapes puis la réponse, ou une erreur. Ne lève jamais. */
export async function runAsk(db: Db, input: AskRequest & { today: ISODate }, deps: AskDeps, emit: (e: AskStreamEvent) => void): Promise<void> {
  const newSessionId = (deps.newSessionId ?? randomUUID)();
  // Dossier dédié : les sessions de Demander sont rangées à part, hors de `claude --resume` du dépôt.
  const cwd = join(deps.dbPath ? dirname(deps.dbPath) : 'tmp', 'claude-ask');
  try {
    mkdirSync(cwd, { recursive: true });
    const args = askArgs({
      question: input.question,
      sessionId: input.sessionId,
      newSessionId,
      systemPrompt: buildAskSystemPrompt({ today: input.today, envelopes: listBudgetedEnvelopes(db, input.today), accounts: listAccounts(db) }),
      dbPath: deps.dbPath,
      model: deps.model,
    });

    let final: ResultEvent | null = null;
    // Sans serveur de données, Claude répondrait à l'aveugle : on coupe tout de suite.
    let dataUnavailable = false;
    const internal = new AbortController();
    const { exitCode, stderr } = await (deps.stream ?? spawnClaudeStream)(args, {
      cwd,
      timeoutMs: ASK_TIMEOUT_MS,
      signal: AbortSignal.any([deps.signal, internal.signal]),
      onLine: (text) => {
        const event = parseLine(text);
        if (event?.type === 'system' && event.subtype === 'init') {
          const runway = event.mcp_servers?.find((s) => s.name === 'runway');
          if (runway?.status !== 'connected') {
            dataUnavailable = true;
            internal.abort();
          }
        }
        if (event?.type === 'assistant') {
          for (const block of event.message?.content ?? []) {
            if (block.type === 'tool_use' && block.name === 'mcp__runway__query') emit({ event: 'step', data: { text: stepText(String(block.input?.sql ?? '')) } });
          }
        }
        if (event?.type === 'result') final = event as ResultEvent;
      },
    });
    if (dataUnavailable) throw new ClaudeError('Runway n’a pas pu ouvrir ta base pour Claude (serveur de données injoignable)', 'ask_data_unavailable', 503);
    if (exitCode === 130) return;
    if (exitCode === 127) throw claudeNotInstalled();
    if (exitCode === 124) throw new ClaudeError('Claude a mis trop de temps à répondre', 'claude_timeout', 504);
    const result = final as ResultEvent | null;
    const resultError = result ? claudeErrorFromResult(result) : null;
    if (resultError) throw resultError;
    const parsed = askAnswerSchema.safeParse(result?.structured_output);
    if (!parsed.success) throw new ClaudeError(`Réponse de Claude illisible${stderr ? ` : ${stderr.slice(0, 200)}` : ''}`, 'claude_invalid_output');

    // Les actions simplement invalides (enveloppe inconnue, etc.) sont écartées sans un mot ; seuls les refus
    // avec un motif explicite (budget sous les charges fixes) ont quelque chose à dire à l'utilisateur.
    const { actions, reasons } = validateActions(db, parsed.data.actions, input.today);
    emit({
      event: 'answer',
      data: {
        sessionId: result?.session_id ?? input.sessionId ?? newSessionId,
        answer: parsed.data.answer,
        highlight: parsed.data.highlight,
        chart: parsed.data.chart ? runChart(db, deps.dbPath, parsed.data.chart) : null,
        actions,
        notices: reasons,
      },
    });
  } catch (err) {
    const e = err instanceof ClaudeError ? err : new ClaudeError((err as Error).message, 'claude_error');
    emit({ event: 'error', data: { message: e.message, code: e.code } });
  }
}

type StreamLine = {
  type?: string;
  subtype?: string;
  mcp_servers?: { name: string; status: string }[];
  message?: { content?: { type?: string; name?: string; input?: { sql?: unknown } }[] };
};

function parseLine(text: string): StreamLine | null {
  try {
    return JSON.parse(text) as StreamLine;
  } catch {
    return null;
  }
}

const CHART_MAX_ROWS = 60;

/**
 * Exécute la requête du graphique en lecture seule. Les lignes de même libellé sont additionnées (une requête
 * oubliant son GROUP BY donne quand même les bons totaux) ; un résultat tronqué ou mal formé omet le graphique
 * plutôt que d'afficher des chiffres faux.
 */
function runChart(db: Db, dbPath: string, chart: { kind: 'bar' | 'line'; title: string; sql: string }): AskChart | null {
  // En production la base a toujours un chemin : le graphique passe par une connexion en lecture seule.
  const conn: Database.Database = dbPath ? openReadOnly(dbPath) : db.$client;
  try {
    const { rows, truncated } = runReadOnlyQuery(conn, chart.sql, 1000);
    if (truncated || rows.length === 0) return null;
    const totals = new Map<string, number>();
    for (const { label, value } of rows) {
      if (typeof label !== 'string' || typeof value !== 'number') return null;
      totals.set(label, (totals.get(label) ?? 0) + value);
    }
    if (totals.size > CHART_MAX_ROWS) return null;
    return { kind: chart.kind, title: chart.title, rows: [...totals].map(([label, value]) => ({ label, value: Math.round(value) })) };
  } catch {
    return null;
  } finally {
    if (dbPath) conn.close();
  }
}
