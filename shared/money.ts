/** Montant en centimes entiers. */
export type Cents = number;

const NBSP = '\u00a0';
const NNBSP = '\u202f';

const formatter = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatEuros(cents: Cents, options: { signed?: boolean } = {}): string {
  const abs = Math.abs(cents);
  const body = formatter.format(abs / 100).replace(/[\u00a0\u202f]/g, ' ');
  const sign = cents < 0 ? '-' : options.signed && cents > 0 ? '+' : '';
  return `${sign}${body} €`;
}

/**
 * Convertit une saisie utilisateur en centimes.
 * Accepte la virgule ou le point décimal, les espaces de milliers et le symbole €.
 */
export function parseEuros(input: string): Cents | null {
  const cleaned = input
    .replace(/€/g, '')
    .replace(new RegExp(`[\\s${NBSP}${NNBSP}]`, 'g'), '')
    .replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned) && !/^-?\.\d+$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}
