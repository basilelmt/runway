import { chart, unknownTicker } from './yahoo';

type Json = unknown;
export type BinanceCall = { url: string; method: string; apiKey: string | null };

const day = (iso: string) => Date.parse(`${iso}T12:00:00Z`);

/** Réponses par défaut d'un compte lecture seule : 0,03 BTC en spot, 0,01 BTC en Earn, trois achats. */
export function binanceDefaults(): Record<string, Json> {
  return {
    '/sapi/v1/account/apiRestrictions': { enableReading: true, enableSpotAndMarginTrading: false, enableWithdrawals: false, enableInternalTransfer: false },
    '/api/v3/account': {
      balances: [
        { asset: 'BTC', free: '0.03000000', locked: '0.00000000' },
        { asset: 'EUR', free: '12.00', locked: '0' },
        { asset: 'LDBTC', free: '1', locked: '0' },
      ],
    },
    '/sapi/v1/asset/get-funding-asset': [],
    '/sapi/v1/simple-earn/flexible/position': { rows: [{ asset: 'BTC', totalAmount: '0.01000000' }], total: 1 },
    '/api/v3/myTrades?symbol=BTCEUR': [
      { id: 1, symbol: 'BTCEUR', price: '75000', qty: '0.02000000', quoteQty: '1500.00', commission: '0.00002000', commissionAsset: 'BTC', time: day('2025-10-10'), isBuyer: true },
    ],
    '/api/v3/myTrades': { code: -1121, msg: 'Invalid symbol.' },
    '/sapi/v1/convert/tradeFlow': { list: [] },
    '/sapi/v1/fiat/payments': { code: '000000', data: [], total: 0, success: true },
  };
}

export const convertOnce = {
  list: [{ orderId: 42, fromAsset: 'EUR', fromAmount: '750', toAsset: 'BTC', toAmount: '0.01000000', createTime: day('2025-12-01'), orderStatus: 'SUCCESS' }],
};
export const fiatOnce = {
  code: '000000',
  data: [{ orderNo: 'F1', sourceAmount: '750', fiatCurrency: 'EUR', obtainAmount: '0.01000000', cryptoCurrency: 'BTC', totalFee: '15', status: 'Completed', createTime: day('2026-02-01') }],
  total: 1,
  success: true,
};

/**
 * Faux réseau Binance + Yahoo. Les routes sont cherchées de la plus spécifique à la plus générale.
 * Une valeur fonction est appelée avec l'URL (pour ne répondre qu'à une fenêtre de dates, par exemple).
 */
export function fakeBinance(overrides: Record<string, Json | ((url: string) => Json | Promise<Json>)> = {}) {
  const routes: Record<string, Json | ((url: string) => Json | Promise<Json>)> = {
    ...binanceDefaults(),
    'chart/BTC-EUR': chart('BTC-EUR', 'EUR', [['2026-10-06', 70000]]),
    'chart/EURUSD%3DX': chart('EURUSD=X', 'USD', [['2025-09-01', 1.1], ['2026-10-06', 1.1]]),
    ...overrides,
  };
  const calls: BinanceCall[] = [];
  const keys = Object.keys(routes).sort((a, b) => b.length - a.length);
  const fn = async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET', apiKey: new Headers(init?.headers).get('X-MBX-APIKEY') });
    const path = url.replace('https://api.binance.com', '');
    const key = keys.find((k) => path.startsWith(k) || url.includes(k));
    // Un ticker non prévu répond comme Yahoo pour un ticker qui n'existe pas.
    if (!key) return new Response(JSON.stringify(url.includes('finance.yahoo.com') ? unknownTicker : {}), { status: 404 });
    const raw = routes[key];
    // Une route fonction peut être asynchrone (pour suspendre une réponse dans un test).
    const body = typeof raw === 'function' ? await (raw as (u: string) => Json)(url) : raw;
    if (body instanceof Error) throw body;
    const isError = typeof body === 'object' && body !== null && typeof (body as { code?: unknown }).code === 'number';
    return new Response(JSON.stringify(body), { status: isError ? 400 : 200 });
  };
  return Object.assign(fn, { calls });
}

/** Ne renvoie `body` que pour la fenêtre de 30 jours qui contient `iso`, liste vide ailleurs. */
export function inWindow(iso: string, body: Json, empty: Json) {
  const t = day(iso);
  return (url: string) => {
    const p = new URL(url).searchParams;
    const start = Number(p.get('startTime') ?? p.get('beginTime'));
    const end = Number(p.get('endTime'));
    return t >= start && t <= end ? body : empty;
  };
}
