import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { convertOnce, fakeBinance, fiatOnce, inWindow } from './fixtures/binance';
import { createTestApp } from './helpers';

const keys = { apiKey: 'K'.repeat(60) + 'abcd', apiSecret: 'S'.repeat(64) };
const NOW = '2026-10-07T10:00:00Z';

function setup(overrides: Parameters<typeof fakeBinance>[0] = {}) {
  const fetch = fakeBinance({
    '/sapi/v1/convert/tradeFlow': inWindow('2025-12-01', convertOnce, { list: [] }),
    '/sapi/v1/fiat/payments': inWindow('2026-02-01', fiatOnce, { code: '000000', data: [] }),
    ...overrides,
  });
  let now = new Date(NOW);
  const t = createTestApp('2026-10-07', { investDeps: { fetch, now: () => now } });
  return { ...t, fetch, later: (minutes: number) => (now = new Date(now.getTime() + minutes * 60_000)) };
}

async function connected(overrides: Parameters<typeof fakeBinance>[0] = {}) {
  const t = setup(overrides);
  const r = await t.call('PUT', '/api/invest/binance', keys);
  expect(r.status).toBe(200);
  return t;
}

describe('clé Binance', () => {
  it('refuse une clé qui peut trader', async () => {
    const t = setup({ '/sapi/v1/account/apiRestrictions': { enableReading: true, enableSpotAndMarginTrading: true } });
    const r = await t.call('PUT', '/api/invest/binance', keys);
    expect(r).toMatchObject({ status: 400, body: { code: 'binance_key_permissions' } });
    expect((await t.call('GET', '/api/invest/binance')).body.configured).toBe(false);
  });

  it("enregistre une clé en lecture seule sans jamais renvoyer le secret", async () => {
    const t = await connected();
    const state = await t.call('GET', '/api/invest/binance');
    expect(state.body).toEqual({ configured: true, apiKeyHint: 'abcd', lastSyncAt: null, lastError: null });
    const portfolio = await t.call('GET', '/api/invest/portfolio');
    const raw = JSON.stringify([state.body, portfolio.body]);
    expect(raw).not.toContain(keys.apiKey);
    expect(raw).not.toContain(keys.apiSecret);
  });

  it('signe les requêtes avec HMAC-SHA256', async () => {
    const t = await connected();
    const call = t.fetch.calls.find((c) => c.url.includes('/apiRestrictions'))!;
    expect(call.apiKey).toBe(keys.apiKey);
    const url = new URL(call.url);
    const signature = url.searchParams.get('signature');
    url.searchParams.delete('signature');
    expect(signature).toBe(createHmac('sha256', keys.apiSecret).update(url.searchParams.toString()).digest('hex'));
  });
});

