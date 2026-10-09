import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { merchantKeyFor } from '@core/merchants';
import type { Db } from '../src/db/client';
import { merchants, transactions } from '../src/db/schema';
import { createRule } from '../src/repos/recurring-rules';
import { listPlanned, listTransactions } from '../src/repos/transactions';
import { commitImport } from '../src/services/import';
import { materializeDue } from '../src/services/materialize';
import { createTestApp, type TestApp } from './helpers';

let t: TestApp;
beforeEach(() => {
  t = createTestApp('2026-03-10');
});

/** Chaque opération porte la clé tirée de son type et de son libellé, et chaque clé a sa ligne `merchants`. */
function expectInvariant(db: Db) {
  const rows = db.select({ kind: transactions.kind, label: transactions.label, merchantKey: transactions.merchantKey }).from(transactions).all();
  expect(rows.length).toBeGreaterThan(0);
  const stored = new Set(db.select({ key: merchants.key }).from(merchants).all().map((m) => m.key));
  for (const row of rows) {
    expect(row.merchantKey, row.label).toBe(merchantKeyFor(row.kind, row.label));
    if (row.merchantKey !== null) expect(stored.has(row.merchantKey), row.merchantKey).toBe(true);
  }
}

const expense = (label: string, date = '2026-03-02') =>
  t.call('POST', '/api/transactions', { kind: 'expense', date, amount: 12_50, label, accountId: t.courant.id });

