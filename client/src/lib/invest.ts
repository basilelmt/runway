import type { IdeaView } from '@shared/api-types';
import { PLATFORM_LABELS, type Platform } from '@shared/invest';
import { plural } from './format';

const pct = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Fraction en pourcentage français : 0.1234 donne « 12,3 % » (« +12,3 % » si signé), null donne « - ». */
export function formatPct(fraction: number | null, opts: { signed?: boolean } = {}): string {
  if (fraction === null) return '-';
  const value = Math.round(fraction * 1000) / 10;
  const body = pct.format(Math.abs(value)).replace(/[\u00a0\u202f]/g, ' ');
  const sign = value < 0 ? '-' : opts.signed && value > 0 ? '+' : '';
  return `${sign}${body} %`;
}

/** Quantité en écriture française, au plus 8 décimales. */
export function formatQty(q: string): string {
  const n = Number(q);
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 8 }).format(n).replace(/[\u00a0\u202f]/g, ' ');
}

export function gainTone(n: number | null): 'positive' | 'negative' | 'neutral' {
  if (n === null || n === 0) return 'neutral';
  return n > 0 ? 'positive' : 'negative';
}

export const platformLabel = (p: Platform) => PLATFORM_LABELS[p];

/** Domaine d'une URL, sans « www. » : « lesechos.fr ». */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** « Avant l'idée : +18,0 % sur 3 mois (S&P 500 +4,0 %) » : ce que le cours avait déjà fait quand l'idée a été proposée. */
export function formatMarketContext(m: { perf3m: number; benchPerf3m: number }): string {
  return `Avant l’idée\u{a0}: ${formatPct(m.perf3m, { signed: true })} sur 3 mois (S&P 500 ${formatPct(m.benchPerf3m, { signed: true })})`;
}

/** Résultat d'une fournée en une ligne. */
export function runOutcome(run: { acceptedCount: number; candidateCount: number }): string {
  if (run.candidateCount === 0) return 'Aucune piste trouvée';
  const pistes = plural(run.candidateCount, 'piste');
  if (run.acceptedCount === 0) return `Rien de convaincant cette fois · ${pistes} ${run.candidateCount > 1 ? 'écartées' : 'écartée'}`;
  return `${plural(run.acceptedCount, 'idée retenue', 'idées retenues')} sur ${pistes}`;
}

export function failedAnglesText(angles: { label: string }[]): string {
  const names = new Intl.ListFormat('fr', { type: 'conjunction' }).format(angles.map((a) => a.label));
  return angles.length > 1 ? `Les chercheurs ${names} n’ont pas répondu.` : `Le chercheur ${names} n’a pas répondu.`;
}

/** Gain moyen des idées (100 € sur chacune) et celui du S&P 500 sur les mêmes périodes ; null sans idée cotée. */
export function ideasTotal(ideas: IdeaView[]): { count: number; ideas: number; bench: number } | null {
  const priced = ideas.filter((i): i is IdeaView & { return: number; benchReturn: number } => i.return !== null && i.benchReturn !== null);
  if (priced.length === 0) return null;
  const avg = (pick: (i: (typeof priced)[number]) => number) => priced.reduce((s, i) => s + pick(i), 0) / priced.length;
  return { count: priced.length, ideas: avg((i) => i.return), bench: avg((i) => i.benchReturn) };
}
