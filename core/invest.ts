import { addDays, compareISODate, type ISODate } from '@shared/dates';
import type { Cents } from '@shared/money';

const SCALE = 18;
const ONE = 10n ** BigInt(SCALE);

/** Quantité décimale en texte vers un entier à 18 décimales. */
export function toUnits(q: string): bigint {
  const [int = '0', frac = ''] = q.trim().replace(',', '.').split('.');
  return BigInt(int || '0') * ONE + BigInt((frac + '0'.repeat(SCALE)).slice(0, SCALE) || '0');
}

export function fromUnits(u: bigint): string {
  const int = u / ONE;
  const frac = (u % ONE).toString().padStart(SCALE, '0').replace(/0+$/, '');
  return frac ? `${int}.${frac}` : `${int}`;
}

export const addQty = (a: string, b: string): string => fromUnits(toUnits(a) + toUnits(b));
/** Soustraction bornée à zéro : une quantité détenue n'est jamais négative. */
export const subQty = (a: string, b: string): string => {
  const d = toUnits(a) - toUnits(b);
  return fromUnits(d > 0n ? d : 0n);
};
export const cmpQty = (a: string, b: string): -1 | 0 | 1 => {
  const d = toUnits(a) - toUnits(b);
  return d < 0n ? -1 : d > 0n ? 1 : 0;
};
export const isZeroQty = (q: string): boolean => toUnits(q) === 0n;
export const qtyToNumber = (q: string): number => Number(q);

export type Trade = { side: 'buy' | 'sell'; date: ISODate; quantity: string; amount: Cents; fees: Cents };
export type Position = { quantity: string; costBasis: Cents; realized: Cents };

/** Quantité, coût de revient au prix moyen pondéré et plus-value réalisée, jusqu'à `upTo` inclus. */
export function position(trades: Trade[], upTo?: ISODate): Position {
  const sorted = trades
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => upTo === undefined || compareISODate(t.date, upTo) <= 0)
    .sort((a, b) => compareISODate(a.t.date, b.t.date) || a.i - b.i);
  let qty = 0n;
  let cost = 0;
  let realized = 0;
  for (const { t } of sorted) {
    const q = toUnits(t.quantity);
    if (t.side === 'buy') {
      qty += q;
      cost += t.amount + t.fees;
      continue;
    }
    if (qty === 0n) continue;
    const sold = q > qty ? qty : q;
    const costOut = sold === qty ? cost : Math.round((cost * Number((sold * 1_000_000n) / qty)) / 1_000_000);
    realized += t.amount - t.fees - costOut;
    cost -= costOut;
    qty -= sold;
  }
  return { quantity: fromUnits(qty), costBasis: cost, realized };
}

export const valueCents = (quantity: string, priceEur: number): Cents => Math.round(qtyToNumber(quantity) * priceEur * 100);

export type DatedPrice = { date: ISODate; close: number };

/** Dernière clôture connue à `date` incluse ; `series` triée par date croissante. */
export function priceOn(series: DatedPrice[], date: ISODate): DatedPrice | null {
  let found: DatedPrice | null = null;
  for (const p of series) {
    if (compareISODate(p.date, date) > 0) break;
    found = p;
  }
  return found;
}

/**
 * Convertit un montant coté en `currency` vers l'euro.
 * `eurRate` = nombre d'unités de la devise pour 1 € (ticker Yahoo `EURUSD=X`) ; les pence (`GBp`, `GBX`) sont ramenés en livres.
 */
export function toEur(amount: number, currency: string, eurRate: number | null): number | null {
  if (currency === 'EUR') return amount;
  if (eurRate === null || eurRate <= 0) return null;
  const minor = currency === 'GBp' || currency === 'GBX' || currency === 'ZAc' || currency === 'ILA';
  return (minor ? amount / 100 : amount) / eurRate;
}

/** Devise majeure correspondant à une cotation en centièmes. */
export function majorCurrency(currency: string): string {
  if (currency === 'GBp' || currency === 'GBX') return 'GBP';
  if (currency === 'ZAc') return 'ZAR';
  if (currency === 'ILA') return 'ILS';
  return currency;
}

export type SeriesPoint = { date: ISODate; value: Cents; invested: Cents };

/** Valeur et coût de revient du portefeuille jour par jour ; `prices` en euros, triés par date. */
export function portfolioSeries(items: { trades: Trade[]; prices: DatedPrice[] }[], from: ISODate, to: ISODate): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  for (let d = from; compareISODate(d, to) <= 0; d = addDays(d, 1)) {
    let value = 0;
    let invested = 0;
    for (const item of items) {
      const p = position(item.trades, d);
      if (isZeroQty(p.quantity)) continue;
      invested += p.costBasis;
      const price = priceOn(item.prices, d);
      value += price ? valueCents(p.quantity, price.close) : p.costBasis;
    }
    out.push({ date: d, value, invested });
  }
  return out;
}

export function simpleReturn(start: number, end: number): number | null {
  return start > 0 ? end / start - 1 : null;
}

export type ClosedIdea = { return: number; benchReturn: number };
export type IdeasSummaryResult = {
  closedCount: number;
  beatCount: number;
  avgExcess: number | null;
  hundredEach: { invested: Cents; ideas: Cents; bench: Cents };
};

export function ideasSummary(closed: ClosedIdea[]): IdeasSummaryResult {
  const n = closed.length;
  const hundred = (r: number) => Math.round(100_00 * (1 + r));
  return {
    closedCount: n,
    beatCount: closed.filter((c) => c.return > c.benchReturn).length,
    avgExcess: n ? closed.reduce((s, c) => s + c.return - c.benchReturn, 0) / n : null,
    hundredEach: {
      invested: n * 100_00,
      ideas: closed.reduce((s, c) => s + hundred(c.return), 0),
      bench: closed.reduce((s, c) => s + hundred(c.benchReturn), 0),
    },
  };
}

/** Vrai si une vente dépasse, à sa date, la quantité détenue (mouvements pris dans l'ordre chronologique). */
export function hasOversell(trades: Trade[]): boolean {
  const sorted = trades.map((t, i) => ({ t, i })).sort((a, b) => compareISODate(a.t.date, b.t.date) || a.i - b.i);
  let qty = 0n;
  for (const { t } of sorted) {
    const q = toUnits(t.quantity);
    if (t.side === 'buy') qty += q;
    else if (q > qty) return true;
    else qty -= q;
  }
  return false;
}

/** Écriture canonique d'une quantité (« 0.01000000 » devient « 0.01 »). */
export const normalizeQty = (q: string): string => fromUnits(toUnits(q));