describe('clé marchand à l’écriture', () => {
  it('saisie, modification et tri', async () => {
    const created = await expense('ACHAT CB BOULANGERIE DU COIN 03.10.26 CARTE NUMERO 123');
    expect(created.body).toMatchObject({ merchantKey: 'BOULANGERIE DU COIN', merchantName: 'Boulangerie du Coin' });

    const relabeled = await t.call('PUT', `/api/transactions/${created.body.id}`, { kind: 'expense', date: '2026-03-02', amount: 12_50, label: 'Café de la gare', accountId: t.courant.id });
    expect(relabeled.body).toMatchObject({ merchantKey: 'CAFE DE LA GARE', merchantName: 'Café de la gare' });

    const income = await t.call('POST', '/api/transactions', { kind: 'income', date: '2026-03-03', amount: 2000_00, label: 'VIREMENT DE EMPLOYEUR SA', accountId: t.courant.id });
    expect(income.body.merchantKey).toBe('EMPLOYEUR SA');

    const other = await expense('ACHAT CB CAFE DU PORT');
    await t.call('POST', '/api/sorting/apply', { assignments: [{ transactionId: other.body.id, envelopeId: t.courses.id }], rules: [] });
    expect((await t.call('GET', `/api/transactions/${other.body.id}`)).body).toMatchObject({ envelopeId: t.courses.id, merchantKey: 'CAFE DU PORT' });

    const transfer = await t.call('PUT', `/api/transactions/${created.body.id}`, { kind: 'transfer', date: '2026-03-02', amount: 12_50, label: 'Café de la gare', accountId: t.courant.id, toAccountId: t.livret.id });
    expect(transfer.body).toMatchObject({ merchantKey: null, merchantName: null });

    expectInvariant(t.db);
  });

  it('matérialisation des règles récurrentes', () => {
    createRule(t.db, {
      name: 'Assurance', kind: 'expense', amount: 30_00, label: 'PRELEVEMENT DE ASSURANCE HABITAT', accountId: t.courant.id,
      frequency: 'monthly', interval: 1, dayOfMonth: 5, startDate: '2026-01-01', active: true, triggersFunding: false, fundsNextMonth: false,
    });
    createRule(t.db, {
      name: 'Épargne', kind: 'transfer', amount: 100_00, label: 'Épargne du mois', accountId: t.courant.id, toAccountId: t.livret.id,
      frequency: 'monthly', interval: 1, dayOfMonth: 6, startDate: '2026-01-01', active: true, triggersFunding: false, fundsNextMonth: false,
    });
    materializeDue(t.db, '2026-03-10');
    const planned = listPlanned(t.db);
    expect(planned.filter((p) => p.kind === 'expense').map((p) => p.merchantKey)).toEqual(['ASSURANCE HABITAT', 'ASSURANCE HABITAT', 'ASSURANCE HABITAT']);
    expect(planned.filter((p) => p.kind === 'transfer').every((p) => p.merchantKey === null)).toBe(true);
    expectInvariant(t.db);
  });

  it('import et rapprochement d’une opération prévue', () => {
    createRule(t.db, {
      name: 'Assurance', kind: 'expense', amount: 30_00, label: 'Assurance', accountId: t.courant.id,
      frequency: 'monthly', interval: 1, dayOfMonth: 5, startDate: '2026-03-01', active: true, triggersFunding: false, fundsNextMonth: false,
    });
    materializeDue(t.db, '2026-03-10');
    const [planned] = listPlanned(t.db);
    expect(planned!.merchantKey).toBe('ASSURANCE');

    commitImport(t.db, {
      fileName: 'releve.csv',
      accountId: t.courant.id,
      duplicateCount: 0,
      rows: [
        { index: 0, date: '2026-03-05', label: 'PRELEVEMENT DE MUTUELLE DU COIN REF : AB-123', signedAmount: -30_00, fingerprint: 'a'.repeat(40), plannedId: planned!.id, envelopeId: null },
        { index: 1, date: '2026-03-06', label: 'ACHAT CB CAFE DU PORT 06.03.26 CARTE NUMERO 123', signedAmount: -2_50, fingerprint: 'b'.repeat(40), plannedId: null, envelopeId: null },
        { index: 2, date: '2026-03-07', label: 'VIREMENT DE EMPLOYEUR SA', signedAmount: 2000_00, fingerprint: 'c'.repeat(40), plannedId: null, envelopeId: null },
        { index: 3, date: '2026-03-08', label: 'VIREMENT POUR LIVRET', signedAmount: -100_00, fingerprint: 'd'.repeat(40), plannedId: null, envelopeId: null, transferToAccountId: t.livret.id },
      ],
    });

    const byLabel = new Map(listTransactions(t.db).map((x) => [x.label, x]));
    expect(byLabel.get('PRELEVEMENT DE MUTUELLE DU COIN REF : AB-123')).toMatchObject({ id: planned!.id, status: 'confirmed', merchantKey: 'MUTUELLE DU COIN' });
    expect(byLabel.get('ACHAT CB CAFE DU PORT 06.03.26 CARTE NUMERO 123')?.merchantKey).toBe('CAFE DU PORT');
    expect(byLabel.get('VIREMENT DE EMPLOYEUR SA')?.merchantKey).toBe('EMPLOYEUR SA');
    expect(byLabel.get('Virement Courant → Livret')?.merchantKey).toBeNull();
    expectInvariant(t.db);
  });

  it('les lectures donnent le nom du marchand, et la recherche le trouve', async () => {
    await expense('ACHAT CB CAFE DU PORT');
    await t.call('POST', '/api/transactions', { kind: 'transfer', date: '2026-03-04', amount: 50_00, label: 'Épargne', accountId: t.courant.id, toAccountId: t.livret.id });
    expect(listTransactions(t.db).map((x) => x.merchantName)).toEqual([null, 'Cafe du Port']);

    t.db.update(merchants).set({ name: 'Café du Port', source: 'user' }).where(eq(merchants.key, 'CAFE DU PORT')).run();
    expect(listTransactions(t.db).map((x) => x.merchantName)).toEqual([null, 'Café du Port']);

    // « café » n'apparaît que dans le nom du marchand, pas dans le libellé sans accent.
    const byName = await t.call('GET', `/api/transactions?q=${encodeURIComponent('café')}`);
    expect(byName.body.map((x: any) => x.label)).toEqual(['ACHAT CB CAFE DU PORT']);
    expect((await t.call('GET', '/api/transactions?q=port')).body).toHaveLength(1);
  });
});
