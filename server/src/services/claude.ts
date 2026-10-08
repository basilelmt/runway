import { spawn } from 'node:child_process';
import { suggestionResultSchema, type Envelope, type SortingRule, type SuggestionResult, type Transaction } from '@shared/schemas';
import { AppError } from '../errors';

export class ClaudeError extends AppError {
  constructor(message: string, code: string, status = 502) {
    super(message, status, code);
  }
}

export type ExecResult = { stdout: string; stderr: string; exitCode: number };
export type Exec = (args: string[], timeoutMs: number) => Promise<ExecResult>;

export type ClaudeSortInput = {
  transactions: Pick<Transaction, 'id' | 'date' | 'label' | 'amount'>[];
  envelopes: Pick<Envelope, 'id' | 'name'>[];
  rules: Pick<SortingRule, 'pattern' | 'envelopeId'>[];
  examples: { label: string; envelopeId: number }[];
  model?: string;
};

export const BATCH_SIZE = 60;
export const TIMEOUT_MS = 120_000;

/**
 * Schéma de sortie imposé à Claude. Écrit à la main : `claude --json-schema` refuse les schémas
 * générés par zod (mots-clés `$schema`, bornes numériques...). La réponse est de toute façon
 * revalidée avec `suggestionResultSchema`.
 */
const outputJsonSchema = {
  type: 'object',
  properties: {
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          transactionId: { type: 'integer' },
          envelopeId: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
          reason: { type: 'string' },
        },
        required: ['transactionId', 'envelopeId', 'reason'],
      },
    },
    rules: {
      type: 'array',
      items: {
        type: 'object',
        properties: { pattern: { type: 'string' }, envelopeId: { type: 'integer' } },
        required: ['pattern', 'envelopeId'],
      },
    },
  },
  required: ['suggestions', 'rules'],
};

/** Exécute le binaire `claude` en mode headless, sans aucun outil ni entrée standard. */
export const execClaude: Exec = (args, timeoutMs) =>
  new Promise((resolve) => {
    // CLAUDECODE vide : évite le refus de démarrer quand le serveur tourne lui-même sous Claude Code.
    const child = spawn('claude', args, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CLAUDECODE: '' } });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    child.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      resolve({ stdout: '', stderr: err.message, exitCode: err.code === 'ENOENT' ? 127 : 1 });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) return resolve({ stdout, stderr: 'TIMEOUT', exitCode: 124 });
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });
  });

export function buildPrompt(input: ClaudeSortInput): string {
  const envelopes = input.envelopes.map((e) => `- ${e.id} : ${e.name}`).join('\n');
  const rules = input.rules.length
    ? input.rules.map((r) => `- "${r.pattern}" -> enveloppe ${r.envelopeId}`).join('\n')
    : '(aucune)';
  const examples = input.examples.length
    ? input.examples.map((e) => `- "${e.label}" -> enveloppe ${e.envelopeId}`).join('\n')
    : '(aucun)';
  const transactions = input.transactions
    .map((t) => `- id ${t.id} | ${t.date} | ${(t.amount / 100).toFixed(2)} € | ${t.label}`)
    .join('\n');

  return `Tu aides à ranger des dépenses bancaires dans des enveloppes de budget.

Enveloppes disponibles (id : nom) :
${envelopes}

Règles de tri déjà existantes (motif contenu dans le libellé -> enveloppe) :
${rules}

Exemples de dépenses déjà rangées par l'utilisateur :
${examples}

Dépenses à ranger :
${transactions}

Consignes :
- Pour chaque dépense, propose l'id de l'enveloppe la plus plausible, ou null si tu n'as vraiment aucune idée.
- Donne une justification très courte (quelques mots) dans "reason".
- Suggère dans "rules" de nouvelles règles réutilisables : un motif court et stable extrait du libellé (nom de l'enseigne, sans date ni numéro de carte), avec l'enveloppe. Ne répète pas une règle existante. Ne propose une règle que si le motif désigne clairement une enseigne ou un créancier récurrent.
- Réponds uniquement avec le JSON demandé.`;
}

/**
 * Lance `claude -p` avec les arguments donnés et renvoie la sortie structurée (`structured_output`).
 * Traduit les échecs connus (absent, non connecté, délai dépassé, réponse illisible) en `ClaudeError`.
 */
export async function runClaude(args: string[], timeoutMs: number, exec: Exec): Promise<unknown> {
  const result = await exec(args, timeoutMs);
  if (result.exitCode === 127) throw new ClaudeError("Claude Code n'est pas installé (binaire `claude` introuvable)", 'claude_not_installed', 503);
  if (result.exitCode === 124) throw new ClaudeError('Claude a mis trop de temps à répondre', 'claude_timeout', 504);

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw new ClaudeError(`Réponse de Claude illisible${result.stderr ? ` : ${result.stderr.slice(0, 200)}` : ''}`, 'claude_invalid_output');
  }
  const envelope = parsed as { is_error?: boolean; result?: string; structured_output?: unknown };
  const error = claudeErrorFromResult(envelope);
  if (error) throw error;
  return envelope.structured_output;
}

