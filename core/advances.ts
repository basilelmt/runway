import { addDays, type ISODate } from '@shared/dates';

/** Avance ouverte à proposer dans un rapprochement, avec la date de la dépense qui la porte. */
export type OpenAdvance = { id: number; person: string; amount: number; expenseDate: ISODate };

/** Revenu sans enveloppe candidat à un rapprochement. */
export type IncomeCandidate = { id: number; label: string; amount: number; date: ISODate };

export type AdvanceSuggestion = { incomeId: number; person: string; advanceIds: number[]; amount: number };

/**
 * Fenêtre d'un rapprochement, relative à la dépense (pas à aujourd'hui) : un ami peut rembourser
 * un peu avant (quelques jours) ou longtemps après (jusqu'à 60 jours), quelle que soit la date du jour.
 */
const WINDOW_BEFORE_DAYS = 7;
const WINDOW_AFTER_DAYS = 60;

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

/** Vrai si `date` tombe dans la fenêtre de rapprochement d'un groupe d'avances, bornée par leurs dépenses. */
function inWindow(date: ISODate, advances: OpenAdvance[]): boolean {
  const dates = advances.map((a) => a.expenseDate);
  const earliest = dates.reduce((a, b) => (b < a ? b : a));
  const latest = dates.reduce((a, b) => (b > a ? b : a));
  return date >= addDays(earliest, -WINDOW_BEFORE_DAYS) && date <= addDays(latest, WINDOW_AFTER_DAYS);
}

/**
 * Rapprochements proposés entre des revenus sans enveloppe et des avances ouvertes :
 * libellé et nom de la personne qui partagent un mot, montant égal à une avance ou à la somme
 * des avances ouvertes de cette personne, revenu daté de quelques jours avant la dépense à 60 jours
 * après elle (c'est à l'appelant de ne passer que des revenus sans enveloppe).
 */
export function matchAdvanceSuggestions(incomes: IncomeCandidate[], openAdvances: OpenAdvance[]): AdvanceSuggestion[] {
  const byPerson = new Map<string, OpenAdvance[]>();
  for (const a of openAdvances) byPerson.set(a.person, [...(byPerson.get(a.person) ?? []), a]);

  const suggestions: AdvanceSuggestion[] = [];
  for (const income of incomes) {
    for (const [person, advances] of byPerson) {
      if (!sharesWord(income.label, person)) continue;
      const single = advances.find((a) => a.amount === income.amount);
      if (single && inWindow(income.date, [single])) {
        suggestions.push({ incomeId: income.id, person, advanceIds: [single.id], amount: income.amount });
        break;
      }
      const total = advances.reduce((s, a) => s + a.amount, 0);
      if (total === income.amount && inWindow(income.date, advances)) {
        suggestions.push({ incomeId: income.id, person, advanceIds: advances.map((a) => a.id), amount: income.amount });
        break;
      }
    }
  }
  return suggestions;
}
