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

  // --- Fix round 1 ---

  it('ne lève pas sur une réponse chart malformée (gmtoffset manquant) et renvoie null sans cache', async () => {
    const { db } = createTestDb();
    const malformed = {
      chart: {
        result: [
          {
            meta: { symbol: 'BAD', currency: 'EUR', longName: 'BAD Inc.', regularMarketPrice: 100, regularMarketTime: Date.parse('2026-10-05T16:00:00Z') / 1000 },
            timestamp: [Date.parse('2026-10-05T16:00:00Z') / 1000],
            indicators: { quote: [{ close: [100] }] },
          },
        ],
        error: null,
      },
    };
    const fetch = fakeFetch({ 'chart/BAD': malformed });
    const prices = createPrices(db, { fetch, now: at('2026-10-07T10:00:00Z') });
    await expect(prices.history('BAD', '2026-10-01')).resolves.toBeNull();
  });

  it('réponse chart malformée avec un cache existant : dernière valeur connue, périmée, sans lever', async () => {
    const { db } = createTestDb();
    const ok = fakeFetch({ 'chart/BAD2': chart('BAD2', 'EUR', [['2026-10-05', 700]]) });
    await createPrices(db, { fetch: ok, now: at('2026-10-05T18:00:00Z') }).quoteEur('BAD2');
    const malformed = { chart: { result: [{ meta: { symbol: 'BAD2', currency: 'EUR', longName: 'BAD2 Inc.' }, timestamp: [], indicators: { quote: [{ close: [] }] } }], error: null } };
    const fetch = fakeFetch({ 'chart/BAD2': malformed });
    const q = await createPrices(db, { fetch, now: at('2026-10-07T10:00:00Z') }).quoteEur('BAD2');
    expect(q).toMatchObject({ eur: 700, date: '2026-10-05', stale: true });
  });

  it('quoteEur retombe sur la dernière clôture connue même au-delà de la fenêtre de repli', async () => {
    const { db } = createTestDb();
    const ok = fakeFetch({ 'chart/SXR8.DE': chart('SXR8.DE', 'EUR', [['2026-09-20', 700]]) });
    await createPrices(db, { fetch: ok, now: at('2026-09-20T18:00:00Z') }).quoteEur('SXR8.DE');
    const down = fakeFetch({ 'chart/SXR8.DE': new Error('réseau') });
    const q = await createPrices(db, { fetch: down, now: at('2026-10-07T10:00:00Z') }).quoteEur('SXR8.DE');
    expect(q).toMatchObject({ eur: 700, date: '2026-09-20', stale: true });
  });

  it('le taux de change retombe sur le dernier jour connu avant le début de la fenêtre demandée', async () => {
    const { db } = createTestDb();
    const fetch = fakeFetch({
      'chart/AAPL': chart('AAPL', 'USD', [['2026-10-05', 220]]),
      'chart/EURUSD%3DX': chart('EURUSD=X', 'USD', [['2026-10-02', 1.1]]),
    });
    const prices = createPrices(db, { fetch, now: at('2026-10-07T10:00:00Z') });
    const h = await prices.historyEur('AAPL', '2026-10-05');
    expect(h?.closesEur).toEqual([{ date: '2026-10-05', close: 220 / 1.1 }]);
  });

  it("évite de rappeler Yahoo juste après une panne confirmée (anti-rafale de 5 minutes)", async () => {
    const { db } = createTestDb();
    const down = fakeFetch({ 'chart/NOPE2': new Error('réseau') });
    let clock = new Date('2026-10-07T10:00:00Z');
    const prices = createPrices(db, { fetch: down, now: () => clock });
    await prices.history('NOPE2', '2026-10-01');
    await prices.history('NOPE2', '2026-10-01');
    expect(down.calls).toHaveLength(1);
    // Un appel pendant la pause ne la prolonge pas : 5 minutes après la panne, on réessaie.
    clock = new Date('2026-10-07T10:04:00Z');
    await prices.history('NOPE2', '2026-10-01');
    clock = new Date('2026-10-07T10:05:30Z');
    await prices.history('NOPE2', '2026-10-01');
    expect(down.calls).toHaveLength(2);
  });

  it('distingue un ticker inconnu de Yahoo injoignable', async () => {
    const { db } = createTestDb();
    const fetch = fakeFetch({ 'chart/NOPE': unknownTicker, 'chart/DOWN': new Error('réseau') });
    const prices = createPrices(db, { fetch, now: at('2026-10-07T10:00:00Z') });
    await prices.quoteEur('NOPE');
    await prices.quoteEur('DOWN');
    expect(prices.isUnknown('NOPE')).toBe(true);
    expect(prices.isUnknown('DOWN')).toBe(false);
  });

  it('une actualisation après REFRESH_MINUTES relance un appel réseau', async () => {
    const { db } = createTestDb();
    const fetch = fakeFetch({ 'chart/SXR8.DE': chart('SXR8.DE', 'EUR', [['2026-10-05', 740]]) });
    let clock = new Date('2026-10-07T10:00:00Z');
    const prices = createPrices(db, { fetch, now: () => clock });
    await prices.history('SXR8.DE', '2026-10-01');
    await prices.history('SXR8.DE', '2026-10-01');
    expect(fetch.calls).toHaveLength(1);
    clock = new Date('2026-10-07T10:16:00Z');
    await prices.history('SXR8.DE', '2026-10-01');
    expect(fetch.calls).toHaveLength(2);
  });

  it('une demande sur une période plus ancienne force un nouvel appel et étend historyFrom', async () => {
    const { db } = createTestDb();
    const fetch = fakeFetch({ 'chart/SXR8.DE': chart('SXR8.DE', 'EUR', [['2026-10-05', 740]]) });
    const prices = createPrices(db, { fetch, now: at('2026-10-07T10:00:00Z') });
    await prices.history('SXR8.DE', '2026-10-01');
    await prices.history('SXR8.DE', '2026-09-01');
    expect(fetch.calls).toHaveLength(2);
    const url2 = new URL(fetch.calls[1]!);
    expect(Number(url2.searchParams.get('period1'))).toBe(Math.floor(Date.parse('2026-09-01T00:00:00Z') / 1000));
  });

  it('un décalage horaire négatif peut faire reculer la date (ticker américain)', async () => {
    const { db } = createTestDb();
    const ts = Date.parse('2026-10-06T02:00:00Z') / 1000;
    const body = {
      chart: {
        result: [
          {
            meta: { symbol: 'US1', currency: 'USD', longName: 'US1 Inc.', gmtoffset: -14400 },
            timestamp: [ts],
            indicators: { quote: [{ close: [50] }] },
          },
        ],
        error: null,
      },
    };
    const fetch = fakeFetch({ 'chart/US1': body });
    const prices = createPrices(db, { fetch, now: at('2026-10-07T10:00:00Z') });
    const h = await prices.history('US1', '2026-10-01');
    expect(h?.closes).toEqual([{ date: '2026-10-05', close: 50 }]);
  });

  it('recherche : une erreur HTTP lève une AppError 502', async () => {
    const { db } = createTestDb();
    const fetch = fakeFetch({ 'finance/search': new Response('erreur serveur', { status: 500 }) });
    await expect(createPrices(db, { fetch }).search('X')).rejects.toMatchObject({ status: 502 });
  });
});
