import type { Transaction } from '@shared/schemas';

/** Nom affiché d'une opération : le marchand pour une dépense ou un revenu, sinon le libellé. */
export function displayLabel(t: Pick<Transaction, 'label' | 'merchantName'>): string {
  return t.merchantName ?? t.label;
}
