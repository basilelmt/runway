import { beforeEach, describe, expect, it } from 'vitest';
import { createAccount, findAccountByBankNumber, listAccounts, updateAccount } from '../src/repos/accounts';
import { createEnvelope, listEnvelopes, reorderEnvelopes, updateEnvelope } from '../src/repos/envelopes';
import {
  bulkCreateTransactions,
  countUnsorted,
  createTransaction,
  deleteTransaction,
  findByFingerprints,
  listPlanned,
  listTransactions,
  updateTransaction,
} from '../src/repos/transactions';
import { createRule, deleteRule, listRules, setLastGenerated } from '../src/repos/recurring-rules';
import { createSortingRule, deleteSortingRule, listSortingRules, reorderSortingRules } from '../src/repos/sorting-rules';
import { getSettings, saveSettings } from '../src/repos/settings';
import { createTestDb, type TestContext } from './helpers';

let ctx: TestContext;
beforeEach(() => {
  ctx = createTestDb();
});

describe('accounts', () => {
  it('liste sans les archivés par défaut', () => {
    const old = createAccount(ctx.db, { name: 'Ancien', initialBalance: 0, onBudget: true });
    updateAccount(ctx.db, old.id, { archived: true });
    expect(listAccounts(ctx.db).map((a) => a.name)).toEqual(['Courant', 'Livret']);
    expect(listAccounts(ctx.db, { includeArchived: true })).toHaveLength(3);
  });

  it('retrouve par numéro bancaire', () => {
    updateAccount(ctx.db, ctx.courant.id, { bankAccountNumber: '1234567A' });
    expect(findAccountByBankNumber(ctx.db, '1234567A')?.id).toBe(ctx.courant.id);
    expect(findAccountByBankNumber(ctx.db, 'nope')).toBeNull();
  });

  it('refuse un nom en double', () => {
    expect(() => createAccount(ctx.db, { name: 'Courant', initialBalance: 0, onBudget: true })).toThrow();
  });
});

describe('envelopes', () => {
  it('attribue un ordre croissant et réordonne', () => {
    const vac = createEnvelope(ctx.db, { name: 'Vacances', color: '#000000' });
    expect(vac.sortOrder).toBe(2);
    reorderEnvelopes(ctx.db, [vac.id, ctx.courses.id, ctx.loisirs.id]);
    expect(listEnvelopes(ctx.db).map((e) => e.name)).toEqual(['Vacances', 'Courses', 'Loisirs']);
  });

  it('met à jour l’objectif', () => {
    const e = updateEnvelope(ctx.db, ctx.courses.id, { monthlyTarget: 400_00 });
    expect(e.monthlyTarget).toBe(400_00);
  });
});

describe('transactions', () => {
  it('crée, filtre et supprime', () => {
    createTransaction(ctx.db, { kind: 'expense', date: '2026-03-02', amount: 30_00, label: 'Carrefour', accountId: ctx.courant.id, envelopeId: ctx.courses.id });
    const unsorted = createTransaction(ctx.db, { kind: 'expense', date: '2026-03-03', amount: 12_00, label: 'Inconnu', accountId: ctx.courant.id });
    createTransaction(ctx.db, { kind: 'income', date: '2026-03-01', amount: 2000_00, label: 'Salaire', accountId: ctx.courant.id });

    expect(listTransactions(ctx.db).map((t) => t.label)).toEqual(['Inconnu', 'Carrefour', 'Salaire']);
    expect(listTransactions(ctx.db, { unsorted: true }).map((t) => t.id)).toEqual([unsorted.id]);
    expect(listTransactions(ctx.db, { envelope: ctx.courses.id })).toHaveLength(1);
    expect(listTransactions(ctx.db, { q: 'carr' })).toHaveLength(1);
    expect(listTransactions(ctx.db, { from: '2026-03-02', to: '2026-03-02' })).toHaveLength(1);
    expect(listTransactions(ctx.db, { kind: 'income' })).toHaveLength(1);
    expect(countUnsorted(ctx.db)).toBe(1);

    deleteTransaction(ctx.db, unsorted.id);
    expect(countUnsorted(ctx.db)).toBe(0);
    expect(() => deleteTransaction(ctx.db, unsorted.id)).toThrow('introuvable');
  });

  it('met à jour partiellement', () => {
    const t = createTransaction(ctx.db, { kind: 'expense', date: '2026-03-03', amount: 12_00, label: 'Inconnu', accountId: ctx.courant.id });
    const u = updateTransaction(ctx.db, t.id, { envelopeId: ctx.loisirs.id });
    expect(u.envelopeId).toBe(ctx.loisirs.id);
    expect(u.label).toBe('Inconnu');
  });

  it('refuse une référence vers un compte inexistant', () => {
    expect(() => createTransaction(ctx.db, { kind: 'expense', date: '2026-03-03', amount: 1, label: 'x', accountId: 999 })).toThrow();
  });

  it('bulkCreate est atomique', () => {
    expect(() =>
      bulkCreateTransactions(ctx.db, [
        { kind: 'expense', date: '2026-03-03', amount: 1, label: 'ok', accountId: ctx.courant.id },
        { kind: 'expense', date: '2026-03-03', amount: 1, label: 'ko', accountId: 999 },
      ]),
    ).toThrow();
    expect(listTransactions(ctx.db)).toHaveLength(0);
  });

  it('empreintes et prévues', () => {
    createTransaction(ctx.db, { kind: 'expense', date: '2026-03-03', amount: 1, label: 'a', accountId: ctx.courant.id, fingerprint: 'fp-a' });
    createTransaction(ctx.db, { kind: 'expense', date: '2026-03-10', amount: 5, label: 'p', accountId: ctx.courant.id, status: 'planned' });
    expect(findByFingerprints(ctx.db, ['fp-a', 'fp-b'])).toEqual(new Set(['fp-a']));
    expect(listPlanned(ctx.db, ctx.courant.id)).toHaveLength(1);
    expect(listPlanned(ctx.db, ctx.livret.id)).toHaveLength(0);
    expect(() =>
      createTransaction(ctx.db, { kind: 'expense', date: '2026-03-03', amount: 1, label: 'a', accountId: ctx.courant.id, fingerprint: 'fp-a' }),
    ).toThrow();
  });
});

