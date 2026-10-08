import type { BankSyncRunResult } from '@shared/api-types';
import { formatDateLong, formatDateShort, today } from '@shared/dates';
import type { TransactionKind } from '@shared/schemas';

export const KIND_LABELS: Record<TransactionKind, string> = {
  expense: 'Dépense',
  income: 'Revenu',
  transfer: 'Virement',
  allocation: 'Répartition',
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

/** Date courte, avec l'année quand ce n'est pas l'année en cours : « 5 oct. », « 22 déc. 2025 ». */
export function formatDateCompact(iso: string): string {
  return iso.slice(0, 4) === today().slice(0, 4) ? formatDateShort(iso) : `${formatDateShort(iso)} ${iso.slice(0, 4)}`;
}

export function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n} ${n > 1 ? pluralForm : singular}`;
}

export function inDays(n: number): string {
  if (n <= 0) return "aujourd'hui";
  if (n === 1) return 'demain';
  return `dans ${n} j`;
}

/** « 4 oct., 10:32 » à partir d'un horodatage ISO. */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * Résumé d'une synchronisation bancaire pour un toast : « 3 opérations synchronisées, 2 rapprochées ».
 * Null quand rien n'a été créé ni rapproché.
 */
export function syncSummary(result: BankSyncRunResult): string | null {
  const created = result.connections.reduce((n, c) => n + c.created, 0);
  const matched = result.connections.reduce((n, c) => n + c.matched, 0);
  if (created === 0 && matched === 0) return null;
  if (matched === 0) return plural(created, 'opération synchronisée', 'opérations synchronisées');
  if (created === 0) return plural(matched, 'opération rapprochée', 'opérations rapprochées');
  return `${plural(created, 'opération synchronisée', 'opérations synchronisées')}, ${plural(matched, 'rapprochée')}`;
}

/**
 * Empêche un montant écrit en texte libre de se couper en fin de ligne : espaces des milliers
 * en espace fine insécable, espace avant l'unité en espace insécable (« 1 223,17 € »).
 */
export function keepAmountsTogether(text: string): string {
  return text.replace(/(\d) (?=\d{3}(?!\d))/g, '$1 ').replace(/(\d) (€|k€|%)/g, '$1 $2');
}
