import type { Balances } from '@shared/api-types';
import { compareISODate, monthKey, type ISODate } from '@shared/dates';
import type { Cents } from '@shared/money';
import type { Operation, State } from './types';

export type AccountMap = Record<number, Cents>;
export type EnvelopeMap = Record<number, Cents>;

/** Applique l'effet d'une opération sur des cartes de soldes, en place. */
export function applyOperation(op: Operation, accounts: AccountMap, envelopes: EnvelopeMap, sign = 1): void {
  const a = op.amount * sign;
  switch (op.kind) {
    case 'expense':
      if (op.accountId != null) accounts[op.accountId] = (accounts[op.accountId] ?? 0) - a;
      if (op.envelopeId != null) envelopes[op.envelopeId] = (envelopes[op.envelopeId] ?? 0) - a;
      break;
    case 'income':
      if (op.accountId != null) accounts[op.accountId] = (accounts[op.accountId] ?? 0) + a;
      break;
    case 'transfer':
      if (op.accountId != null) accounts[op.accountId] = (accounts[op.accountId] ?? 0) - a;
      if (op.toAccountId != null) accounts[op.toAccountId] = (accounts[op.toAccountId] ?? 0) + a;
      break;
    case 'allocation':
      if (op.fromEnvelopeId != null) envelopes[op.fromEnvelopeId] = (envelopes[op.fromEnvelopeId] ?? 0) - a;
      if (op.envelopeId != null) envelopes[op.envelopeId] = (envelopes[op.envelopeId] ?? 0) + a;
      break;
  }
}

/**
 * Changement de mois : une enveloppe dépassée repart de zéro, en place.
 * Comme les dépassements comptent dans "À répartir" (comptes moins enveloppes), c'est lui qui les absorbe.
 */
export function rolloverEnvelopes(envelopes: EnvelopeMap): void {
  for (const [id, balance] of Object.entries(envelopes)) {
    if (balance < 0) envelopes[Number(id)] = 0;
  }
}

export function summarize(state: Pick<State, 'accounts' | 'envelopes'>, accounts: AccountMap, envelopes: EnvelopeMap): Balances {
  let toAllocate = 0;
  let netWorth = 0;
  for (const acc of state.accounts) {
    const bal = accounts[acc.id] ?? 0;
    if (acc.archived) continue;
    netWorth += bal;
    if (acc.onBudget) toAllocate += bal;
  }
  for (const env of state.envelopes) {
    if (env.archived) continue;
    toAllocate -= envelopes[env.id] ?? 0;
  }
  return { accounts, envelopes, toAllocate, netWorth };
}

/**
 * Soldes au jour `asOf`. Les enveloppes reportent leur solde positif d'un mois sur l'autre,
 * mais un dépassement n'est visible que dans son mois : au mois suivant, il est pris sur "À répartir".
 */
export function computeBalances(state: State, asOf: ISODate, options: { includePlanned?: boolean } = {}): Balances {
  const accounts: AccountMap = {};
  const envelopes: EnvelopeMap = {};
  for (const acc of state.accounts) accounts[acc.id] = acc.initialBalance;
  for (const env of state.envelopes) envelopes[env.id] = 0;
  let month: string | null = null;
  for (const t of [...state.transactions].sort((a, b) => compareISODate(a.date, b.date))) {
    if (t.status === 'planned' && !options.includePlanned) continue;
    const key = monthKey(t.date);
    if (month !== null && key !== month) rolloverEnvelopes(envelopes);
    month = key;
    applyOperation(t, accounts, envelopes);
  }
  if (month !== null && monthKey(asOf) > month) rolloverEnvelopes(envelopes);
  return summarize(state, accounts, envelopes);
}