describe('recurring rules', () => {
  it('crée, marque et supprime', () => {
    const r = createRule(ctx.db, {
      name: 'Loyer', kind: 'expense', amount: 800_00, label: 'Loyer', accountId: ctx.courant.id, envelopeId: ctx.courses.id,
      frequency: 'monthly', interval: 1, dayOfMonth: 5, startDate: '2026-01-01', active: true,
    });
    setLastGenerated(ctx.db, r.id, '2026-03-05');
    expect(listRules(ctx.db)[0]?.lastGeneratedDate).toBe('2026-03-05');
    createTransaction(ctx.db, { kind: 'expense', date: '2026-03-05', amount: 800_00, label: 'Loyer', accountId: ctx.courant.id, recurringRuleId: r.id, status: 'planned' });
    deleteRule(ctx.db, r.id);
    expect(listRules(ctx.db)).toHaveLength(0);
    expect(listTransactions(ctx.db)[0]?.recurringRuleId).toBeNull();
  });
});

describe('sorting rules', () => {
  it('priorité croissante et réordonnancement', () => {
    const a = createSortingRule(ctx.db, { pattern: 'carrefour', envelopeId: ctx.courses.id });
    const b = createSortingRule(ctx.db, { pattern: 'cinema', envelopeId: ctx.loisirs.id });
    expect(listSortingRules(ctx.db).map((r) => r.priority)).toEqual([0, 1]);
    reorderSortingRules(ctx.db, [b.id, a.id]);
    expect(listSortingRules(ctx.db).map((r) => r.id)).toEqual([b.id, a.id]);
    deleteSortingRule(ctx.db, a.id);
    expect(listSortingRules(ctx.db)).toHaveLength(1);
  });

  it('est supprimée avec son enveloppe', () => {
    createSortingRule(ctx.db, { pattern: 'carrefour', envelopeId: ctx.courses.id });
    ctx.db.run(`delete from envelopes where id = ${ctx.courses.id}`);
    expect(listSortingRules(ctx.db)).toHaveLength(0);
  });
});

describe('settings', () => {
  it('valeurs par défaut puis sauvegarde', () => {
    expect(getSettings(ctx.db)).toEqual({ forecastHorizonDays: 90, claudeModel: '', enableBankingAppId: '', enableBankingPrivateKey: '' });
    saveSettings(ctx.db, { forecastHorizonDays: 120, claudeModel: 'sonnet', enableBankingAppId: 'app-1', enableBankingPrivateKey: 'cle' });
    expect(getSettings(ctx.db)).toEqual({ forecastHorizonDays: 120, claudeModel: 'sonnet', enableBankingAppId: 'app-1', enableBankingPrivateKey: 'cle' });
  });
});
