import { beforeEach, describe, expect, it } from 'vitest';
import { computeBalances } from './balances';
import { account, envelope, resetIds, tx } from './test-fixtures';

describe('computeBalances', () => {
  beforeEach(resetIds);

  it('part du solde initial et applique une dépense', () => {
    const courant = account({ name: 'Courant', initialBalance: 100_00 });
    const courses = envelope({ name: 'Courses' });
    const b = computeBalances({
      accounts: [courant],
      envelopes: [courses],
      transactions: [tx({ kind: 'expense', amount: 30_00, accountId: courant.id, envelopeId: courses.id })],
    });
    expect(b.accounts[courant.id]).toBe(70_00);
    expect(b.envelopes[courses.id]).toBe(-30_00);
    expect(b.toAllocate).toBe(100_00);
    expect(b.netWorth).toBe(70_00);
  });

  it('un revenu augmente le compte et "À répartir"', () => {
    const courant = account({ name: 'Courant' });
    const b = computeBalances({
      accounts: [courant],
      envelopes: [],
      transactions: [tx({ kind: 'income', amount: 2000_00, accountId: courant.id })],
    });
    expect(b.accounts[courant.id]).toBe(2000_00);
    expect(b.toAllocate).toBe(2000_00);
  });

  it('un transfert déplace entre comptes sans toucher aux enveloppes', () => {
    const courant = account({ name: 'Courant', initialBalance: 500_00 });
    const livret = account({ name: 'Livret', onBudget: false });
    const b = computeBalances({
      accounts: [courant, livret],
      envelopes: [],
      transactions: [tx({ kind: 'transfer', amount: 200_00, accountId: courant.id, toAccountId: livret.id })],
    });
    expect(b.accounts[courant.id]).toBe(300_00);
    expect(b.accounts[livret.id]).toBe(200_00);
    expect(b.toAllocate).toBe(300_00);
    expect(b.netWorth).toBe(500_00);
  });

  it('une allocation depuis "À répartir" remplit une enveloppe', () => {
    const courant = account({ name: 'Courant', initialBalance: 500_00 });
    const courses = envelope({ name: 'Courses' });
    const b = computeBalances({
      accounts: [courant],
      envelopes: [courses],
      transactions: [tx({ kind: 'allocation', amount: 100_00, envelopeId: courses.id })],
    });
    expect(b.envelopes[courses.id]).toBe(100_00);
    expect(b.toAllocate).toBe(400_00);
    expect(b.accounts[courant.id]).toBe(500_00);
  });

  it('une allocation entre enveloppes ne change pas "À répartir"', () => {
    const courant = account({ name: 'Courant', initialBalance: 500_00 });
    const courses = envelope({ name: 'Courses' });
    const loisirs = envelope({ name: 'Loisirs' });
    const b = computeBalances({
      accounts: [courant],
      envelopes: [courses, loisirs],
      transactions: [
        tx({ kind: 'allocation', amount: 100_00, envelopeId: courses.id }),
        tx({ kind: 'allocation', amount: 40_00, envelopeId: loisirs.id, fromEnvelopeId: courses.id }),
      ],
    });
    expect(b.envelopes[courses.id]).toBe(60_00);
    expect(b.envelopes[loisirs.id]).toBe(40_00);
    expect(b.toAllocate).toBe(400_00);
  });

  it('exclut les comptes hors budget de "À répartir" mais pas de la valeur nette', () => {
    const courant = account({ name: 'Courant', initialBalance: 100_00 });
    const livret = account({ name: 'Livret', initialBalance: 1000_00, onBudget: false });
    const b = computeBalances({ accounts: [courant, livret], envelopes: [], transactions: [] });
    expect(b.toAllocate).toBe(100_00);
    expect(b.netWorth).toBe(1100_00);
  });

  it('ignore les comptes archivés dans la valeur nette', () => {
    const old = account({ name: 'Ancien', initialBalance: 50_00, archived: true });
    const b = computeBalances({ accounts: [old], envelopes: [], transactions: [] });
    expect(b.netWorth).toBe(0);
    expect(b.accounts[old.id]).toBe(50_00);
  });

  it('ignore les opérations prévues sauf demande explicite', () => {
    const courant = account({ name: 'Courant', initialBalance: 100_00 });
    const transactions = [tx({ kind: 'expense', amount: 80_00, accountId: courant.id, status: 'planned' })];
    expect(computeBalances({ accounts: [courant], envelopes: [], transactions }).accounts[courant.id]).toBe(100_00);
    expect(
      computeBalances({ accounts: [courant], envelopes: [], transactions }, { includePlanned: true }).accounts[courant.id],
    ).toBe(20_00);
  });
});
