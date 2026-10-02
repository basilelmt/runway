import type { Transaction } from '@shared/schemas';

/**
 * Montant signé tel qu'il s'affiche dans une liste : dépense et transfert sortant en négatif,
 * revenu en positif, allocation neutre (positive, affichée sans couleur).
 * Si `viewAccountId` est le compte crédité d'un transfert, le montant est positif.
 */
export function signedAmount(t: Pick<Transaction, 'kind' | 'amount' | 'accountId' | 'toAccountId'>, viewAccountId?: number): number {
  switch (t.kind) {
    case 'expense':
      return -t.amount;
    case 'income':
      return t.amount;
    case 'transfer':
      return viewAccountId !== undefined && t.toAccountId === viewAccountId && t.accountId !== viewAccountId ? t.amount : -t.amount;
    case 'allocation':
      return t.amount;
  }
}
