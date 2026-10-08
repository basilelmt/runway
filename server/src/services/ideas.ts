import { filterSummary, ideasSummary, simpleReturn, trailingReturn } from '@core/invest';
import type { IdeaRunStart, IdeaRunView, IdeasView, IdeaView } from '@shared/api-types';
import { addDays, compareISODate, daysBetween, toISODate, type ISODate } from '@shared/dates';
import { BENCHMARK_TICKER, IDEA_ANGLES, type IdeaAngle } from '@shared/invest';
import { ideaBatchSchema, ideaCandidateSchema, ideaReviewBatchSchema, ideaReviewSchema, type IdeaCandidate, type IdeaReview } from '@shared/schemas';
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
  setRunPhase,
  type IdeaRow,
  type IdeaRunRow,
} from '../repos/ideas';
import { ClaudeError, execClaude, runClaude, type Exec } from './claude';
import { buildResearchPrompt, buildReviewPrompt, researchJsonSchema, reviewJsonSchema, type MarketFacts } from './idea-prompts';
import type { Prices } from './prices';

export const RESEARCH_TIMEOUT_MS = 600_000;
export const REVIEW_TIMEOUT_MS = 900_000;
export const WEEK_DAYS = 7;
export const NOT_REVIEWED = 'Non évaluée par le critique';
const RECENT_DAYS = 28;
const MIN_HORIZON_DAYS = 7;
const MAX_HORIZON_DAYS = 366;
/** Historique demandé pour la variation sur 3 mois, avec une marge pour les jours sans cotation. */
const HISTORY_DAYS = 100;
/** Après une fournée hebdomadaire en échec, on attend ce délai avant de relancer Claude tout seul. */
const RETRY_AFTER_FAILURE_HOURS = 24;
/** Une clôture plus ancienne que ce nombre de jours avant l'horizon ne suffit pas à juger une idée. */
const CLOSE_TOLERANCE_DAYS = 7;
const WEB_TOOLS = 'WebSearch,WebFetch';

export type IdeasDeps = { exec?: Exec; prices: Prices; now?: () => Date; model?: string };

type Rejection = { ticker: string; reason: string };
type Proposed = { angle: IdeaAngle; raw: unknown };
/** Piste qui a passé les filtres du serveur, en attente du critique. */
type Pending = { angle: IdeaAngle; candidate: IdeaCandidate; priceEur: number; market: MarketFacts };

export function toRunView(row: IdeaRunRow): IdeaRunView {
  return {
    id: row.id,
    trigger: row.trigger,
    status: row.status,
    phase: row.phase,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    acceptedCount: row.acceptedCount,
    candidateCount: row.candidateCount,
    failedAngles: (JSON.parse(row.failedAngles) as IdeaAngle[]).map((key) => ({ key, label: IDEA_ANGLES.find((a) => a.key === key)?.label ?? key })),
    rejected: JSON.parse(row.rejected) as IdeaRunView['rejected'],
    error: row.error,
  };
}

const todayOf = (d: Date): ISODate => toISODate(d);

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
    const ageHours = (row: IdeaRunRow | null) => (row ? (now().getTime() - Date.parse(row.startedAt)) / 3_600_000 : Infinity);
    if (ageHours(lastSuccessfulRun(db)) < WEEK_DAYS * 24) return skip(latestRun(db));
    const latest = latestRun(db);
    if (latest?.status === 'failed' && ageHours(latest) < RETRY_AFTER_FAILURE_HOURS) return skip(latest);
  }

  const run = createRun(db, trigger, now().toISOString());
  const done = execute(db, deps, run.id, todayOf(now())).catch((e: unknown) => {
    if (!(e instanceof ClaudeError)) console.error(e);
    try {
      finishRun(db, run.id, { status: 'failed', finishedAt: now().toISOString(), error: e instanceof ClaudeError ? e.message : 'Erreur inattendue' });
    } catch (inner) {
      console.error(inner);
    }
  });
  return { start: { run: toRunView(run), started: true }, done };
}

