import type { Account, Envelope, RecurringRule, Transaction } from '@shared/schemas';

/** Sous-ensemble d'une opération suffisant pour les calculs de solde. */
export type Operation = Pick<
  Transaction,
  'kind' | 'amount' | 'accountId' | 'toAccountId' | 'envelopeId' | 'fromEnvelopeId'
>;

export type State = {
  accounts: Account[];
  envelopes: Envelope[];
  transactions: Transaction[];
};

export type { Account, Envelope, RecurringRule, Transaction };
