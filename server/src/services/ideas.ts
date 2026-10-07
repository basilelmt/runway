import { ideasSummary, simpleReturn } from '@core/invest';
import type { IdeaRunStart, IdeaRunView, IdeasView, IdeaView } from '@shared/api-types';
import { addDays, compareISODate, type ISODate } from '@shared/dates';
import { BENCHMARK_TICKER, platforms } from '@shared/invest';
import { ideaBatchSchema, ideaCandidateSchema, type IdeaCandidate } from '@shared/schemas';
import type { Db } from '../db/client';
import { listHoldings } from '../repos/invest';
import {
  closeIdea,
  createRun,
  finishRun,
  insertIdea,
  lastSuccessfulRun,
  latestRun,
  listIdeas,
  runningRun,
  type IdeaRow,
  type IdeaRunRow,
} from '../repos/ideas';
import { ClaudeError, execClaude, runClaude, type Exec } from './claude';
import type { Prices } from './prices';

export const IDEAS_TIMEOUT_MS = 600_000;
export const WEEK_DAYS = 7;
const RECENT_DAYS = 28;
const MIN_HORIZON_DAYS = 7;
const MAX_HORIZON_DAYS = 366;

export type IdeasDeps = { exec?: Exec; prices: Prices; now?: () => Date; model?: string };

/** Schéma imposé à Claude, écrit à la main comme celui du tri (`--json-schema` refuse les schémas zod). */
const ideasJsonSchema = {
  type: 'object',
  properties: {
    ideas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          event: { type: 'string' },
          sourceUrl: { type: 'string' },
          reasoning: { type: 'array', items: { type: 'string' } },
          pricedIn: { type: 'string' },
          ticker: { type: 'string' },
          assetName: { type: 'string' },
          whereToBuy: { type: 'string', enum: [...platforms] },
          horizon: { type: 'string' },
        },
        required: ['title', 'event', 'sourceUrl', 'reasoning', 'pricedIn', 'ticker', 'assetName', 'whereToBuy', 'horizon'],
      },
    },
  },
  required: ['ideas'],
};

export function buildIdeasPrompt(input: { today: ISODate; holdings: { name: string; ticker: string }[]; recent: { title: string; ticker: string }[] }): string {
  const holdings = input.holdings.length ? input.holdings.map((h) => `- ${h.name} (${h.ticker})`).join('\n') : '(aucune)';
  const recent = input.recent.length ? input.recent.map((i) => `- ${i.title} (${i.ticker})`).join('\n') : '(aucune)';
  return `Nous sommes le ${input.today}. Tu aides un particulier français à trouver des idées d'investissement tirées de l'actualité.

Positions déjà détenues :
${holdings}

Idées déjà proposées ces 4 dernières semaines :
${recent}

Consignes :
- Cherche sur le web l'actualité des derniers jours et les événements datés à venir : fêtes, saisons, sorties de produits, décisions publiques, salons, compétitions sportives, météo, pénuries...
- Propose 3 à 5 idées. Chacune part d'un événement précis, avec l'URL de l'article que tu as lu dans "sourceUrl".
- La déduction tient en 2 ou 3 étapes simples dans "reasoning", du type : "La fête des nouilles approche" → "Les gens vont acheter des baguettes" → "Le fabricant de baguettes va vendre plus".
- Vise un actif coté précis et donne son ticker Yahoo Finance exact, avec le suffixe de place : .PA (Paris), .DE (Xetra), .AS (Amsterdam), .L (Londres), .T (Tokyo), .KS (Séoul), rien pour les actions américaines, -EUR pour une crypto (BTC-EUR), =F pour un contrat à terme (GC=F).
- "horizon" : la date (YYYY-MM-DD) à laquelle juger l'idée, entre 7 jours et 1 an après aujourd'hui.
- "whereToBuy" : "trade_republic" pour les actions et ETF européens et américains, "binance" pour les cryptos, sinon "other".
- "pricedIn" : dis honnêtement si le marché a probablement déjà intégré l'événement dans le cours, en une ou deux phrases.
- "title" : une phrase courte qui résume l'idée.
- Ne repropose ni un actif déjà détenu ni une idée récente.
- Réponds uniquement avec le JSON demandé.`;
}