async function execute(db: Db, deps: IdeasDeps, runId: number, today: ISODate): Promise<void> {
  const now = deps.now ?? (() => new Date());
  // La référence d'abord : sans elle, inutile de faire chercher Claude pendant plusieurs minutes.
  const bench = await deps.prices.quoteEur(BENCHMARK_TICKER);
  if (!bench) throw new ClaudeError('Cours du S&P 500 indisponible', 'benchmark_unavailable');

  const { proposed, failedAngles } = await research(db, deps, today);
  const { pending, rejected } = await screen(db, deps.prices, proposed, today);

  let reviews = new Map<string, IdeaReview>();
  let benchMarket: MarketFacts = { perf1m: null, perf3m: null };
  if (pending.length > 0) {
    benchMarket = await marketFacts(deps.prices, BENCHMARK_TICKER, today);
    setRunPhase(db, runId, 'review');
    reviews = await review(deps, today, pending, benchMarket);
  }

  db.transaction((tx) => {
    const t = tx as unknown as Db;
    let kept = 0;
    for (const p of pending) {
      const r = reviews.get(p.candidate.ticker);
      if (r?.verdict === 'kept') kept++;
      else rejected.push({ ticker: p.candidate.ticker, reason: r?.reason ?? NOT_REVIEWED });
      insertIdea(t, runId, today, {
        ...p.candidate,
        angle: p.angle,
        verdict: r?.verdict ?? 'dropped',
        critique: r?.reason ?? NOT_REVIEWED,
        pricedIn: r?.pricedIn ?? '',
        risk: r?.risk ?? null,
        perf1m: p.market.perf1m,
        perf3m: p.market.perf3m,
        benchPerf1m: benchMarket.perf1m,
        benchPerf3m: benchMarket.perf3m,
        startPriceEur: p.priceEur,
        benchStartPriceEur: bench.eur,
      });
    }
    finishRun(t, runId, { status: 'done', finishedAt: now().toISOString(), acceptedCount: kept, candidateCount: proposed.length, failedAngles, rejected });
  });
}

const invalidOutput = () => new ClaudeError('Réponse de Claude invalide (format inattendu)', 'claude_invalid_output');

function claudeArgs(deps: IdeasDeps, schema: object, prompt: string): string[] {
  const args = ['-p', '--tools', WEB_TOOLS, '--allowedTools', WEB_TOOLS, '--output-format', 'json', '--json-schema', JSON.stringify(schema)];
  if (deps.model) args.push('--model', deps.model);
  args.push(prompt);
  return args;
}

/** Lance les quatre chercheurs en parallèle ; la fournée n'échoue que si aucun n'a répondu. */
async function research(db: Db, deps: IdeasDeps, today: ISODate): Promise<{ proposed: Proposed[]; failedAngles: IdeaAngle[] }> {
  const context = {
    today,
    holdings: listHoldings(db).map(({ name, ticker }) => ({ name, ticker })),
    recent: listIdeas(db, { since: addDays(today, -RECENT_DAYS) }).map(({ title, ticker, verdict }) => ({ title, ticker, dropped: verdict === 'dropped' })),
  };
  const results = await Promise.allSettled(
    IDEA_ANGLES.map(async ({ key }) => {
      const out = await runClaude(claudeArgs(deps, researchJsonSchema, buildResearchPrompt({ ...context, angle: key })), RESEARCH_TIMEOUT_MS, deps.exec ?? execClaude);
      const batch = ideaBatchSchema.safeParse(out);
      if (!batch.success) throw invalidOutput();
      return batch.data.ideas.map((raw): Proposed => ({ angle: key, raw }));
    }),
  );
  const proposed: Proposed[] = [];
  const failedAngles: IdeaAngle[] = [];
  let firstError: unknown = undefined;
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') proposed.push(...r.value);
    else {
      failedAngles.push(IDEA_ANGLES[i]!.key);
      firstError ??= r.reason;
    }
  });
  if (failedAngles.length === IDEA_ANGLES.length) throw firstError;
  return { proposed, failedAngles };
}

/** Filtres du serveur (format, horizon, doublon, déjà détenu, déjà ouverte, ticker connu) et faits de marché. */
async function screen(db: Db, prices: Prices, proposed: Proposed[], today: ISODate): Promise<{ pending: Pending[]; rejected: Rejection[] }> {
  const rejected: Rejection[] = [];
  const pending: Pending[] = [];
  const held = new Set(listHoldings(db).map((h) => h.ticker));
  // Une écartée encore ouverte ne bloque pas : seule une idée affichée occupe l'actif.
  const open = new Set(listIdeas(db, { status: 'open', shown: true }).map((i) => i.ticker));
  const seen = new Set<string>();
  for (const { angle, raw } of proposed) {
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
    if (held.has(c.ticker)) {
      rejected.push({ ticker: c.ticker, reason: 'Déjà détenu' });
      continue;
    }
    if (open.has(c.ticker)) {
      rejected.push({ ticker: c.ticker, reason: 'Idée déjà en cours sur cet actif' });
      continue;
    }
    seen.add(c.ticker);
    const quote = await prices.quoteEur(c.ticker);
    if (!quote) {
      rejected.push({ ticker: c.ticker, reason: 'Ticker introuvable chez Yahoo' });
      continue;
    }
    pending.push({ angle, candidate: c, priceEur: quote.eur, market: await marketFacts(prices, c.ticker, today) });
  }
  return { pending, rejected };
}

