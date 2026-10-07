import { cmpQty, costShare, hasOversell, isZeroQty, portfolioSeries, position, simpleReturn, subQty, toUnits, valueCents, type DatedPrice, type Trade } from '@core/invest';
import type { BinanceState, HoldingView, PortfolioRange, PortfolioView, TradeView } from '@shared/api-types';
import { addDays, compareISODate, type ISODate } from '@shared/dates';
import type { Db } from '../db/client';
import { AppError } from '../errors';
import { listHoldings, listTrades, type HoldingRow, type TradeRow } from '../repos/invest';
import { readSettingKey } from '../repos/settings';
import type { Prices } from './prices';

/** État Binance stocké sous la clé `binance` des réglages ; jamais renvoyé tel quel au client. */
export type BinanceStored = { apiKey: string; apiSecret: string; lastSyncAt: string | null; lastError: string | null };

export function binanceState(db: Db): BinanceState {
  const stored = readSettingKey<BinanceStored>(db, 'binance');
  if (!stored) return { configured: false, apiKeyHint: null, lastSyncAt: null, lastError: null };
  return { configured: true, apiKeyHint: stored.apiKey.slice(-4), lastSyncAt: stored.lastSyncAt, lastError: stored.lastError };
}

const RANGE_DAYS: Record<Exclude<PortfolioRange, 'all'>, number> = { '1m': 30, '6m': 182, '1y': 365 };
const MAX_DAYS = 5 * 365;
/** Marge avant le début de la série pour connaître le cours du premier jour. */
const PRICE_LOOKBACK_DAYS = 10;

const toTrade = (t: TradeRow): Trade => ({ side: t.side, date: t.date, quantity: t.quantity, amount: t.amount, fees: t.fees });

/** Refuse une liste de mouvements où une vente dépasse la quantité détenue à sa date. */
export function assertNoOversell(trades: Trade[]): void {
  if (hasOversell(trades)) throw new AppError('Vente supérieure à la quantité détenue', 400, 'oversell');
}

function seriesStart(range: PortfolioRange, today: ISODate, firstTrade: ISODate | null): ISODate {
  if (range !== 'all') return addDays(today, -RANGE_DAYS[range]);
  const floor = addDays(today, -MAX_DAYS);
  if (!firstTrade) return addDays(today, -RANGE_DAYS['1m']);
  return compareISODate(firstTrade, floor) < 0 ? floor : firstTrade;
}

/** Un point par semaine plus le dernier, pour les longues périodes. */
function weekly<T>(points: T[]): T[] {
  return points.filter((_, i) => i % 7 === 0 || i === points.length - 1);
}

type Valued = { view: HoldingView; trades: Trade[]; closes: DatedPrice[] };

async function valueHolding(h: HoldingRow, rows: TradeRow[], prices: Prices, from: ISODate, today: ISODate): Promise<Valued> {
  const trades = rows.map(toTrade);
  const rebuilt = position(trades);
  const synced = h.source === 'binance' && h.syncedQuantity !== null;
  const quantity = synced ? h.syncedQuantity! : rebuilt.quantity;
  const unpriced = synced && cmpQty(quantity, rebuilt.quantity) > 0 ? subQty(quantity, rebuilt.quantity) : null;
  const missing = synced && cmpQty(quantity, rebuilt.quantity) < 0 ? subQty(rebuilt.quantity, quantity) : null;
  // Ce qui a quitté Binance sort au prix de revient, sans plus-value : coût, plus-value et courbe portent sur ce qui reste.
  if (missing) {
    const costOut = costShare(rebuilt.costBasis, toUnits(missing), toUnits(rebuilt.quantity));
    trades.push({ side: 'sell', date: today, quantity: missing, amount: costOut, fees: 0 });
  }
  const pos = missing ? position(trades) : rebuilt;

  const firstTrade = rows[0]?.date;
  const historyFrom = firstTrade && compareISODate(firstTrade, from) < 0 ? firstTrade : from;
  const history = await prices.historyEur(h.ticker, historyFrom);
  const closes = history?.closesEur ?? [];
  const last = closes.at(-1);
  const prev = closes.at(-2);

  const price = last ? { eur: last.close, date: last.date, stale: history!.stale } : null;
  const value = price ? valueCents(quantity, price.eur) : null;
  const gain = price ? valueCents(pos.quantity, price.eur) - pos.costBasis : null;

  const view: HoldingView = {
    id: h.id,
    platform: h.platform,
    ticker: h.ticker,
    name: h.name,
    source: h.source,
    quantity,
    costBasis: pos.costBasis,
    realized: pos.realized,
    price,
    value,
    gain,
    gainPct: gain !== null && pos.costBasis > 0 ? gain / pos.costBasis : null,
    dayChangePct: last && prev ? simpleReturn(prev.close, last.close) : null,
    unpricedQuantity: unpriced,
    missingQuantity: missing,
    trades: rows.map(
      (t): TradeView => ({ id: t.id, side: t.side, date: t.date, quantity: t.quantity, amount: t.amount, fees: t.fees, source: t.source }),
    ),
  };
  return { view, trades, closes };
}

export async function buildPortfolio(db: Db, prices: Prices, today: ISODate, range: PortfolioRange): Promise<PortfolioView> {
  const allTrades = listTrades(db);
  const byHolding = new Map<number, TradeRow[]>();
  for (const t of allTrades) byHolding.set(t.holdingId, [...(byHolding.get(t.holdingId) ?? []), t]);

  const firstTrade = allTrades.reduce<ISODate | null>((min, t) => (min === null || compareISODate(t.date, min) < 0 ? t.date : min), null);
  const from = seriesStart(range, today, firstTrade);
  const priceFrom = addDays(from, -PRICE_LOOKBACK_DAYS);

  const holdings = listHoldings(db).filter((h) => {
    const rows = byHolding.get(h.id) ?? [];
    const qty = h.source === 'binance' && h.syncedQuantity !== null ? h.syncedQuantity : position(rows.map(toTrade)).quantity;
    return rows.length > 0 || !isZeroQty(qty);
  });
  const valued = await Promise.all(holdings.map((h) => valueHolding(h, byHolding.get(h.id) ?? [], prices, priceFrom, today)));

  // Positions ouvertes par valeur décroissante, positions soldées à la fin.
  const sorted = [...valued].sort((a, b) => {
    const za = isZeroQty(a.view.quantity) ? 1 : 0;
    const zb = isZeroQty(b.view.quantity) ? 1 : 0;
    return za - zb || (b.view.value ?? b.view.costBasis) - (a.view.value ?? a.view.costBasis);
  });

  const totals = sorted.reduce(
    (acc, { view }) => {
      acc.value += view.value ?? view.costBasis;
      acc.invested += view.costBasis;
      acc.realized += view.realized;
      return acc;
    },
    { value: 0, invested: 0, realized: 0 },
  );
  const coveredValue = sorted.reduce((s, { view }) => s + (view.gain !== null ? view.gain + view.costBasis : view.costBasis), 0);
  const gain = coveredValue - totals.invested;

  const daily = portfolioSeries(
    sorted.map(({ trades, closes }) => ({ trades, prices: closes })),
    from,
    today,
  );

  return {
    today,
    totals: { ...totals, gain, gainPct: totals.invested > 0 ? gain / totals.invested : null },
    holdings: sorted.map(({ view }) => view),
    series: range === '1y' || range === 'all' ? weekly(daily) : daily,
    stale: sorted.some(({ view }) => view.price?.stale === true),
    binance: binanceState(db),
  };
}
