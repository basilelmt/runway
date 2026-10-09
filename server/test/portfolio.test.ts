import { describe, expect, it } from 'vitest';
import { chart, fakeFetch } from './fixtures/yahoo';
import { createApp } from '../src/app';
import { createTestApp } from './helpers';

function setup() {
  const fetch = fakeFetch({
    'chart/SXR8.DE': chart('SXR8.DE', 'EUR', [['2025-10-01', 600], ['2026-10-06', 710]], { date: '2026-10-07', price: 720 }),
    'chart/BTC-EUR': chart('BTC-EUR', 'EUR', [['2026-09-01', 50000], ['2026-10-06', 60000]], { date: '2026-10-07', price: 61000 }),
    'finance/search': { quotes: [{ symbol: 'SXR8.DE', longname: 'iShares Core S&P 500', exchDisp: 'XETRA', typeDisp: 'ETF' }] },
  });
  return createTestApp('2026-10-07', { investDeps: { fetch, now: () => new Date('2026-10-07T10:00:00Z') } });
}

const firstTrade = { side: 'buy', date: '2025-10-01', quantity: '5', amount: 3000_00, fees: 1_00 };
const holding = { platform: 'trade_republic', ticker: 'SXR8.DE', name: 'S&P 500', firstTrade };

describe('portefeuille', () => {
  it('portefeuille vide', async () => {
    const t = setup();
    const r = await t.call('GET', '/api/invest/portfolio');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ holdings: [], totals: { value: 0, invested: 0, gain: 0 }, binance: { configured: false } });
  });

  it('valorise une position manuelle', async () => {
    const t = setup();
    const c = await t.call('POST', '/api/invest/holdings', holding);
    expect(c.status).toBe(201);
    const r = await t.call('GET', '/api/invest/portfolio?range=1y');
    const h = r.body.holdings[0];
    expect(h).toMatchObject({ quantity: '5', costBasis: 3001_00, value: 3600_00, gain: 599_00, price: { eur: 720, date: '2026-10-07', stale: false } });
    expect(h.gainPct).toBeCloseTo(599 / 3001);
    expect(h.dayChangePct).toBeCloseTo(720 / 710 - 1);
    expect(r.body.totals).toMatchObject({ value: 3600_00, invested: 3001_00, gain: 599_00 });
    expect(r.body.series.at(-1)).toEqual({ date: '2026-10-07', value: 3600_00, invested: 3001_00 });
  });

  it('série quotidienne sur un mois', async () => {
    const t = setup();
    await t.call('POST', '/api/invest/holdings', holding);
    const r = await t.call('GET', '/api/invest/portfolio?range=1m');
    expect(r.body.series).toHaveLength(31);
    expect(r.body.series[0]).toEqual({ date: '2026-09-07', value: 3000_00, invested: 3001_00 });
  });

  it('donne la courbe de chaque position, dont la somme fait celle du portefeuille', async () => {
    const t = setup();
    await t.call('POST', '/api/invest/holdings', holding);
    const btc = { side: 'buy', date: '2026-09-15', quantity: '0.1', amount: 5000_00, fees: 0 };
    await t.call('POST', '/api/invest/holdings', { platform: 'binance', ticker: 'BTC-EUR', name: 'Bitcoin', firstTrade: btc });
    const r = await t.call('GET', '/api/invest/portfolio?range=1m');
    const [sp, bitcoin] = [r.body.holdings.find((h: { ticker: string }) => h.ticker === 'SXR8.DE'), r.body.holdings.find((h: { ticker: string }) => h.ticker === 'BTC-EUR')];
    expect(sp.series.at(-1)).toEqual({ date: '2026-10-07', value: 3600_00, invested: 3001_00 });
    expect(bitcoin.series[0]).toEqual({ date: '2026-09-07', value: 0, invested: 0 });
    expect(bitcoin.series.at(-1)).toEqual({ date: '2026-10-07', value: 6100_00, invested: 5000_00 });
    expect(r.body.series.at(-1)).toEqual({ date: '2026-10-07', value: 9700_00, invested: 8001_00 });
    expect(r.body.series).toHaveLength(31);
    r.body.series.forEach((p: { value: number; invested: number }, i: number) => {
      expect(p.value).toBe(sp.series[i].value + bitcoin.series[i].value);
      expect(p.invested).toBe(sp.series[i].invested + bitcoin.series[i].invested);
    });
  });

  it('refuse un ticker inconnu, une vente trop grande et une suppression qui rendrait une vente impossible', async () => {
    const t = setup();
    const bad = await t.call('POST', '/api/invest/holdings', { ...holding, ticker: 'NOPE' });
    expect(bad).toMatchObject({ status: 400, body: { code: 'unknown_ticker' } });
    const c = await t.call('POST', '/api/invest/holdings', holding);
    const sell = await t.call('POST', `/api/invest/holdings/${c.body.id}/trades`, { side: 'sell', date: '2026-01-01', quantity: '6', amount: 100_00 });
    expect(sell).toMatchObject({ status: 400, body: { code: 'oversell' } });
    const before = await t.call('POST', `/api/invest/holdings/${c.body.id}/trades`, { side: 'sell', date: '2025-09-01', quantity: '1', amount: 100_00 });
    expect(before).toMatchObject({ status: 400, body: { code: 'oversell' } });
    const buy = await t.call('POST', `/api/invest/holdings/${c.body.id}/trades`, { side: 'buy', date: '2026-01-02', quantity: '1', amount: 650_00 });
    await t.call('POST', `/api/invest/holdings/${c.body.id}/trades`, { side: 'sell', date: '2026-02-01', quantity: '6', amount: 4000_00 });
    expect(await t.call('DELETE', `/api/invest/trades/${buy.body.id}`)).toMatchObject({ status: 400, body: { code: 'oversell' } });
  });

  it('modifie sans toucher aux frais, supprime un mouvement puis la position', async () => {
    const t = setup();
    const c = await t.call('POST', '/api/invest/holdings', holding);
    const add = await t.call('POST', `/api/invest/holdings/${c.body.id}/trades`, { side: 'buy', date: '2026-01-02', quantity: '1', amount: 650_00, fees: 1_00 });
    const patched = await t.call('PATCH', `/api/invest/trades/${add.body.id}`, { quantity: '2' });
    expect(patched.body).toMatchObject({ quantity: '2', fees: 1_00 });
    expect((await t.call('DELETE', `/api/invest/trades/${add.body.id}`)).status).toBe(204);
    expect((await t.call('DELETE', `/api/invest/holdings/${c.body.id}`)).status).toBe(204);
    expect((await t.call('GET', '/api/invest/portfolio')).body.holdings).toEqual([]);
  });

  it('Yahoo injoignable : dernier cours connu, marqué périmé', async () => {
    const t = setup();
    await t.call('POST', '/api/invest/holdings', holding);
    // Même base, une heure plus tard, Yahoo injoignable.
    const down = createApp({
      db: t.db,
      now: () => '2026-10-07',
      investDeps: { fetch: async () => Promise.reject(new Error('réseau')), now: () => new Date('2026-10-07T11:00:00Z') },
    });
    const r = { body: (await (await down.request('/api/invest/portfolio')).json()) as { holdings: unknown[]; stale: boolean } };
    expect(r.body.holdings[0]).toMatchObject({ price: { eur: 720, stale: true } });
    expect(r.body.stale).toBe(true);
  });

  it('recherche', async () => {
    const t = setup();
    const r = await t.call('GET', '/api/invest/search?q=sxr8');
    expect(r.body[0]).toMatchObject({ ticker: 'SXR8.DE' });
  });
});
