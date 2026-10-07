/** Date calendaire au format YYYY-MM-DD, sans fuseau. */
export type ISODate = string;

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromParts(year: number, month: number, day: number): ISODate {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function parts(iso: ISODate): { year: number; month: number; day: number } {
  const m = ISO_RE.exec(iso);
  if (!m) throw new Error(`Date invalide: ${iso}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/** Date UTC à midi, pour éviter tout décalage de fuseau dans les calculs. */
function toUTC(iso: ISODate): Date {
  const { year, month, day } = parts(iso);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function fromUTC(d: Date): ISODate {
  return fromParts(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function today(): ISODate {
  return toISODate(new Date());
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isValidISODate(s: string): boolean {
  const m = ISO_RE.exec(s);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12) return false;
  return day >= 1 && day <= daysInMonth(year, month);
}

export function addDays(iso: ISODate, n: number): ISODate {
  const d = toUTC(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUTC(d);
}

/**
 * Ajoute n mois. Le jour visé est `dayOfMonth` (ou le jour de départ),
 * borné au dernier jour du mois d'arrivée.
 */
export function addMonths(iso: ISODate, n: number, dayOfMonth?: number): ISODate {
  const { year, month, day } = parts(iso);
  const total = year * 12 + (month - 1) + n;
  const targetYear = Math.floor(total / 12);
  const targetMonth = (total % 12) + 1;
  const wanted = dayOfMonth ?? day;
  return fromParts(targetYear, targetMonth, Math.min(wanted, daysInMonth(targetYear, targetMonth)));
}

/** Nombre de jours de `from` à `to` (positif si `to` est après). */
export function daysBetween(from: ISODate, to: ISODate): number {
  return Math.round((toUTC(to).getTime() - toUTC(from).getTime()) / 86_400_000);
}

export function startOfMonth(iso: ISODate): ISODate {
  const { year, month } = parts(iso);
  return fromParts(year, month, 1);
}

export function endOfMonth(iso: ISODate): ISODate {
  const { year, month } = parts(iso);
  return fromParts(year, month, daysInMonth(year, month));
}

/** `YYYY-MM` */
export function monthKey(iso: ISODate): string {
  return iso.slice(0, 7);
}

export function compareISODate(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

const longFormatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const shortFormatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const monthFormatter = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
const weekdayFormatter = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const mediumFormatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export function formatDateLong(iso: ISODate): string {
  return longFormatter.format(toUTC(iso));
}

export function formatDateShort(iso: ISODate): string {
  return shortFormatter.format(toUTC(iso));
}

/** « jeu. 1 oct. 2026 », pour les champs de date. */
export function formatDateWithWeekday(iso: ISODate): string {
  return weekdayFormatter.format(toUTC(iso));
}

/** « 1 oct. 2026 ». */
export function formatDateMedium(iso: ISODate): string {
  return mediumFormatter.format(toUTC(iso));
}

export function formatMonth(key: string): string {
  return monthFormatter.format(toUTC(`${key}-01`));
}
