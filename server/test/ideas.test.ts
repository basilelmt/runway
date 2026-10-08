import { describe, expect, it, vi } from 'vitest';
import { IDEA_ANGLES, type IdeaAngle } from '@shared/invest';
import { ideaCandidateSchema, ideaReviewSchema } from '@shared/schemas';
import { createHolding } from '../src/repos/invest';
import { listIdeas } from '../src/repos/ideas';
import type { Exec, ExecResult } from '../src/services/claude';
import { buildResearchPrompt, buildReviewPrompt } from '../src/services/idea-prompts';
import { marketFacts } from '../src/services/ideas';
import type { Prices } from '../src/services/prices';
import { chart, fakeFetch } from './fixtures/yahoo';
import { createTestApp } from './helpers';

const idea = (over: Record<string, unknown> = {}) => ({
  title: 'La fête des nouilles fait vendre des baguettes',
  event: 'La fête des nouilles a lieu le 20 octobre',
  sources: ['https://exemple.fr/fete-des-nouilles', 'https://exemple.jp/men-matsuri'],
  reasoning: ['La fête des nouilles approche', 'Les gens vont acheter des baguettes', 'Le fabricant de baguettes va vendre plus'],
  ticker: 'BAG.PA',
  assetName: 'Baguettes SA',
  whereToBuy: 'trade_republic',
  horizon: '2026-10-28',
  ...over,
});
const keep = (ticker: string) => ({ ticker, verdict: 'kept', reason: 'Personne n’en parle encore', pricedIn: 'Pas encore : le cours n’a pas bougé.', risk: 'La fête peut être annulée.' });
const drop = (ticker: string) => ({ ticker, verdict: 'dropped', reason: 'Déjà dans les prix', pricedIn: 'Oui : +20 % en 3 mois.', risk: 'Retournement.' });

const TIMEOUT: ExecResult = { stdout: '', stderr: 'TIMEOUT', exitCode: 124 };
const ALL_FAIL = { calendar: 'fail', international: 'fail', primary: 'fail', supply: 'fail' } as const;

function ok(structured: unknown): ExecResult {
  return { stdout: JSON.stringify({ is_error: false, result: 'ok', structured_output: structured }), stderr: '', exitCode: 0 };
}

const isReview = (args: string[]) => args.at(-1)!.includes('Tu es le critique');
const angleOf = (args: string[]): IdeaAngle => IDEA_ANGLES.find((a) => args.at(-1)!.includes(`Ton angle : ${a.label}.`))!.key;

type Script = { research?: Partial<Record<IdeaAngle, unknown[] | 'fail'>>; review?: unknown[] | 'fail' };

/** Faux `claude` : répond selon le prompt (chercheur d'un angle, ou critique), relu à chaque appel ; `gates` suspend une étape. */
function fakeClaude(script: Script, gates: { research?: Promise<void>; review?: Promise<void> } = {}) {
  return vi.fn<Exec>(async (args) => {
    if (isReview(args)) {
      await gates.review;
      return script.review === 'fail' ? TIMEOUT : ok({ reviews: script.review ?? [] });
    }
    await gates.research;
    const ideas = script.research?.[angleOf(args)] ?? [];
    return ideas === 'fail' ? TIMEOUT : ok({ ideas });
  });
}

