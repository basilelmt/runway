import { addDays, addMonths, daysInMonth, fromParts, parts, type ISODate } from '@shared/dates';
import type { RecurringRule } from '@shared/schemas';

type RuleSchedule = Pick<
  RecurringRule,
  'frequency' | 'interval' | 'dayOfMonth' | 'startDate' | 'endDate' | 'active'
>;

/** Itère toutes les occurrences d'une règle à partir de son début, sans limite. */
function* occurrences(rule: RuleSchedule): Generator<ISODate> {
  const step = Math.max(1, rule.interval);
  const { year, month, day } = parts(rule.startDate);
  switch (rule.frequency) {
    case 'daily': {
      for (let i = 0; ; i++) yield addDays(rule.startDate, i * step);
    }
    case 'weekly': {
      for (let i = 0; ; i++) yield addDays(rule.startDate, i * 7 * step);
    }
    case 'monthly': {
      const wanted = rule.dayOfMonth ?? day;
      // Première occurrence : le jour visé dans le mois de départ s'il n'est pas déjà passé, sinon le mois suivant.
      const firstDay = Math.min(wanted, daysInMonth(year, month));
      const first = fromParts(year, month, firstDay);
      let base = first >= rule.startDate ? first : addMonths(first, 1, wanted);
      const anchor = base;
      for (let i = 0; ; i++) {
        base = i === 0 ? anchor : addMonths(anchor, i * step, wanted);
        yield base;
      }
    }
    case 'yearly': {
      const wanted = rule.dayOfMonth ?? day;
      const firstDay = Math.min(wanted, daysInMonth(year, month));
      const first = fromParts(year, month, firstDay);
      const anchor = first >= rule.startDate ? first : addMonths(first, 12, wanted);
      for (let i = 0; ; i++) yield addMonths(anchor, i * 12 * step, wanted);
    }
  }
}

/** Dates d'occurrence dans [from, to], bornes incluses. */
export function expandRule(rule: RuleSchedule, from: ISODate, to: ISODate): ISODate[] {
  if (!rule.active) return [];
  const end = rule.endDate && rule.endDate < to ? rule.endDate : to;
  const out: ISODate[] = [];
  for (const d of occurrences(rule)) {
    if (d > end) break;
    if (d >= from) out.push(d);
  }
  return out;
}

/** Première occurrence strictement après `after`, ou null si la règle est finie. */
export function nextOccurrence(rule: RuleSchedule, after: ISODate): ISODate | null {
  if (!rule.active) return null;
  for (const d of occurrences(rule)) {
    if (rule.endDate && d > rule.endDate) return null;
    if (d > after) return d;
  }
  return null;
}

/** Montant mensuel équivalent, pour comparer des règles de fréquences différentes. */
export function monthlyEquivalent(rule: Pick<RecurringRule, 'frequency' | 'interval' | 'amount'>): number {
  const step = Math.max(1, rule.interval);
  switch (rule.frequency) {
    case 'daily':
      return Math.round((rule.amount * 365) / 12 / step);
    case 'weekly':
      return Math.round((rule.amount * 52) / 12 / step);
    case 'monthly':
      return Math.round(rule.amount / step);
    case 'yearly':
      return Math.round(rule.amount / 12 / step);
  }
}
