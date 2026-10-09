import { describe, expect, it } from 'vitest';
import { displayLabel } from './merchants';

describe('displayLabel', () => {
  it('nom du marchand, sinon libellé, pour une dépense ou un revenu', () => {
    expect(displayLabel({ kind: 'expense', label: 'ACHAT CB MONOP4801', merchantName: 'Monoprix', accountId: 1, toAccountId: null })).toBe('Monoprix');
    expect(displayLabel({ kind: 'income', label: 'VIR SALAIRE', merchantName: null, accountId: 1, toAccountId: null })).toBe('VIR SALAIRE');
  });

  it('un virement entre comptes affiche le compte crédité, pas le libellé brut', () => {
    const accounts = new Map([
      [1, { name: 'Compte courant' }],
      [2, { name: 'Livret Jeune' }],
    ]);
    expect(
      displayLabel({ kind: 'transfer', label: 'VIREMENT PERMANENT POUR MR X COMPTE FR21 REFERENCE : 123', merchantName: null, accountId: 1, toAccountId: 2 }, accounts),
    ).toBe('Virement vers Livret Jeune');
  });

  it('vu depuis le compte crédité, affiche plutôt le compte débité', () => {
    const accounts = new Map([
      [1, { name: 'Compte courant' }],
      [2, { name: 'Livret Jeune' }],
    ]);
    expect(displayLabel({ kind: 'transfer', label: 'VIREMENT PERMANENT', merchantName: null, accountId: 1, toAccountId: 2 }, accounts, 2)).toBe('Virement depuis Compte courant');
  });

  it('sans les comptes chargés, garde le libellé brut', () => {
    expect(displayLabel({ kind: 'transfer', label: 'VIREMENT PERMANENT POUR MR X', merchantName: null, accountId: 1, toAccountId: 2 })).toBe('VIREMENT PERMANENT POUR MR X');
  });
});