export function toRunView(row: IdeaRunRow): IdeaRunView {
  return {
    id: row.id,
    trigger: row.trigger,
    status: row.status,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    acceptedCount: row.acceptedCount,
    rejected: JSON.parse(row.rejected) as IdeaRunView['rejected'],
    error: row.error,
  };
}

const todayOf = (d: Date): ISODate => d.toISOString().slice(0, 10);

/**
 * Lance une fournée sauf si une est déjà en cours, ou, pour la fournée hebdomadaire, si la dernière réussie a moins de 7 jours.
 * `done` se résout quand la fournée est finie et n'est jamais rejetée.
 */
export function startIdeaRun(db: Db, deps: IdeasDeps, trigger: 'manual' | 'weekly'): { start: IdeaRunStart; done: Promise<void> } {
  const now = deps.now ?? (() => new Date());
  const skip = (row: IdeaRunRow | null) => ({ start: { run: row ? toRunView(row) : null, started: false }, done: Promise.resolve() });

  const running = runningRun(db);
  if (running) return skip(running);
  if (trigger === 'weekly') {
    const last = lastSuccessfulRun(db);
    if (last && now().getTime() - Date.parse(last.startedAt) < WEEK_DAYS * 24 * 3600 * 1000) return skip(latestRun(db));
  }

  const run = createRun(db, trigger, now().toISOString());
  const done = execute(db, deps, run.id, todayOf(now())).catch((e: unknown) => {
    if (!(e instanceof ClaudeError)) console.error(e);
    finishRun(db, run.id, { status: 'failed', finishedAt: now().toISOString(), error: e instanceof ClaudeError ? e.message : 'Erreur inattendue' });
  });
  return { start: { run: toRunView(run), started: true }, done };
}

async function execute(db: Db, deps: IdeasDeps, runId: number, today: ISODate): Promise<void> {
  const now = deps.now ?? (() => new Date());
  const prompt = buildIdeasPrompt({
    today,
    holdings: listHoldings(db).map(({ name, ticker }) => ({ name, ticker })),
    recent: listIdeas(db, { since: addDays(today, -RECENT_DAYS) }).map(({ title, ticker }) => ({ title, ticker })),
  });
  const args = ['-p', '--tools', 'WebSearch', '--allowedTools', 'WebSearch', '--output-format', 'json', '--json-schema', JSON.stringify(ideasJsonSchema)];
  if (deps.model) args.push('--model', deps.model);
  args.push(prompt);

  const batch = ideaBatchSchema.safeParse(await runClaude(args, IDEAS_TIMEOUT_MS, deps.exec ?? execClaude));
  if (!batch.success) throw new ClaudeError('Réponse de Claude invalide (format inattendu)', 'claude_invalid_output');

  const bench = await deps.prices.quoteEur(BENCHMARK_TICKER);
  if (!bench) throw new ClaudeError('Cours du S&P 500 indisponible', 'benchmark_unavailable');

  const rejected: { ticker: string; reason: string }[] = [];
  const accepted: { candidate: IdeaCandidate; priceEur: number }[] = [];
  const seen = new Set<string>();
  for (const raw of batch.data.ideas) {
    const parsed = ideaCandidateSchema.safeParse(raw);
    const rawTicker = (raw as { ticker?: unknown } | null)?.ticker;
    if (!parsed.success) {
      rejected.push({ ticker: typeof rawTicker === 'string' ? rawTicker : '?', reason: 'Format invalide' });
      continue;
    }
    const c = parsed.data;
    if (compareISODate(c.horizon, addDays(today, MIN_HORIZON_DAYS)) < 0 || compareISODate(c.horizon, addDays(today, MAX_HORIZON_DAYS)) > 0) {
      rejected.push({ ticker: c.ticker, reason: 'Horizon hors limites' });
      continue;
    }
    if (seen.has(c.ticker)) {
      rejected.push({ ticker: c.ticker, reason: 'Doublon' });
      continue;
    }
    seen.add(c.ticker);
    const quote = await deps.prices.quoteEur(c.ticker);
    if (!quote) {
      rejected.push({ ticker: c.ticker, reason: 'Ticker introuvable chez Yahoo' });
      continue;
    }
    accepted.push({ candidate: c, priceEur: quote.eur });
  }

  db.transaction((tx) => {
    const t = tx as unknown as Db;
    for (const a of accepted) insertIdea(t, runId, today, a.candidate, { priceEur: a.priceEur, benchPriceEur: bench.eur });
    finishRun(t, runId, { status: 'done', finishedAt: now().toISOString(), acceptedCount: accepted.length, rejected });
  });
}

