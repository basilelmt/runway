import { describe, expect, it } from 'vitest';
import { createPrices } from '../src/services/prices';
import { chart, fakeFetch, unknownTicker } from './fixtures/yahoo';
import { createTestDb } from './helpers';

const at = (iso: string) => () => new Date(iso);

describe('prices', () => {
  it('récupère et met en cache un historique en euros', async () => {
    const { db } = createTestDb();
    const fetch = fakeFetch({ 'chart/SXR8.DE': chart('SXR8.DE', 'EUR', [['2026-10-05', 740], ['2026-10-06', 745]], { date: '2026-10-07', price: 748.88 }) });
    const prices = createPrices(db, { fetch, now: at('2026-10-07T10:00:00Z') });
    const h = await prices.historyEur('SXR8.DE', '2026-10-01');
    expect(h?.closesEur).toEqual([
      { date: '2026-10-05', close: 740 },
      { date: '2026-10-06', close: 745 },
      { date: '2026-10-07', close: 748.88 },
    ]);
    await prices.historyEur('SXR8.DE', '2026-10-03');
    expect(fetch.calls).toHaveLength(1);
  });

  it('convertit une cotation en dollars avec EURUSD=X', async () => {
    const { db } = createTestDb();
    const fetch = fakeFetch({
      'chart/AAPL': chart('AAPL', 'USD', [['2026-10-06', 220]]),
      'chart/EURUSD%3DX': chart('EURUSD=X', 'USD', [['2026-10-06', 1.1]]),
    });
    const prices = createPrices(db, { fetch, now: at('2026-10-07T10:00:00Z') });
    expect((await prices.quoteEur('AAPL'))?.eur).toBeCloseTo(200);
  });

  it('renvoie le cache marqué périmé quand Yahoo tombe', async () => {
    const { db } = createTestDb();
    const ok = fakeFetch({ 'chart/SXR8.DE': chart('SXR8.DE', 'EUR', [['2026-10-05', 740]]) });
    await createPrices(db, { fetch: ok, now: at('2026-10-05T18:00:00Z') }).quoteEur('SXR8.DE');
    const down = fakeFetch({ 'chart/SXR8.DE': new Error('réseau') });
    const q = await createPrices(db, { fetch: down, now: at('2026-10-07T10:00:00Z') }).quoteEur('SXR8.DE');
    expect(q).toMatchObject({ eur: 740, date: '2026-10-05', stale: true });
  });

  it('null pour un ticker inconnu', async () => {
    const { db } = createTestDb();
    const prices = createPrices(db, { fetch: fakeFetch({ 'chart/NOPE': unknownTicker }), now: at('2026-10-07T10:00:00Z') });
    expect(await prices.quoteEur('NOPE')).toBeNull();
  });

  it('closeEurOn prend la dernière clôture avant la date', async () => {
    const { db } = createTestDb();
    const fetch = fakeFetch({ 'chart/SXR8.DE': chart('SXR8.DE', 'EUR', [['2026-10-02', 730], ['2026-10-05', 740]]) });
    const prices = createPrices(db, { fetch, now: at('2026-10-07T10:00:00Z') });
    expect(await prices.closeEurOn('SXR8.DE', '2026-10-04')).toMatchObject({ eur: 730, date: '2026-10-02' });
  });

  it('recherche', async () => {
    const { db } = createTestDb();
    const fetch = fakeFetch({
      'finance/search': { quotes: [{ symbol: 'SXR8.DE', longname: 'iShares Core S&P 500', exchDisp: 'XETRA', typeDisp: 'ETF', isYahooFinance: true }, { index: 'x' }] },
    });
    const r = await createPrices(db, { fetch }).search('SXR8');
    expect(r).toEqual([{ ticker: 'SXR8.DE', name: 'iShares Core S&P 500', exchange: 'XETRA', type: 'ETF' }]);
  });
});
