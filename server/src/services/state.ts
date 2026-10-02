import type { State } from '@core/types';
import type { RecurringRule } from '@shared/schemas';
import type { Db } from '../db/client';
import { listAccounts } from '../repos/accounts';
import { listEnvelopes } from '../repos/envelopes';
import { listRules } from '../repos/recurring-rules';
import { allTransactions } from '../repos/transactions';

/** Charge tout l'état nécessaire aux calculs purs du moteur. */
export function loadState(db: Db): State & { rules: RecurringRule[] } {
  return {
    accounts: listAccounts(db, { includeArchived: true }),
    envelopes: listEnvelopes(db, { includeArchived: true }),
    transactions: allTransactions(db),
    rules: listRules(db),
  };
}