/** Erreur portée par l'enveloppe de résultat de `claude -p` (non connecté, erreur signalée), ou null. */
export function claudeErrorFromResult(envelope: { is_error?: boolean; result?: string }): ClaudeError | null {
  if (typeof envelope.result === 'string' && /not logged in/i.test(envelope.result)) {
    return new ClaudeError('Claude Code n\'est pas connecté : lance `claude` dans un terminal et fais /login', 'claude_not_logged_in', 503);
  }
  if (envelope.is_error) return new ClaudeError(`Claude a renvoyé une erreur : ${envelope.result ?? 'inconnue'}`, 'claude_error');
  return null;
}

export type StreamExec = (
  args: string[],
  opts: { cwd: string; timeoutMs: number; signal: AbortSignal; onLine: (line: string) => void },
) => Promise<{ stderr: string; exitCode: number }>;

/** Lance `claude` et transmet sa sortie ligne à ligne (`--output-format stream-json`). 124 = délai dépassé, 130 = interrompu. */
export const spawnClaudeStream: StreamExec = (args, { cwd, timeoutMs, signal, onLine }) =>
  new Promise((resolve) => {
    const child = spawn('claude', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CLAUDECODE: '' } });
    let buffer = '';
    let stderr = '';
    let reason: 'timeout' | 'abort' | null = null;
    let settled = false;
    const kill = (why: 'timeout' | 'abort') => {
      reason = why;
      child.kill('SIGKILL');
    };
    const timer = setTimeout(() => kill('timeout'), timeoutMs);
    const onAbort = () => kill('abort');
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
    const flush = (all: boolean) => {
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const text = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (text) onLine(text);
      }
      if (all && buffer.trim()) onLine(buffer.trim());
    };
    child.stdout.on('data', (d: Buffer) => {
      buffer += d.toString();
      flush(false);
    });
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    const done = (exitCode: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      flush(true);
      resolve({ stderr, exitCode: reason === 'timeout' ? 124 : reason === 'abort' ? 130 : exitCode });
    };
    child.on('error', (err: NodeJS.ErrnoException) => {
      stderr = err.message;
      done(err.code === 'ENOENT' ? 127 : 1);
    });
    child.on('close', (code) => done(code ?? 1));
  });

async function runBatch(batch: ClaudeSortInput, exec: Exec): Promise<SuggestionResult> {
  const args = ['-p', '--tools', '', '--output-format', 'json', '--json-schema', JSON.stringify(outputJsonSchema)];
  if (batch.model) args.push('--model', batch.model);
  args.push(buildPrompt(batch));

  const validated = suggestionResultSchema.safeParse(await runClaude(args, TIMEOUT_MS, exec));
  if (!validated.success) throw new ClaudeError('Réponse de Claude invalide (format inattendu)', 'claude_invalid_output');
  return validated.data;
}

export type ClaudeSortResult = SuggestionResult & { warning?: string };

/**
 * Lance Claude par lots et concatène les suggestions. Ne modifie rien en base.
 * Si un lot échoue alors que d'autres ont réussi, renvoie ce qui a été obtenu avec un avertissement
 * plutôt que de tout perdre (utile quand la limite de session Claude tombe au milieu).
 */
export async function runClaudeSort(input: ClaudeSortInput, deps: { exec?: Exec } = {}): Promise<ClaudeSortResult> {
  const exec = deps.exec ?? execClaude;
  const out: ClaudeSortResult = { suggestions: [], rules: [] };
  if (input.transactions.length === 0) return out;

  const validEnvelopes = new Set(input.envelopes.map((e) => e.id));
  const validTransactions = new Set(input.transactions.map((t) => t.id));
  const seenRules = new Set(input.rules.map((r) => r.pattern.toLowerCase()));

  for (let i = 0; i < input.transactions.length; i += BATCH_SIZE) {
    const batch = { ...input, transactions: input.transactions.slice(i, i + BATCH_SIZE) };
    let result: SuggestionResult;
    try {
      result = await runBatch(batch, exec);
    } catch (err) {
      if (i === 0 || !(err instanceof ClaudeError)) throw err;
      out.warning = `${err.message}. ${out.suggestions.length} suggestions obtenues sur ${input.transactions.length} opérations.`;
      break;
    }
    for (const s of result.suggestions) {
      if (!validTransactions.has(s.transactionId)) continue;
      out.suggestions.push({ ...s, envelopeId: s.envelopeId !== null && validEnvelopes.has(s.envelopeId) ? s.envelopeId : null });
    }
    for (const r of result.rules) {
      const key = r.pattern.toLowerCase();
      if (!validEnvelopes.has(r.envelopeId) || seenRules.has(key)) continue;
      seenRules.add(key);
      out.rules.push(r);
    }
  }
  return out;
}
