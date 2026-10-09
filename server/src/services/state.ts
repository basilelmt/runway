import { withBudgets } from '@core/budget';
import type { State } from '@core/types';
import type { BudgetedEnvelope } from '@shared/api-types';
import type { ISODate } from '@shared/dates';
import type { RecurringRule } from '@shared/schemas';
import type { Db } from '../db/client';
import { listAccounts } from '../repos/accounts';
import { listEnvelopes } from '../repos/envelopes';
import { listRules } from '../repos/recurring-rules';
import { allTransactions } from '../repos/transactions';

/** Enveloppes avec leur budget du mois de `today` : charges fixes ramenées au mois, plus le complément. */
export function listBudgetedEnvelopes(db: Db, today: ISODate, { includeArchived = false } = {}): BudgetedEnvelope[] {
  return withBudgets(listEnvelopes(db, { includeArchived }), listRules(db), today);
}

/** Charge tout l'état nécessaire aux calculs purs du moteur ; les budgets sont ceux du mois de `today`. */
export function loadState(db: Db, today: ISODate): State & { rules: RecurringRule[] } {
  const rules = listRules(db);
  return {
    accounts: listAccounts(db, { includeArchived: true }),
    envelopes: withBudgets(listEnvelopes(db, { includeArchived: true }), rules, today),
    transactions: allTransactions(db),
    rules,
  };
}
