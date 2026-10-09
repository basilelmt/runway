import type { Account, Transaction } from '@shared/schemas';

/**
 * Nom affiché d'une opération : le marchand pour une dépense ou un revenu, sinon le libellé.
 * Un virement entre comptes n'a pas de marchand par construction : son libellé bancaire brut
 * (« VIREMENT PERMANENT POUR MR X COMPTE FR21... ») ne dit rien à l'utilisateur, le compte en face si.
 * `viewAccountId` choisit le sens : vu depuis le compte crédité, on affiche plutôt le compte débité.
 */
export function displayLabel(
  t: Pick<Transaction, 'kind' | 'label' | 'merchantName' | 'accountId' | 'toAccountId'>,
  accounts?: Map<number, Pick<Account, 'name'>>,
  viewAccountId?: number,
): string {
  if (t.kind === 'transfer' && accounts) {
    const fromView = viewAccountId !== undefined && t.toAccountId === viewAccountId && t.accountId !== viewAccountId;
    const other = fromView ? t.accountId : t.toAccountId;
    const name = other != null ? accounts.get(other)?.name : undefined;
    if (name) return fromView ? `Virement depuis ${name}` : `Virement vers ${name}`;
  }
  return t.merchantName ?? t.label;
}