function setup(exec: Exec) {
  const routes: Record<string, unknown> = {
    'chart/SXR8.DE': chart('SXR8.DE', 'EUR', [['2026-07-01', 650], ['2026-09-07', 690], ['2026-10-06', 700]], { date: '2026-10-07', price: 700 }),
    'chart/BAG.PA': chart('BAG.PA', 'EUR', [['2026-07-01', 10], ['2026-09-07', 11], ['2026-10-06', 11]], { date: '2026-10-07', price: 12 }),
    'chart/NOU.PA': chart('NOU.PA', 'EUR', [['2026-10-06', 30]], { date: '2026-10-07', price: 30 }),
    'chart/NOPE': { chart: { result: null, error: { code: 'Not Found' } } },
  };
  let now = new Date('2026-10-07T10:00:00Z');
  const runs: Promise<void>[] = [];
  const fetchFn = fakeFetch(routes);
  const t = createTestApp('2026-10-07', {
    exec,
    investDeps: { fetch: fetchFn, now: () => now, onRunStarted: (done) => runs.push(done) },
  });
  const settle = () => Promise.all(runs);
  return {
    ...t,
    routes,
    fetchCalls: fetchFn.calls,
    moveTo: (iso: string) => {
      now = new Date(`${iso}T10:00:00Z`);
      t.setToday(iso);
    },
    settle,
    /** Lance une fournée, attend sa fin et renvoie son état. */
    runOnce: async (trigger: 'manual' | 'weekly' = 'manual') => {
      const r = await t.call('POST', '/api/invest/ideas/runs', { trigger });
      await settle();
      return (await t.call('GET', `/api/invest/ideas/runs/${r.body.run.id}`)).body;
    },
  };
}

describe('prompts', () => {
  it('chercheur : angle, positions et idées récentes', () => {
    const p = buildResearchPrompt({
      today: '2026-10-07',
      angle: 'supply',
      holdings: [{ name: 'S&P 500', ticker: 'SXR8.DE' }],
      recent: [{ title: 'Cuivre', ticker: 'HG=F', dropped: false }, { title: 'Riz', ticker: 'ZR=F', dropped: true }],
    });
    expect(p).toContain('Nous sommes le 2026-10-07');
    expect(p).toContain('Ton angle : Approvisionnement.');
    expect(p).toContain('fournisseur du fournisseur');
    expect(p).toContain('- S&P 500 (SXR8.DE)');
    expect(p).toContain('- Cuivre (HG=F)');
    expect(p).toContain('- Riz (ZR=F), écartée');
  });

  it('critique : pistes, sources et variations de cours', () => {
    const p = buildReviewPrompt({
      today: '2026-10-07',
      bench: { perf1m: 0.01, perf3m: null },
      candidates: [{ ...idea(), market: { perf1m: -0.032, perf3m: 0.2 } }],
    });
    expect(p).toContain('Tu es le critique');
    expect(p).toContain('### BAG.PA - Baguettes SA');
    expect(p).toContain('- https://exemple.jp/men-matsuri');
    expect(p).toContain('Cours : -3,2 % sur 1 mois, +20,0 % sur 3 mois.');
    expect(p).toContain('S&P 500 : +1,0 % sur 1 mois, inconnue sur 3 mois.');
  });
});

describe('ideaCandidateSchema', () => {
  it('garde les sources http(s) valides et écarte les autres sans rejeter toute la piste', () => {
    const parsed = ideaCandidateSchema.parse(idea({ sources: ['javascript:alert(1)', 'https://exemple.fr/ok'] }));
    expect(parsed.sources).toEqual(['https://exemple.fr/ok']);
  });

  it('coupe les sources à 8', () => {
    const many = Array.from({ length: 10 }, (_, i) => `https://exemple.fr/${i}`);
    const parsed = ideaCandidateSchema.parse(idea({ sources: many }));
    expect(parsed.sources).toEqual(many.slice(0, 8));
  });

  it('dédoublonne les sources', () => {
    const parsed = ideaCandidateSchema.parse(idea({ sources: ['https://exemple.fr/a', 'https://exemple.fr/a', 'https://exemple.fr/b'] }));
    expect(parsed.sources).toEqual(['https://exemple.fr/a', 'https://exemple.fr/b']);
  });

  it('rejette une piste sans aucune source http(s) valide', () => {
    expect(() => ideaCandidateSchema.parse(idea({ sources: ['javascript:alert(1)'] }))).toThrow();
  });

  it('met le ticker en majuscules', () => {
    expect(ideaCandidateSchema.parse(idea({ ticker: 'bag.pa' })).ticker).toBe('BAG.PA');
  });
});