/** Clôt les idées dont l'horizon est passé, avec les clôtures du jour de l'horizon (à défaut, la dernière avant). */
export async function closeDueIdeas(db: Db, prices: Prices, today: ISODate): Promise<void> {
  for (const idea of listIdeas(db, { status: 'open' })) {
    if (compareISODate(idea.horizon, today) >= 0) continue;
    const [end, benchEnd] = await Promise.all([prices.closeEurOn(idea.ticker, idea.horizon), prices.closeEurOn(BENCHMARK_TICKER, idea.horizon)]);
    if (!end || !benchEnd) continue;
    const ret = simpleReturn(idea.startPriceEur, end.eur);
    const benchRet = simpleReturn(idea.benchStartPriceEur, benchEnd.eur);
    if (ret !== null && benchRet !== null) closeIdea(db, idea.id, ret, benchRet);
  }
}

function toView(row: IdeaRow, current: { ret: number | null; benchRet: number | null; date: ISODate | null }): IdeaView {
  return {
    id: row.id,
    createdOn: row.createdOn,
    title: row.title,
    event: row.event,
    sourceUrl: row.sourceUrl,
    reasoning: JSON.parse(row.reasoning) as string[],
    pricedIn: row.pricedIn,
    ticker: row.ticker,
    assetName: row.assetName,
    whereToBuy: row.whereToBuy,
    horizon: row.horizon,
    startPriceEur: row.startPriceEur,
    status: row.status,
    return: current.ret,
    benchReturn: current.benchRet,
    priceDate: current.date,
  };
}

export async function buildIdeasView(db: Db, prices: Prices, today: ISODate): Promise<IdeasView> {
  await closeDueIdeas(db, prices, today);
  const open = listIdeas(db, { status: 'open' });
  const closed = listIdeas(db, { status: 'closed' });

  const bench = open.length ? await prices.quoteEur(BENCHMARK_TICKER) : null;
  const openViews = await Promise.all(
    open.map(async (row) => {
      const q = await prices.quoteEur(row.ticker);
      return toView(row, {
        ret: q ? simpleReturn(row.startPriceEur, q.eur) : null,
        benchRet: bench ? simpleReturn(row.benchStartPriceEur, bench.eur) : null,
        date: q?.date ?? null,
      });
    }),
  );
  const closedViews = closed.map((row) => toView(row, { ret: row.finalReturn, benchRet: row.benchFinalReturn, date: row.horizon }));
  const summary = ideasSummary(closed.flatMap((r) => (r.finalReturn !== null && r.benchFinalReturn !== null ? [{ return: r.finalReturn, benchReturn: r.benchFinalReturn }] : [])));
  const last = latestRun(db);

  return { open: openViews, closed: closedViews, summary, lastRun: last ? toRunView(last) : null };
}
