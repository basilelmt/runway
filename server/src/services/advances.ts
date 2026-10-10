import { matchAdvanceSuggestions } from '@core/advances';
import type { AdvanceSuggestionView } from '@shared/api-types';
import { addMonths, type ISODate } from '@shared/dates';
import type { Transaction } from '@shared/schemas';
import type { Db } from '../db/client';
import { listOpenAdvancesWithExpense, listUnsortedIncomeCandidates } from '../repos/advances';
import { getTransaction } from '../repos/transactions';

/** Rapprochements proposés entre les revenus sans enveloppe et les avances ouvertes (fenêtre relative à chaque dépense). */
export function buildAdvanceSuggestions(db: Db): AdvanceSuggestionView[] {
  const openAdvances = listOpenAdvancesWithExpense(db);
  const incomes = listUnsortedIncomeCandidates(db);
  const matches = matchAdvanceSuggestions(incomes, openAdvances);

  const advanceById = new Map(openAdvances.map((a) => [a.id, a]));
  const incomeById = new Map(incomes.map((i) => [i.id, i]));

  return matches.map((m) => {
    const income = incomeById.get(m.incomeId)!;
    const expenses = [...new Map(m.advanceIds.map((id) => advanceById.get(id)!).map((a) => [a.expenseId, { id: a.expenseId, label: a.expenseLabel, date: a.expenseDate }])).values()];
    return {
      incomeId: m.incomeId,
      incomeLabel: income.displayLabel,
      incomeAmount: income.amount,
      incomeDate: income.date,
      person: m.person,
      advanceIds: m.advanceIds,
      amount: m.amount,
      expenses,
    };
  });
}

/** Nombre de mois de revenus sans enveloppe proposés au rangement manuel. */
const UNSORTED_INCOME_MONTHS = 6;

/**
 * Revenus sans enveloppe des 6 derniers mois, pour ranger vite un remboursement passé : ceux déjà
 * proposés en rapprochement n'y figurent pas. Opérations complètes (comme `UnsortedList`, côté dépenses)
 * pour pouvoir les ranger d'un PUT sans écraser leurs autres champs.
 */
export function buildUnsortedIncomes(db: Db, today: ISODate): Transaction[] {
  const since = addMonths(today, -UNSORTED_INCOME_MONTHS);
  const candidates = listUnsortedIncomeCandidates(db, { from: since });
  const suggestedIds = new Set(buildAdvanceSuggestions(db).map((s) => s.incomeId));
  return candidates.filter((c) => !suggestedIds.has(c.id)).map((c) => getTransaction(db, c.id));
}
