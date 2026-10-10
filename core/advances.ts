import { daysBetween, type ISODate } from '@shared/dates';

/** Avance ouverte à proposer dans un rapprochement. */
export type OpenAdvance = { id: number; person: string; amount: number };

/** Revenu sans enveloppe candidat à un rapprochement. */
export type IncomeCandidate = { id: number; label: string; amount: number; date: ISODate };

export type AdvanceSuggestion = { incomeId: number; person: string; advanceIds: number[]; amount: number };

/** Un revenu plus vieux que ça ne propose plus de rapprochement : l'historique se range à la main. */
export const SUGGESTION_WINDOW_DAYS = 60;

/** Mot assez long pour compter dans le rapprochement (« plus de 2 lettres »). */
const MIN_WORD_LENGTH = 3;

function words(s: string): string[] {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((w) => w.length >= MIN_WORD_LENGTH);
}

/** Vrai si le libellé et le nom partagent au moins un mot de plus de 2 lettres. */
function sharesWord(label: string, person: string): boolean {
  const labelWords = new Set(words(label));
  return words(person).some((w) => labelWords.has(w));
}

/**
 * Rapprochements proposés entre des revenus sans enveloppe et des avances ouvertes :
 * libellé et nom de la personne qui partagent un mot, montant égal à une avance ou à la somme
 * des avances ouvertes de cette personne. Un revenu trop ancien, ou déjà rangé, ne propose rien
 * (c'est à l'appelant de ne passer que des revenus sans enveloppe).
 */
export function matchAdvanceSuggestions(incomes: IncomeCandidate[], openAdvances: OpenAdvance[], today: ISODate): AdvanceSuggestion[] {
  const byPerson = new Map<string, OpenAdvance[]>();
  for (const a of openAdvances) byPerson.set(a.person, [...(byPerson.get(a.person) ?? []), a]);

  const suggestions: AdvanceSuggestion[] = [];
  for (const income of incomes) {
    if (daysBetween(income.date, today) > SUGGESTION_WINDOW_DAYS) continue;
    for (const [person, advances] of byPerson) {
      if (!sharesWord(income.label, person)) continue;
      const single = advances.find((a) => a.amount === income.amount);
      if (single) {
        suggestions.push({ incomeId: income.id, person, advanceIds: [single.id], amount: income.amount });
        break;
      }
      const total = advances.reduce((s, a) => s + a.amount, 0);
      if (total === income.amount) {
        suggestions.push({ incomeId: income.id, person, advanceIds: advances.map((a) => a.id), amount: income.amount });
        break;
      }
    }
  }
  return suggestions;
}
