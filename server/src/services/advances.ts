import { matchAdvanceSuggestions } from '@core/advances';
import type { AdvanceSuggestionView } from '@shared/api-types';
import type { ISODate } from '@shared/dates';
import type { Db } from '../db/client';
import { listOpenAdvancesWithExpense, listUnsortedIncomeCandidates } from '../repos/advances';

/** Un revenu plus vieux que ça ne propose plus de rapprochement : voir `core/advances`. */
const SUGGESTION_WINDOW_DAYS = 60;

/** Rapprochements proposés entre les revenus sans enveloppe récents et les avances ouvertes. */
export function buildAdvanceSuggestions(db: Db, today: ISODate): AdvanceSuggestionView[] {
  const openAdvances = listOpenAdvancesWithExpense(db);
  const incomes = listUnsortedIncomeCandidates(db, today, SUGGESTION_WINDOW_DAYS);
  const matches = matchAdvanceSuggestions(incomes, openAdvances, today);

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