async function marketFacts(prices: Prices, ticker: string, today: ISODate): Promise<MarketFacts> {
  const h = await prices.historyEur(ticker, addDays(today, -HISTORY_DAYS));
  if (!h) return { perf1m: null, perf3m: null };
  return { perf1m: trailingReturn(h.closesEur, today, 30), perf3m: trailingReturn(h.closesEur, today, 91) };
}

/** Le critique rend un verdict par piste ; un verdict illisible ou sur un actif non soumis est ignoré. */
async function review(deps: IdeasDeps, today: ISODate, pending: Pending[], bench: MarketFacts): Promise<Map<string, IdeaReview>> {
  const prompt = buildReviewPrompt({ today, bench, candidates: pending.map((p) => ({ ...p.candidate, market: p.market })) });
  const out = await runClaude(claudeArgs(deps, reviewJsonSchema, prompt), REVIEW_TIMEOUT_MS, deps.exec ?? execClaude);
  const batch = ideaReviewBatchSchema.safeParse(out);
  if (!batch.success) throw invalidOutput();
  const submitted = new Set(pending.map((p) => p.candidate.ticker));
  const reviews = new Map<string, IdeaReview>();
  for (const raw of batch.data.reviews) {
    const r = ideaReviewSchema.safeParse(raw);
    if (r.success && submitted.has(r.data.ticker) && !reviews.has(r.data.ticker)) reviews.set(r.data.ticker, r.data);
  }
  return reviews;
}

/** Clôt les idées dont l'horizon est passé, avec les clôtures du jour de l'horizon (à défaut, la dernière avant). */
export async function closeDueIdeas(db: Db, prices: Prices, today: ISODate): Promise<void> {
  for (const idea of listIdeas(db, { status: 'open' })) {
    if (compareISODate(idea.horizon, today) >= 0) continue;
    const [end, benchEnd] = await Promise.all([prices.closeEurOn(idea.ticker, idea.horizon), prices.closeEurOn(BENCHMARK_TICKER, idea.horizon)]);
    // Le verdict est figé pour toujours : on attend des cours frais et proches de l'horizon.
    const usable = (p: typeof end) => p !== null && !p.stale && daysBetween(p.date, idea.horizon) <= CLOSE_TOLERANCE_DAYS;
    if (!usable(end) || !usable(benchEnd)) continue;
    const ret = simpleReturn(idea.startPriceEur, end!.eur);
    const benchRet = simpleReturn(idea.benchStartPriceEur, benchEnd!.eur);
    if (ret !== null && benchRet !== null) closeIdea(db, idea.id, ret, benchRet);
  }
}

function toView(row: IdeaRow, current: { ret: number | null; benchRet: number | null; date: ISODate | null }): IdeaView {
  return {
    id: row.id,
    createdOn: row.createdOn,
    title: row.title,
    event: row.event,
    sources: JSON.parse(row.sources) as string[],
    reasoning: JSON.parse(row.reasoning) as string[],
    pricedIn: row.pricedIn,
    risk: row.risk,
    marketContext: row.perf3m !== null && row.benchPerf3m !== null ? { perf3m: row.perf3m, benchPerf3m: row.benchPerf3m } : null,
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
  const open = listIdeas(db, { status: 'open', shown: true });
  const closedAll = listIdeas(db, { status: 'closed' });
  const closed = closedAll.filter((r) => r.verdict !== 'dropped');

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

  const results = (rows: IdeaRow[]) =>
    rows.flatMap((r) => (r.finalReturn !== null && r.benchFinalReturn !== null ? [{ return: r.finalReturn, benchReturn: r.benchFinalReturn }] : []));
  const summary = {
    ...ideasSummary(results(closed)),
    filter: filterSummary(results(closedAll.filter((r) => r.verdict === 'kept')), results(closedAll.filter((r) => r.verdict === 'dropped'))),
  };
  const last = latestRun(db);

  return { open: openViews, closed: closedViews, summary, lastRun: last ? toRunView(last) : null };
}
