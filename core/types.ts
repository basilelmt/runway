import type { BudgetedEnvelope } from '@shared/api-types';
import type { Account, Envelope, RecurringRule, Transaction } from '@shared/schemas';

/** Sous-ensemble d'une opération suffisant pour les calculs de solde. */
export type Operation = Pick<
  Transaction,
  'kind' | 'amount' | 'accountId' | 'toAccountId' | 'envelopeId' | 'fromEnvelopeId'
>;

export type State = {
  accounts: Account[];
  /** Enveloppes avec leur budget du mois (voir `withBudgets`). */
  envelopes: BudgetedEnvelope[];
  transactions: Transaction[];
};

export type { Account, BudgetedEnvelope, Envelope, RecurringRule, Transaction };
