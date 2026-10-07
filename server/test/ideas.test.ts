import { describe, expect, it, vi } from 'vitest';
import type { Exec, ExecResult } from '../src/services/claude';
import { buildIdeasPrompt } from '../src/services/ideas';
import { chart, fakeFetch } from './fixtures/yahoo';
import { createTestApp } from './helpers';

const idea = (over: Record<string, unknown> = {}) => ({
  title: 'La fête des nouilles fait vendre des baguettes',
  event: 'La fête des nouilles a lieu le 20 octobre',
  sourceUrl: 'https://exemple.fr/fete-des-nouilles',
  reasoning: ['La fête des nouilles approche', 'Les gens vont acheter des baguettes', 'Le fabricant de baguettes va vendre plus'],
  pricedIn: 'En partie : la fête est connue de tous.',
  ticker: 'BAG.PA',
  assetName: 'Baguettes SA',
  whereToBuy: 'trade_republic',
  horizon: '2026-10-28',
  ...over,
});

function ok(structured: unknown): ExecResult {
  return { stdout: JSON.stringify({ is_error: false, result: 'ok', structured_output: structured }), stderr: '', exitCode: 0 };
}

function setup(exec: Exec) {
  const routes: Record<string, unknown> = {
    'chart/SXR8.DE': chart('SXR8.DE', 'EUR', [['2026-10-06', 700]], { date: '2026-10-07', price: 700 }),
    'chart/BAG.PA': chart('BAG.PA', 'EUR', [['2026-10-06', 11]], { date: '2026-10-07', price: 12 }),
    'chart/NOPE': { chart: { result: null, error: { code: 'Not Found' } } },
  };
  let now = new Date('2026-10-07T10:00:00Z');
  const runs: Promise<void>[] = [];
  const t = createTestApp('2026-10-07', {
    exec,
    investDeps: { fetch: fakeFetch(routes), now: () => now, onRunStarted: (done) => runs.push(done) },
  });
  return {
    ...t,
    routes,
    runs,
    moveTo: (iso: string) => {
      now = new Date(`${iso}T10:00:00Z`);
      t.setToday(iso);
    },
    settle: () => Promise.all(runs),
  };
}

describe('buildIdeasPrompt', () => {
  it('contient la date, les positions et les idées récentes', () => {
    const p = buildIdeasPrompt({ today: '2026-10-07', holdings: [{ name: 'S&P 500', ticker: 'SXR8.DE' }], recent: [{ title: 'Cuivre', ticker: 'HG=F' }] });
    expect(p).toContain('Nous sommes le 2026-10-07');
    expect(p).toContain('- S&P 500 (SXR8.DE)');
    expect(p).toContain('- Cuivre (HG=F)');
  });
});

describe('fournées d’idées', () => {
  it('garde les idées valides et explique les rejets', async () => {
    const exec = vi.fn<Exec>(async () =>
      ok({ ideas: [idea(), idea({ ticker: 'NOPE' }), idea({ ticker: 'AIR.PA', horizon: '2026-10-09' }), idea({ ticker: 'BAG.PA' }), { ticker: 'X' }] }),
    );
    const t = setup(exec);
    const r = await t.call('POST', '/api/invest/ideas/runs', { trigger: 'manual' });
    expect(r).toMatchObject({ status: 202, body: { started: true, run: { status: 'running' } } });
    await t.settle();

    const args = exec.mock.calls[0]![0];
    expect(args.slice(0, 5)).toEqual(['-p', '--tools', 'WebSearch', '--allowedTools', 'WebSearch']);
    expect(args).toContain('--json-schema');
    expect(exec.mock.calls[0]![1]).toBe(600_000);

    const run = await t.call('GET', `/api/invest/ideas/runs/${r.body.run.id}`);
    expect(run.body).toMatchObject({ status: 'done', acceptedCount: 1 });
    expect(run.body.rejected).toEqual([
      { ticker: 'NOPE', reason: 'Ticker introuvable chez Yahoo' },
      { ticker: 'AIR.PA', reason: 'Horizon hors limites' },
      { ticker: 'BAG.PA', reason: 'Doublon' },
      { ticker: 'X', reason: 'Format invalide' },
    ]);

    const view = await t.call('GET', '/api/invest/ideas');
    expect(view.body.open).toHaveLength(1);
    expect(view.body.open[0]).toMatchObject({ ticker: 'BAG.PA', startPriceEur: 12, return: 0, benchReturn: 0, status: 'open' });
    expect(view.body.open[0].reasoning).toHaveLength(3);
    expect(view.body.lastRun).toMatchObject({ id: r.body.run.id, status: 'done' });
  });

  it('ne relance pas la fournée hebdomadaire avant 7 jours, ni deux fournées à la fois', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const exec = vi.fn<Exec>(async () => {
      await gate;
      return ok({ ideas: [idea()] });
    });
    const t = setup(exec);
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

  it('une fournée en échec garde le message de Claude', async () => {
    const t = setup(async () => ({ stdout: '', stderr: 'TIMEOUT', exitCode: 124 }));
    const r = await t.call('POST', '/api/invest/ideas/runs', { trigger: 'manual' });
    await t.settle();
    const run = await t.call('GET', `/api/invest/ideas/runs/${r.body.run.id}`);
    expect(run.body).toMatchObject({ status: 'failed', error: 'Claude a mis trop de temps à répondre' });
  });

  it('clôt une idée à son horizon et compte si elle a battu le S&P 500', async () => {
    const t = setup(async () => ok({ ideas: [idea()] }));
    await t.call('POST', '/api/invest/ideas/runs', { trigger: 'manual' });
    await t.settle();

    t.routes['chart/SXR8.DE'] = chart('SXR8.DE', 'EUR', [['2026-10-06', 700], ['2026-10-28', 735], ['2026-11-02', 740]]);
    t.routes['chart/BAG.PA'] = chart('BAG.PA', 'EUR', [['2026-10-06', 11], ['2026-10-28', 15], ['2026-11-02', 9]]);
    t.moveTo('2026-11-02');
    const view = await t.call('GET', '/api/invest/ideas');
    expect(view.body.open).toEqual([]);
    expect(view.body.closed[0]).toMatchObject({ status: 'closed', priceDate: '2026-10-28' });
    expect(view.body.closed[0].return).toBeCloseTo(0.25);
    expect(view.body.closed[0].benchReturn).toBeCloseTo(0.05);
    expect(view.body.summary).toMatchObject({ closedCount: 1, beatCount: 1, hundredEach: { invested: 100_00, ideas: 125_00, bench: 105_00 } });
  });
});