describe('synchronisation Binance', () => {
  it('additionne les soldes et reconstitue le coût de revient', async () => {
    const t = await connected();
    const r = await t.call('POST', '/api/invest/binance/sync', {});
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ skipped: false, holdings: 1, newTrades: 3, warnings: [] });
    const p = await t.call('GET', '/api/invest/portfolio');
    expect(p.body.holdings).toHaveLength(1);
    expect(p.body.holdings[0]).toMatchObject({
      platform: 'binance',
      ticker: 'BTC-EUR',
      source: 'binance',
      quantity: '0.04',
      costBasis: 3000_00,
      value: 2800_00,
      unpricedQuantity: '0.00002',
    });
    expect(p.body.holdings[0].trades.map((x: { quantity: string; amount: number; fees: number }) => [x.quantity, x.amount, x.fees])).toEqual([
      ['0.01998', 1500_00, 0],
      ['0.01', 750_00, 0],
      ['0.01', 735_00, 15_00],
    ]);
    expect(p.body.binance.lastSyncAt).toBe(NOW.replace('Z', '.000Z'));
  });

  it("n'importe rien deux fois et respecte le délai de fraîcheur", async () => {
    const t = await connected();
    await t.call('POST', '/api/invest/binance/sync', {});
    t.later(5);
    expect((await t.call('POST', '/api/invest/binance/sync', { onlyIfStaleMinutes: 60 })).body).toMatchObject({ skipped: true });
    t.later(120);
    expect((await t.call('POST', '/api/invest/binance/sync', {})).body).toMatchObject({ skipped: false, newTrades: 0 });
  });

  it('les mouvements synchronisés ne se modifient pas à la main', async () => {
    const t = await connected();
    await t.call('POST', '/api/invest/binance/sync', {});
    const p = await t.call('GET', '/api/invest/portfolio');
    const h = p.body.holdings[0];
    expect(await t.call('PATCH', `/api/invest/trades/${h.trades[0].id}`, { quantity: '1' })).toMatchObject({ status: 400, body: { code: 'synced_trade' } });
    expect(await t.call('DELETE', `/api/invest/holdings/${h.id}`)).toMatchObject({ status: 400, body: { code: 'synced_holding' } });
  });

  it('une clé révoquée garde les données et affiche l’erreur', async () => {
    const ok = await connected();
    await ok.call('POST', '/api/invest/binance/sync', {});
    const revoked = await (async () => {
      // Même base, réseau qui refuse désormais la clé.
      const fetch = fakeBinance({ '/api/v3/account': { code: -2015, msg: 'Invalid API-key, IP, or permissions for action.' } });
      const { createApp } = await import('../src/app');
      return createApp({ db: ok.db, now: () => '2026-10-07', investDeps: { fetch, now: () => new Date('2026-10-07T12:00:00Z') } });
    })();
    const r = await revoked.request('/api/invest/binance/sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(r.status).toBe(502);
    expect(((await r.json()) as { error: string }).error).toBe('Binance : clé API refusée (révoquée ou IP non autorisée)');
    const state = await ok.call('GET', '/api/invest/binance');
    expect(state.body.lastError).toBe('Binance : clé API refusée (révoquée ou IP non autorisée)');
    expect((await ok.call('GET', '/api/invest/portfolio')).body.holdings).toHaveLength(1);
  });

  it('ignore un actif sans cours en euros', async () => {
    const t = await connected({
      '/api/v3/account': { balances: [{ asset: 'BTC', free: '0.03', locked: '0' }, { asset: 'OBSCURE', free: '100', locked: '0' }] },
    });
    const r = await t.call('POST', '/api/invest/binance/sync', {});
    expect(r.body.warnings).toEqual(['OBSCURE : pas de cours en euros, ignoré']);
  });

  it('une conversion entre cryptos vend l’une et achète l’autre au même montant', async () => {
    const t = await connected({
      '/sapi/v1/convert/tradeFlow': inWindow(
        '2026-03-01',
        { list: [{ orderId: 7, fromAsset: 'BTC', fromAmount: '0.005', toAsset: 'ETH', toAmount: '0.2', createTime: Date.parse('2026-03-01T12:00:00Z'), orderStatus: 'SUCCESS' }] },
        { list: [] },
      ),
      'chart/ETH-EUR': (await import('./fixtures/yahoo')).chart('ETH-EUR', 'EUR', [['2026-02-27', 2000], ['2026-10-06', 2500]]),
    });
    await t.call('POST', '/api/invest/binance/sync', {});
    const p = await t.call('GET', '/api/invest/portfolio');
    const eth = p.body.holdings.find((h: { ticker: string }) => h.ticker === 'ETH-EUR');
    expect(eth).toMatchObject({ quantity: '0', costBasis: 400_00 });
    const btc = p.body.holdings.find((h: { ticker: string }) => h.ticker === 'BTC-EUR');
    expect(btc.trades.at(-1)).toMatchObject({ side: 'sell', quantity: '0.005', amount: 400_00 });
  });

  it('déconnecter supprime les positions synchronisées et la clé', async () => {
    const t = await connected();
    await t.call('POST', '/api/invest/binance/sync', {});
    expect((await t.call('DELETE', '/api/invest/binance')).status).toBe(204);
    expect((await t.call('GET', '/api/invest/portfolio')).body).toMatchObject({ holdings: [], binance: { configured: false } });
  });
});