describe('ideaReviewSchema', () => {
  it('accepte un risque et un "pricedIn" vides, exige une raison et majuscule le ticker', () => {
    const r = ideaReviewSchema.parse({ ticker: 'bag.pa', verdict: 'kept', reason: 'Personne n’en parle', pricedIn: '', risk: '' });
    expect(r).toMatchObject({ ticker: 'BAG.PA', pricedIn: '', risk: '' });
    expect(() => ideaReviewSchema.parse({ ticker: 'BAG.PA', verdict: 'kept', reason: '', pricedIn: '', risk: '' })).toThrow();
  });
});

describe('marketFacts', () => {
  const fakePrices = (overrides: Partial<Prices>): Prices => ({
    search: async () => [],
    history: async () => null,
    historyEur: async () => null,
    closeEurOn: async () => null,
    quoteEur: async () => null,
    isUnknown: () => false,
    ...overrides,
  });

  it('renvoie des variations nulles quand l’historique est périmé', async () => {
    const prices = fakePrices({
      historyEur: async () => ({ ticker: 'BAG.PA', name: 'Baguettes', currency: 'EUR', closes: [], stale: true, closesEur: [{ date: '2026-10-07', close: 12 }] }),
    });
    expect(await marketFacts(prices, 'BAG.PA', '2026-10-07')).toEqual({ perf1m: null, perf3m: null });
  });

  it('renvoie des variations nulles quand la dernière clôture connue a plus de 7 jours', async () => {
    const prices = fakePrices({
      historyEur: async () => ({ ticker: 'BAG.PA', name: 'Baguettes', currency: 'EUR', closes: [], stale: false, closesEur: [{ date: '2026-09-20', close: 12 }] }),
    });
    expect(await marketFacts(prices, 'BAG.PA', '2026-10-07')).toEqual({ perf1m: null, perf3m: null });
  });
});

