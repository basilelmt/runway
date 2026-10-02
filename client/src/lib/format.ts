import { formatDateLong, formatDateShort, today } from '@shared/dates';
import type { TransactionKind } from '@shared/schemas';

export const KIND_LABELS: Record<TransactionKind, string> = {
  expense: 'Dépense',
  income: 'Revenu',
  transfer: 'Transfert',
  allocation: 'Allocation',
};

export const FREQUENCY_LABELS = {
  daily: 'Tous les jours',
  weekly: 'Toutes les semaines',
  monthly: 'Tous les mois',
  yearly: 'Tous les ans',
} as const;

/** "Aujourd'hui", "Hier", ou la date courte. */
export function relativeDay(iso: string): string {
  const t = today();
  if (iso === t) return "Aujourd'hui";
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (iso === yesterday.toISOString().slice(0, 10)) return 'Hier';
  return formatDateLong(iso);
}

export { formatDateLong, formatDateShort };

export function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n} ${n > 1 ? pluralForm : singular}`;
}

export function inDays(n: number): string {
  if (n <= 0) return "aujourd'hui";
  if (n === 1) return 'demain';
  return `dans ${n} j`;
}
