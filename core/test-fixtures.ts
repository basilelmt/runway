import type { BudgetedEnvelope } from '@shared/api-types';
import type { Account, Envelope, RecurringRule, Transaction } from '@shared/schemas';

let nextId = 1;

export function resetIds() {
  nextId = 1;
}

export function account(partial: Partial<Account> & { name: string }): Account {
  return {
    id: nextId++,
    initialBalance: 0,
    onBudget: true,
    bankAccountNumber: null,
    archived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

/** Enveloppe déjà enrichie ; `monthlyBudget` suit `monthlyCharges` et `monthlyExtra` sauf s'il est donné. */
export function envelope(partial: Partial<BudgetedEnvelope> & { name: string }): BudgetedEnvelope {
  const e: Envelope & { monthlyCharges: number } = {
    id: nextId++,
    color: '#4f8a5b',
    monthlyExtra: null,
    sortOrder: 0,
    archived: false,
    isSavings: false,
    monthlyCharges: 0,
    ...partial,
  };
  return { ...e, monthlyBudget: partial.monthlyBudget ?? e.monthlyCharges + (e.monthlyExtra ?? 0) };
}

export function tx(partial: Partial<Transaction> & { kind: Transaction['kind']; amount: number }): Transaction {
  return {
    id: nextId++,
    date: '2026-03-01',
    label: 'op',
    note: null,
    accountId: null,
    toAccountId: null,
    envelopeId: null,
    fromEnvelopeId: null,
    status: 'confirmed',
    recurringRuleId: null,
    importId: null,
    fingerprint: null,
    fundingId: null,
    createdAt: '2026-03-01T00:00:00.000Z',
    ...partial,
  };
}

export function rule(partial: Partial<RecurringRule> & { kind: RecurringRule['kind']; amount: number }): RecurringRule {
  return {
    id: nextId++,
    name: 'règle',
    label: 'règle',
    accountId: null,
    toAccountId: null,
    envelopeId: null,
    fromEnvelopeId: null,
    frequency: 'monthly',
    interval: 1,
    dayOfMonth: 1,
    startDate: '2026-01-01',
    endDate: null,
    lastGeneratedDate: null,
    active: true,
    triggersFunding: false,
    fundsNextMonth: false,
    ...partial,
  };
}
