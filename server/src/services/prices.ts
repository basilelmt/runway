import { and, desc, eq, gte } from 'drizzle-orm';
import { majorCurrency, priceOn, toEur, type DatedPrice } from '@core/invest';
import type { AssetSearchResult } from '@shared/api-types';
import { addDays, compareISODate, toISODate, type ISODate } from '@shared/dates';
import type { Db } from '../db/client';
import { priceTickers, prices } from '../db/schema';
import { AppError } from '../errors';

export type HttpFetch = (url: string, init?: RequestInit) => Promise<Response>;
export type PricesDeps = { fetch?: HttpFetch; now?: () => Date };
export type TickerHistory = { ticker: string; name: string; currency: string; closes: DatedPrice[]; stale: boolean };
export type Prices = {
  search(query: string): Promise<AssetSearchResult[]>;
  /** Historique en devise de cotation depuis `from` ; null si le ticker est inconnu et absent du cache. */
  history(ticker: string, from: ISODate): Promise<TickerHistory | null>;
  /** Historique converti en euros, jour par jour (taux du jour, à défaut le dernier connu avant). */
  historyEur(ticker: string, from: ISODate): Promise<(TickerHistory & { closesEur: DatedPrice[] }) | null>;
  /** Clôture en euros à une date (dernière connue avant), null si inconnue. */
  closeEurOn(ticker: string, date: ISODate): Promise<{ eur: number; date: ISODate; stale: boolean } | null>;
  /** Dernier cours en euros. */
  quoteEur(ticker: string): Promise<{ eur: number; date: ISODate; stale: boolean; name: string } | null>;
};

export const REFRESH_MINUTES = 15;
/** Marge pour retrouver la dernière clôture connue avant une date (fins de semaine, jours fériés). */
const LOOKBACK_DAYS = 10;
/** Chevauchement sur les derniers jours en base : absorbe les corrections de clôture publiées après coup. */
const OVERLAP_DAYS = 7;
const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) Runway';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonValue = any;

function unixSeconds(iso: ISODate): number {
  return Math.floor(Date.parse(`${iso}T00:00:00Z`) / 1000);
}

/** Date calendaire à la place de cotation : l'horodatage UTC décalé de `gmtoffset` est relu en UTC. */
function exchangeDate(timestamp: number, gmtoffset: number): ISODate {
  return new Date((timestamp + gmtoffset) * 1000).toISOString().slice(0, 10);
}

type ChartResult = { name: string; currency: string; closes: DatedPrice[] };