describe('fournées d’idées', () => {
  it('passe les pistes de tous les chercheurs au critique et n’affiche que les retenues', async () => {
    const exec = fakeClaude({
      research: { calendar: [idea()], international: [idea({ ticker: 'NOU.PA', assetName: 'Nouilles SA' })] },
      review: [keep('BAG.PA'), drop('NOU.PA')],
    });
    const t = setup(exec);
    const r = await t.call('POST', '/api/invest/ideas/runs', { trigger: 'manual' });
    expect(r).toMatchObject({ status: 202, body: { started: true, run: { status: 'running', phase: 'research' } } });
    await t.settle();

    expect(exec).toHaveBeenCalledTimes(5);
    const [researchArgs, researchTimeout] = exec.mock.calls.find(([a]) => !isReview(a))!;
    expect(researchArgs.slice(0, 5)).toEqual(['-p', '--tools', 'WebSearch,WebFetch', '--allowedTools', 'WebSearch,WebFetch']);
    expect(researchArgs).toContain('--json-schema');
    expect(researchTimeout).toBe(600_000);
    const [reviewArgs, reviewTimeout] = exec.mock.calls.find(([a]) => isReview(a))!;
    expect(reviewTimeout).toBe(900_000);
    expect(reviewArgs.at(-1)).toContain('Cours : +9,1 % sur 1 mois, +20,0 % sur 3 mois.');

    const run = await t.call('GET', `/api/invest/ideas/runs/${r.body.run.id}`);
    expect(run.body).toMatchObject({ status: 'done', phase: null, acceptedCount: 1, candidateCount: 2, failedAngles: [] });
    expect(run.body.rejected).toEqual([{ ticker: 'NOU.PA', reason: 'Déjà dans les prix' }]);

    const view = await t.call('GET', '/api/invest/ideas');
    expect(view.body.open).toHaveLength(1);
    expect(view.body.open[0]).toMatchObject({
      ticker: 'BAG.PA',
      startPriceEur: 12,
      sources: idea().sources,
      pricedIn: 'Pas encore : le cours n’a pas bougé.',
      risk: 'La fête peut être annulée.',
    });
    expect(view.body.open[0].marketContext.perf3m).toBeCloseTo(0.2);
    expect(view.body.open[0].marketContext.benchPerf3m).toBeCloseTo(700 / 650 - 1);

    const dropped = listIdeas(t.db).find((i) => i.ticker === 'NOU.PA')!;
    expect(dropped).toMatchObject({ verdict: 'dropped', critique: 'Déjà dans les prix', angle: 'international', perf3m: null });
  });

  it('continue sans un chercheur en échec et le signale', async () => {
    const t = setup(fakeClaude({ research: { calendar: [idea()], supply: 'fail' }, review: [keep('BAG.PA')] }));
    const run = await t.runOnce();
    expect(run).toMatchObject({ status: 'done', acceptedCount: 1, failedAngles: [{ key: 'supply', label: 'Approvisionnement' }] });
  });

  it('échoue si tous les chercheurs échouent, sans appeler le critique', async () => {
    const exec = fakeClaude({ research: { ...ALL_FAIL } });
    const t = setup(exec);
    const run = await t.runOnce();
    expect(run).toMatchObject({ status: 'failed', phase: null, error: 'Claude a mis trop de temps à répondre' });
    expect(exec.mock.calls.some(([a]) => isReview(a))).toBe(false);
  });

  it('échoue sans rien enregistrer si le critique échoue', async () => {
    const t = setup(fakeClaude({ research: { calendar: [idea()] }, review: 'fail' }));
    const run = await t.runOnce();
    expect(run).toMatchObject({ status: 'failed', error: 'Claude a mis trop de temps à répondre' });
    expect(listIdeas(t.db)).toEqual([]);
  });

  it('se termine sans idée quand le critique écarte tout', async () => {
    const t = setup(fakeClaude({ research: { calendar: [idea()] }, review: [drop('BAG.PA')] }));
    const run = await t.runOnce();
    expect(run).toMatchObject({ status: 'done', acceptedCount: 0, candidateCount: 1 });
    expect((await t.call('GET', '/api/invest/ideas')).body.open).toEqual([]);
  });

  it('n’appelle pas le critique quand aucune piste ne passe les filtres', async () => {
    const exec = fakeClaude({ research: { calendar: [idea({ ticker: 'NOPE' }), { ticker: 'X' }] } });
    const t = setup(exec);
    const run = await t.runOnce();
    expect(run).toMatchObject({ status: 'done', acceptedCount: 0, candidateCount: 2 });
    expect(run.rejected).toEqual([
      { ticker: 'NOPE', reason: 'Ticker introuvable chez Yahoo' },
      { ticker: 'X', reason: 'Format invalide' },
    ]);
    expect(exec).toHaveBeenCalledTimes(4);
  });

  it('écarte un horizon trop proche', async () => {
    const t = setup(fakeClaude({ research: { calendar: [idea({ horizon: '2026-10-09' })] } }));
    const run = await t.runOnce();
    expect(run).toMatchObject({ status: 'done', acceptedCount: 0, candidateCount: 1 });
    expect(run.rejected).toEqual([{ ticker: 'BAG.PA', reason: 'Horizon hors limites' }]);
  });

  it('écarte une idée sur un actif déjà détenu', async () => {
    const t = setup(fakeClaude({ research: { calendar: [idea()] } }));
    createHolding(t.db, { platform: 'trade_republic', ticker: 'BAG.PA', name: 'Baguettes SA', source: 'manual' });
    const run = await t.runOnce();
    expect(run).toMatchObject({ status: 'done', acceptedCount: 0, candidateCount: 1 });
    expect(run.rejected).toEqual([{ ticker: 'BAG.PA', reason: 'Déjà détenu' }]);
  });

  it('ne récupère qu’une fois l’historique Yahoo par ticker (cours servi depuis le cache)', async () => {
    const t = setup(fakeClaude({ research: { calendar: [idea()] }, review: [keep('BAG.PA')] }));
    await t.runOnce();
    const bagCalls = t.fetchCalls.filter((u) => u.includes('chart/BAG.PA')).length;
    expect(bagCalls).toBe(1);
  });

  it('écarte une piste sans verdict et ignore un verdict sur un actif non soumis', async () => {
    const t = setup(fakeClaude({ research: { calendar: [idea()] }, review: [keep('ZZZ')] }));
    const run = await t.runOnce();
    expect(run).toMatchObject({ acceptedCount: 0, rejected: [{ ticker: 'BAG.PA', reason: 'Non évaluée par le critique' }] });
    expect(listIdeas(t.db)[0]).toMatchObject({ verdict: 'dropped', critique: 'Non évaluée par le critique', pricedIn: '', risk: null });
  });

  it('garde une piste retenue même avec un risque vide', async () => {
    const t = setup(
      fakeClaude({
        research: { calendar: [idea()] },
        review: [{ ticker: 'BAG.PA', verdict: 'kept', reason: 'Personne n’en parle encore', pricedIn: '', risk: '' }],
      }),
    );
    const run = await t.runOnce();
    expect(run).toMatchObject({ acceptedCount: 1 });
    expect(listIdeas(t.db)[0]).toMatchObject({ verdict: 'kept', pricedIn: '', risk: null });
  });

  it('ignore la casse du ticker entre le chercheur et le critique', async () => {
    const t = setup(fakeClaude({ research: { calendar: [idea({ ticker: 'bag.pa' })] }, review: [keep('BAG.PA')] }));
    const run = await t.runOnce();
    expect(run).toMatchObject({ acceptedCount: 1 });
    expect(listIdeas(t.db)[0]).toMatchObject({ ticker: 'BAG.PA', verdict: 'kept' });
  });

  it('dédoublonne entre chercheurs ; une écartée ouverte ne bloque pas l’actif, une retenue si', async () => {
    const script: Script = { research: { calendar: [idea()], primary: [idea({ title: 'Autre angle' })] }, review: [drop('BAG.PA')] };
    const t = setup(fakeClaude(script));
    expect((await t.runOnce()).rejected).toEqual([
      { ticker: 'BAG.PA', reason: 'Doublon' },
      { ticker: 'BAG.PA', reason: 'Déjà dans les prix' },
    ]);

    script.review = [keep('BAG.PA')];
    expect(await t.runOnce()).toMatchObject({ acceptedCount: 1 });

    expect((await t.runOnce()).rejected).toContainEqual({ ticker: 'BAG.PA', reason: 'Idée déjà en cours sur cet actif' });
  });

  it('suit la phase de la fournée', async () => {
    let openResearch!: () => void;
    let openReview!: () => void;
    const research = new Promise<void>((r) => (openResearch = r));
    const review = new Promise<void>((r) => (openReview = r));
    const t = setup(fakeClaude({ research: { calendar: [idea()] }, review: [keep('BAG.PA')] }, { research, review }));
    const r = await t.call('POST', '/api/invest/ideas/runs', { trigger: 'manual' });
    const phase = async () => (await t.call('GET', `/api/invest/ideas/runs/${r.body.run.id}`)).body.phase;

    expect(await phase()).toBe('research');
    openResearch();
    await vi.waitFor(async () => expect(await phase()).toBe('review'));
    openReview();
    await t.settle();
    expect(await phase()).toBeNull();
  });

  it('ne relance pas la fournée hebdomadaire avant 7 jours, ni deux fournées à la fois', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const t = setup(fakeClaude({ research: { calendar: [idea()] }, review: [keep('BAG.PA')] }, { research: gate }));
    const first = await t.call('POST', '/api/invest/ideas/runs', { trigger: 'manual' });
    const second = await t.call('POST', '/api/invest/ideas/runs', { trigger: 'manual' });
    expect(second).toMatchObject({ status: 200, body: { started: false, run: { id: first.body.run.id, status: 'running' } } });
    release();
    await t.settle();

    expect(await t.call('POST', '/api/invest/ideas/runs', { trigger: 'weekly' })).toMatchObject({ status: 200, body: { started: false } });
    t.moveTo('2026-10-15');
    expect(await t.call('POST', '/api/invest/ideas/runs', { trigger: 'weekly' })).toMatchObject({ status: 202, body: { started: true } });
    await t.settle();
  });

  it('attend 24 h après un échec hebdomadaire et refuse un lien non http', async () => {
    const script: Script = { research: { ...ALL_FAIL } };
    const t = setup(fakeClaude(script));
    await t.runOnce('weekly');
    expect(await t.call('POST', '/api/invest/ideas/runs', { trigger: 'weekly' })).toMatchObject({ status: 200, body: { started: false, run: { status: 'failed' } } });

    script.research = { calendar: [idea(), idea({ ticker: 'SXR8.DE', sources: ['javascript:alert(1)'] })] };
    script.review = [keep('BAG.PA')];
    t.moveTo('2026-10-08');
    const run = await t.runOnce('weekly');
    expect(run).toMatchObject({ status: 'done', acceptedCount: 1, rejected: [{ ticker: 'SXR8.DE', reason: 'Format invalide' }] });
  });

  it('clôt retenues et écartées à l’horizon et compare le tri au S&P 500', async () => {
    const t = setup(
      fakeClaude({
        research: { calendar: [idea()], international: [idea({ ticker: 'NOU.PA', assetName: 'Nouilles SA' })] },
        review: [keep('BAG.PA'), drop('NOU.PA')],
      }),
    );
    await t.runOnce();

    t.routes['chart/SXR8.DE'] = chart('SXR8.DE', 'EUR', [['2026-10-06', 700], ['2026-10-28', 735], ['2026-11-02', 740]]);
    t.routes['chart/BAG.PA'] = chart('BAG.PA', 'EUR', [['2026-10-06', 11], ['2026-10-28', 15], ['2026-11-02', 9]]);
    t.routes['chart/NOU.PA'] = chart('NOU.PA', 'EUR', [['2026-10-06', 30], ['2026-10-28', 33], ['2026-11-02', 30]]);
    t.moveTo('2026-11-02');
    const view = await t.call('GET', '/api/invest/ideas');
    expect(view.body.open).toEqual([]);
    expect(view.body.closed).toHaveLength(1);
    expect(view.body.closed[0]).toMatchObject({ ticker: 'BAG.PA', status: 'closed', priceDate: '2026-10-28' });
    expect(view.body.closed[0].return).toBeCloseTo(0.25);
    expect(view.body.summary).toMatchObject({ closedCount: 1, beatCount: 1, hundredEach: { invested: 100_00, ideas: 125_00, bench: 105_00 } });
    expect(view.body.summary.filter).toMatchObject({ keptCount: 1, droppedCount: 1 });
    expect(view.body.summary.filter.keptAvgExcess).toBeCloseTo(0.2);
    expect(view.body.summary.filter.droppedAvgExcess).toBeCloseTo(0.05);
  });

  it('ne clôt pas une idée tant que les cours de l’horizon sont périmés', async () => {
    const t = setup(fakeClaude({ research: { calendar: [idea()] }, review: [keep('BAG.PA')] }));
    await t.runOnce();

    t.routes['chart/SXR8.DE'] = new Error('réseau');
    t.routes['chart/BAG.PA'] = new Error('réseau');
    t.moveTo('2026-11-02');
    const view = await t.call('GET', '/api/invest/ideas');
    expect(view.body.closed).toEqual([]);
    expect(view.body.open).toHaveLength(1);
  });
});
