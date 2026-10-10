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

const BACKUP_MOMENT_DAY = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' });
const BACKUP_MOMENT_DAY_YEAR = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function hourMinute(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')} h ${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Moment d'une sauvegarde, en heure locale : « aujourd’hui à 8 h 00 », « hier à 23 h 13 », « le 8 octobre à 23 h 13 ». */
export function formatBackupMoment(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (isSameLocalDay(d, now)) return `aujourd’hui à ${hourMinute(d)}`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameLocalDay(d, yesterday)) return `hier à ${hourMinute(d)}`;
  return `le ${BACKUP_MOMENT_DAY.format(d)} à ${hourMinute(d)}`;
}

/** Comme `formatBackupMoment`, avec sa préposition : « d’aujourd’hui à 8 h 00 », « d’hier à 23 h 13 », « du 8 octobre à 23 h 13 ». */
export function formatBackupMomentWithPreposition(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (isSameLocalDay(d, now)) return `d’aujourd’hui à ${hourMinute(d)}`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameLocalDay(d, yesterday)) return `d’hier à ${hourMinute(d)}`;
  return `du ${BACKUP_MOMENT_DAY.format(d)} à ${hourMinute(d)}`;
}

/** Moment d'une sauvegarde pour une ligne de liste, toujours en date absolue : « 8 oct. 2026 à 23 h 13 ». */
export function formatBackupMomentCompact(iso: string): string {
  const d = new Date(iso);
  return `${BACKUP_MOMENT_DAY_YEAR.format(d)} à ${hourMinute(d)}`;
}

/** Taille d'une sauvegarde, en Mo (toujours avec une décimale, même pour une petite base). */
export function formatBackupSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
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

/** Espace insécable, pour coller un séparateur « · » au texte qui le précède. */
export const NBSP = '\u00a0';

/**
 * Empêche les coupures malvenues dans un texte libre : espaces des milliers en espace fine insécable,
 * espace avant l'unité, avant les deux-points et intérieures des guillemets en espace insécable (« 1 223,17 € »),
 * espace fine insécable avant ; ? et !.
 */
export function keepTogether(text: string): string {
  return text
    .replace(/(\d) (?=\d{3}(?!\d))/g, '$1 ')
    .replace(/(\d) (€|k€|%)/g, '$1 $2')
    .replace(/« /g, '« ')
    .replace(/ »/g, ' »')
    .replace(/ ([;?!])/g, ' $1')
    .replace(/ :/g, ' :');
}