/** Appel réseau et analyse de la réponse `/v8/finance/chart`. Ne lève jamais : `'unknown'` ou `'error'` en cas d'échec. */
async function fetchChart(fetchFn: HttpFetch, ticker: string, from: ISODate, to: ISODate): Promise<ChartResult | 'unknown' | 'error'> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${unixSeconds(from)}&period2=${unixSeconds(to)}&interval=1d`;
  let res: Response;
  try {
    res = await fetchFn(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(10_000) });
  } catch {
    return 'error';
  }
  let body: JsonValue;
  try {
    body = await res.json();
  } catch {
    return 'error';
  }
  const chart = body?.chart;
  const result = chart?.result;
  // Ticker inconnu : Yahoo renvoie `result: null` et `error` renseigné (vu en HTTP 404).
  if (!result || result.length === 0 || chart?.error) return 'unknown';
  if (!res.ok) return 'error';

  const r = result[0];
  const meta = r?.meta;
  if (!meta || typeof meta.currency !== 'string') return 'error';
  const timestamps: number[] = r.timestamp ?? [];
  const rawCloses: (number | null)[] = r.indicators?.quote?.[0]?.close ?? [];
  const byDate = new Map<ISODate, number>();
  for (let i = 0; i < timestamps.length; i++) {
    const close = rawCloses[i];
    if (close === null || close === undefined) continue;
    byDate.set(exchangeDate(timestamps[i]!, meta.gmtoffset), close);
  }
  // Le cours courant écrase (ou ajoute) la clôture du jour.
  if (typeof meta.regularMarketPrice === 'number' && typeof meta.regularMarketTime === 'number') {
    byDate.set(exchangeDate(meta.regularMarketTime, meta.gmtoffset), meta.regularMarketPrice);
  }
  const closes = [...byDate.entries()]
    .map(([date, close]) => ({ date, close }))
    .sort((a, b) => compareISODate(a.date, b.date));
  return { name: meta.longName ?? meta.shortName ?? ticker, currency: meta.currency, closes };
}

function readStored(db: Db, ticker: string, from: ISODate, stale: boolean): TickerHistory | null {
  const t = db.select().from(priceTickers).where(eq(priceTickers.ticker, ticker)).get();
  if (!t) return null;
  const closes = db
    .select({ date: prices.date, close: prices.close })
    .from(prices)
    .where(and(eq(prices.ticker, ticker), gte(prices.date, from)))
    .orderBy(prices.date)
    .all();
  return { ticker, name: t.name, currency: t.currency, closes, stale };
}

function lastStoredDate(db: Db, ticker: string): ISODate | null {
  const row = db.select({ date: prices.date }).from(prices).where(eq(prices.ticker, ticker)).orderBy(desc(prices.date)).limit(1).get();
  return row?.date ?? null;
}

function storeChart(db: Db, ticker: string, data: ChartResult, requestedFrom: ISODate, now: Date): void {
  const existing = db.select().from(priceTickers).where(eq(priceTickers.ticker, ticker)).get();
  const historyFrom = existing && compareISODate(existing.historyFrom, requestedFrom) <= 0 ? existing.historyFrom : requestedFrom;
  const fetchedAt = now.toISOString();
  db.transaction((tx) => {
    const t = tx as unknown as Db;
    t.insert(priceTickers)
      .values({ ticker, name: data.name, currency: data.currency, historyFrom, refreshedAt: fetchedAt })
      .onConflictDoUpdate({ target: priceTickers.ticker, set: { name: data.name, currency: data.currency, historyFrom, refreshedAt: fetchedAt } })
      .run();
    for (const point of data.closes) {
      t.insert(prices)
        .values({ ticker, date: point.date, close: point.close, currency: data.currency, fetchedAt })
        .onConflictDoUpdate({ target: [prices.ticker, prices.date], set: { close: point.close, currency: data.currency, fetchedAt } })
        .run();
    }
  });
}

export function createPrices(db: Db, deps: PricesDeps = {}): Prices {
  const fetchFn = deps.fetch ?? fetch;
  const now = deps.now ?? (() => new Date());

  async function history(ticker: string, from: ISODate): Promise<TickerHistory | null> {
    const existing = db.select().from(priceTickers).where(eq(priceTickers.ticker, ticker)).get();
    const fresh = existing ? now().getTime() - new Date(existing.refreshedAt).getTime() < REFRESH_MINUTES * 60_000 : false;
    if (existing && compareISODate(existing.historyFrom, from) <= 0 && fresh) {
      return readStored(db, ticker, from, false);
    }

    const covered = existing !== undefined && compareISODate(existing.historyFrom, from) <= 0;
    let start = from;
    if (covered) {
      const last = lastStoredDate(db, ticker) ?? existing!.historyFrom;
      const overlapFrom = addDays(last, -OVERLAP_DAYS);
      start = compareISODate(from, overlapFrom) <= 0 ? from : overlapFrom;
    }
    const today = toISODate(now());
    const to = addDays(today, 1);
    const result = await fetchChart(fetchFn, ticker, start, to);
    if (result === 'unknown' || result === 'error') return readStored(db, ticker, from, true);

    storeChart(db, ticker, result, from, now());
    return readStored(db, ticker, from, false);
  }

  /** Convertit l'historique vers l'euro ; `fx` est l'historique de `EUR<devise>=X`, absent si la devise est déjà l'euro. */
  function convert(h: TickerHistory, fx: TickerHistory | null): { closesEur: DatedPrice[]; stale: boolean } {
    const needsFx = majorCurrency(h.currency) !== 'EUR';
    const closesEur: DatedPrice[] = [];
    for (const point of h.closes) {
      const rate = fx ? (priceOn(fx.closes, point.date)?.close ?? null) : null;
      const eur = toEur(point.close, h.currency, rate);
      if (eur !== null) closesEur.push({ date: point.date, close: eur });
    }
    return { closesEur, stale: h.stale || (needsFx && (!fx || fx.stale)) };
  }

  async function historyEur(ticker: string, from: ISODate): Promise<(TickerHistory & { closesEur: DatedPrice[] }) | null> {
    const h = await history(ticker, from);
    if (!h) return null;
    const major = majorCurrency(h.currency);
    const fx = major === 'EUR' ? null : await history(`EUR${major}=X`, from);
    return { ...h, ...convert(h, fx) };
  }

  async function closeEurOn(ticker: string, date: ISODate): Promise<{ eur: number; date: ISODate; stale: boolean } | null> {
    const h = await historyEur(ticker, addDays(date, -LOOKBACK_DAYS));
    if (!h) return null;
    const point = priceOn(h.closesEur, date);
    if (!point) return null;
    return { eur: point.close, date: point.date, stale: h.stale };
  }

  async function quoteEur(ticker: string): Promise<{ eur: number; date: ISODate; stale: boolean; name: string } | null> {
    const today = toISODate(now());
    const h = await historyEur(ticker, addDays(today, -LOOKBACK_DAYS));
    if (!h || h.closesEur.length === 0) return null;
    const last = h.closesEur.at(-1)!;
    return { eur: last.close, date: last.date, stale: h.stale, name: h.name };
  }

  async function search(query: string): Promise<AssetSearchResult[]> {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0`;
    let body: JsonValue;
    try {
      const res = await fetchFn(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      body = await res.json();
    } catch {
      throw new AppError('Recherche Yahoo indisponible', 502, 'yahoo_unavailable');
    }
    const quotes: JsonValue[] = Array.isArray(body?.quotes) ? body.quotes : [];
    return quotes
      .filter((q) => typeof q?.symbol === 'string' && q.isYahooFinance !== false)
      .map((q) => ({
        ticker: q.symbol as string,
        name: (q.longname ?? q.shortname ?? q.symbol) as string,
        exchange: (q.exchDisp ?? q.exchange ?? '') as string,
        type: (q.typeDisp ?? q.quoteType ?? '') as string,
      }));
  }

  return { search, history, historyEur, closeEurOn, quoteEur };
}
