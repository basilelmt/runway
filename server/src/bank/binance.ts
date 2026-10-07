import { createHmac } from 'node:crypto';
import { addQty, isZeroQty } from '@core/invest';
import { AppError } from '../errors';
import type { HttpFetch } from '../services/prices';

export const BINANCE_BASE = 'https://api.binance.com';
const TIMEOUT_MS = 15_000;
const PAGE = 1000;
/** Les historiques de conversion et d'achat par carte se lisent par fenêtres de 30 jours au plus. */
export const WINDOW_MS = 30 * 24 * 3600 * 1000;

export class BinanceError extends AppError {
  constructor(message: string) {
    super(`Binance : ${message}`, 502, 'binance_error');
  }
}

export type SpotTrade = {
  id: number;
  symbol: string;
  price: string;
  qty: string;
  quoteQty: string;
  commission: string;
  commissionAsset: string;
  time: number;
  isBuyer: boolean;
};
export type ConvertTrade = { orderId: number | string; fromAsset: string; fromAmount: string; toAsset: string; toAmount: string; createTime: number; orderStatus: string };
export type FiatBuy = {
  orderNo: string;
  sourceAmount: string;
  fiatCurrency: string;
  obtainAmount: string;
  cryptoCurrency: string;
  totalFee: string;
  status: string;
  createTime: number;
};

export type BinanceClient = {
  restrictions(): Promise<Record<string, unknown>>;
  /** Spot + Funding + Simple Earn flexible, additionnés par actif en décimal exact ; seulement les soldes non nuls. */
  balances(): Promise<Map<string, string>>;
  /** Tous les échanges spot d'une paire ; liste vide si la paire n'existe pas. */
  myTrades(symbol: string): Promise<SpotTrade[]>;
  convertFlow(startMs: number, endMs: number): Promise<ConvertTrade[]>;
  fiatBuys(startMs: number, endMs: number): Promise<FiatBuy[]>;
};

export type BinanceClientDeps = { fetch?: HttpFetch; now?: () => number };

/** Code d'erreur Binance « symbole invalide ». */
const INVALID_SYMBOL = -1121;

class BinanceApiError extends BinanceError {
  constructor(
    message: string,
    public readonly binanceCode: number | null,
  ) {
    super(message);
  }
}

function describe(code: number | null, msg: string): string {
  if (code === -2015 || code === -2014 || code === -2008) return 'clé API refusée (révoquée ou IP non autorisée)';
  if (code === -1021) return "horloge de l'ordinateur décalée, synchronise l'heure système";
  return msg || 'erreur inconnue';
}

function windows(startMs: number, endMs: number): [number, number][] {
  const out: [number, number][] = [];
  for (let s = startMs; s < endMs; s += WINDOW_MS) out.push([s, Math.min(s + WINDOW_MS - 1, endMs)]);
  return out;
}

export function createBinanceClient(keys: { apiKey: string; apiSecret: string }, deps: BinanceClientDeps = {}): BinanceClient {
  const http = deps.fetch ?? ((url, init) => fetch(url, init));
  const now = deps.now ?? Date.now;

  async function signed(method: 'GET' | 'POST', path: string, params: Record<string, string | number> = {}): Promise<unknown> {
    const query = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), recvWindow: '10000', timestamp: String(now()) });
    query.set('signature', createHmac('sha256', keys.apiSecret).update(query.toString()).digest('hex'));
    let res: Response;
    try {
      res = await http(`${BINANCE_BASE}${path}?${query}`, { method, headers: { 'X-MBX-APIKEY': keys.apiKey }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      throw new BinanceError('Binance injoignable');
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new BinanceError(`réponse illisible (HTTP ${res.status})`);
    }
    const err = body as { code?: unknown; msg?: unknown };
    const code = typeof err.code === 'number' ? err.code : null;
    if (!res.ok || (code !== null && code < 0)) {
      throw new BinanceApiError(describe(code, typeof err.msg === 'string' ? err.msg : `HTTP ${res.status}`), code);
    }
    return body;
  }

  /** Montant Binance (« 0.03000000 ») en décimal exact ; zéro si absent ou illisible. */
  const dec = (v: unknown) => (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v) ? v : '0');

  return {
    async restrictions() {
      return (await signed('GET', '/sapi/v1/account/apiRestrictions')) as Record<string, unknown>;
    },

    async balances() {
      const totals = new Map<string, string>();
      const add = (asset: unknown, ...amounts: unknown[]) => {
        const amount = amounts.map(dec).reduce(addQty, '0');
        if (typeof asset !== 'string' || asset.startsWith('LD') || isZeroQty(amount)) return;
        totals.set(asset, addQty(totals.get(asset) ?? '0', amount));
      };
      const spot = (await signed('GET', '/api/v3/account', { omitZeroBalances: 'true' })) as { balances?: { asset: string; free: string; locked: string }[] };
      for (const b of spot.balances ?? []) add(b.asset, b.free, b.locked);
      const funding = (await signed('POST', '/sapi/v1/asset/get-funding-asset')) as { asset: string; free: string; locked: string; freeze: string }[];
      for (const b of Array.isArray(funding) ? funding : []) add(b.asset, b.free, b.locked, b.freeze);
      const earn = (await signed('GET', '/sapi/v1/simple-earn/flexible/position', { size: 100 })) as { rows?: { asset: string; totalAmount: string }[] };
      for (const r of earn.rows ?? []) add(r.asset, r.totalAmount);
      return totals;
    },

    async myTrades(symbol) {
      const out: SpotTrade[] = [];
      let fromId = 0;
      for (;;) {
        let page: SpotTrade[];
        try {
          page = (await signed('GET', '/api/v3/myTrades', { symbol, fromId, limit: PAGE })) as SpotTrade[];
        } catch (e) {
          if (e instanceof BinanceApiError && e.binanceCode === INVALID_SYMBOL) return [];
          throw e;
        }
        out.push(...page);
        if (page.length < PAGE) return out;
        fromId = page.at(-1)!.id + 1;
      }
    },

    async convertFlow(startMs, endMs) {
      const out: ConvertTrade[] = [];
      for (const [s, e] of windows(startMs, endMs)) {
        const r = (await signed('GET', '/sapi/v1/convert/tradeFlow', { startTime: s, endTime: e, limit: PAGE })) as { list?: ConvertTrade[] };
        out.push(...(r.list ?? []).filter((t) => t.orderStatus === 'SUCCESS'));
      }
      return out;
    },

    async fiatBuys(startMs, endMs) {
      const out: FiatBuy[] = [];
      for (const [s, e] of windows(startMs, endMs)) {
        const r = (await signed('GET', '/sapi/v1/fiat/payments', { transactionType: 0, beginTime: s, endTime: e })) as { data?: FiatBuy[] | null };
        out.push(...(r.data ?? []).filter((t) => t.status === 'Completed'));
      }
      return out;
    },
  };
}
