import { beforeEach, describe, expect, it } from 'vitest';
import { computeBalances } from './balances';
import { account, envelope, resetIds, tx } from './test-fixtures';

const TODAY = '2026-03-15';

describe('computeBalances', () => {
  beforeEach(resetIds);

  it('part du solde initial et applique une dépense', () => {
    const courant = account({ name: 'Courant', initialBalance: 100_00 });
    const courses = envelope({ name: 'Courses' });
    const b = computeBalances({
      accounts: [courant],
      envelopes: [courses],
      transactions: [tx({ kind: 'expense', amount: 30_00, accountId: courant.id, envelopeId: courses.id })],
    }, TODAY);
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
    }, TODAY);
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
    }, TODAY);
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
    }, TODAY);
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
    }, TODAY);
    expect(b.envelopes[courses.id]).toBe(60_00);
    expect(b.envelopes[loisirs.id]).toBe(40_00);
    expect(b.toAllocate).toBe(400_00);
  });

  it('exclut les comptes hors budget de "À répartir" mais pas de la valeur nette', () => {
    const courant = account({ name: 'Courant', initialBalance: 100_00 });
    const livret = account({ name: 'Livret', initialBalance: 1000_00, onBudget: false });
    const b = computeBalances({ accounts: [courant, livret], envelopes: [], transactions: [] }, TODAY);
    expect(b.toAllocate).toBe(100_00);
    expect(b.netWorth).toBe(1100_00);
  });

  it('ignore les comptes archivés dans la valeur nette', () => {
    const old = account({ name: 'Ancien', initialBalance: 50_00, archived: true });
    const b = computeBalances({ accounts: [old], envelopes: [], transactions: [] }, TODAY);
    expect(b.netWorth).toBe(0);
    expect(b.accounts[old.id]).toBe(50_00);
  });

  it('ignore les opérations prévues sauf demande explicite', () => {
    const courant = account({ name: 'Courant', initialBalance: 100_00 });
    const transactions = [tx({ kind: 'expense', amount: 80_00, accountId: courant.id, status: 'planned' })];
    expect(computeBalances({ accounts: [courant], envelopes: [], transactions }, TODAY).accounts[courant.id]).toBe(100_00);
    expect(
      computeBalances({ accounts: [courant], envelopes: [], transactions }, TODAY, { includePlanned: true }).accounts[courant.id],
    ).toBe(20_00);
  });

  it('remet à zéro une enveloppe dépassée au changement de mois et retire le dépassement de "À répartir"', () => {
    const courant = account({ name: 'Courant', initialBalance: 1000_00 });
    const courses = envelope({ name: 'Courses' });
    const state = {
      accounts: [courant],
      envelopes: [courses],
      transactions: [
        tx({ kind: 'allocation', amount: 100_00, envelopeId: courses.id, date: '2026-02-01' }),
        tx({ kind: 'expense', amount: 130_00, accountId: courant.id, envelopeId: courses.id, date: '2026-02-20' }),
      ],
    };
    // Pendant le mois, le dépassement reste visible dans l'enveloppe.
    const fevrier = computeBalances(state, '2026-02-28');
    expect(fevrier.envelopes[courses.id]).toBe(-30_00);
    expect(fevrier.toAllocate).toBe(900_00);
    // Le mois suivant, l'enveloppe repart de zéro et le dépassement est pris sur "À répartir".
    const mars = computeBalances(state, '2026-03-01');
    expect(mars.envelopes[courses.id]).toBe(0);
    expect(mars.toAllocate).toBe(870_00);
    expect(mars.accounts[courant.id]).toBe(870_00);
  });

  it('reporte le solde positif d’une enveloppe d’un mois sur l’autre', () => {
    const courant = account({ name: 'Courant', initialBalance: 1000_00 });
    const voyages = envelope({ name: 'Voyages' });
    const b = computeBalances(
      {
        accounts: [courant],
        envelopes: [voyages],
        transactions: [
          tx({ kind: 'allocation', amount: 100_00, envelopeId: voyages.id, date: '2026-01-05' }),
          tx({ kind: 'expense', amount: 40_00, accountId: courant.id, envelopeId: voyages.id, date: '2026-02-10' }),
        ],
      },
      TODAY,
    );
    expect(b.envelopes[voyages.id]).toBe(60_00);
    expect(b.toAllocate).toBe(900_00);
  });

  it('ne remet à zéro qu’aux changements de mois, avant les opérations du nouveau mois', () => {
    const courant = account({ name: 'Courant', initialBalance: 1000_00 });
    const restos = envelope({ name: 'Restos' });
    const b = computeBalances(
      {
        accounts: [courant],
        envelopes: [restos],
        transactions: [
          tx({ kind: 'expense', amount: 50_00, accountId: courant.id, envelopeId: restos.id, date: '2026-01-10' }),
          tx({ kind: 'expense', amount: 20_00, accountId: courant.id, envelopeId: restos.id, date: '2026-01-25' }),
          tx({ kind: 'allocation', amount: 30_00, envelopeId: restos.id, date: '2026-02-01' }),
          tx({ kind: 'expense', amount: 45_00, accountId: courant.id, envelopeId: restos.id, date: '2026-02-14' }),
        ],
      },
      '2026-02-20',
    );
    expect(b.envelopes[restos.id]).toBe(-15_00);
    // Les 70 € de janvier sont pris sur "À répartir" ; les 15 € de février restent dans l'enveloppe.
    expect(b.toAllocate).toBe(900_00);
  });
});
