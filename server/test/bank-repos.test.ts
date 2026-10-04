import { beforeEach, describe, expect, it } from 'vitest';
import {
  createConnection,
  deletePendingConnections,
  getConnection,
  listBankAccounts,
  listConnections,
  updateBankAccount,
  updateConnection,
  upsertBankAccount,
} from '../src/repos/bank';
import { createTransaction } from '../src/repos/transactions';
import { countConfirmedOn, lastConfirmedDate } from '../src/repos/transactions';
import { createTestDb, type TestContext } from './helpers';

let ctx: TestContext;
beforeEach(() => {
  ctx = createTestDb();
});

describe('repos bank', () => {
  it('crée, met à jour et purge les connexions en attente', () => {
    const c = createConnection(ctx.db, { aspspName: 'La Banque Postale', aspspCountry: 'FR', state: 'abc' });
    expect(c).toMatchObject({ status: 'pending', provider: 'enablebanking', sessionId: null });
    const active = updateConnection(ctx.db, c.id, { status: 'active', sessionId: 's1', validUntil: '2027-01-01T00:00:00Z' });
    expect(active.status).toBe('active');
    createConnection(ctx.db, { aspspName: 'La Banque Postale', aspspCountry: 'FR', state: 'zzz' });
    expect(listConnections(ctx.db)).toHaveLength(2);
    deletePendingConnections(ctx.db);
    expect(listConnections(ctx.db).map((x) => x.id)).toEqual([c.id]);
    expect(getConnection(ctx.db, c.id).sessionId).toBe('s1');
  });

  it('upsert par IBAN puis par uid, en gardant la liaison', () => {
    const c = createConnection(ctx.db, { aspspName: 'La Banque Postale', aspspCountry: 'FR', state: 'abc' });
    const a = upsertBankAccount(ctx.db, { connectionId: c.id, uid: 'u1', iban: 'FR7620041010121234567K03022', bankName: 'CCP', accountId: ctx.courant.id });
    updateBankAccount(ctx.db, a.id, { syncFrom: '2026-01-01', lastSyncedDate: '2026-02-01' });
    const same = upsertBankAccount(ctx.db, { connectionId: c.id, uid: 'u1-new', iban: 'FR7620041010121234567K03022', bankName: 'CCP', accountId: null });
    expect(same.id).toBe(a.id);
    expect(same).toMatchObject({ uid: 'u1-new', accountId: ctx.courant.id, syncFrom: '2026-01-01', lastSyncedDate: '2026-02-01' });
    const noIban = upsertBankAccount(ctx.db, { connectionId: c.id, uid: 'u2', iban: null, bankName: 'Livret', accountId: null });
    const again = upsertBankAccount(ctx.db, { connectionId: c.id, uid: 'u2', iban: null, bankName: 'Livret A', accountId: ctx.livret.id });
    expect(again.id).toBe(noIban.id);
    expect(again).toMatchObject({ bankName: 'Livret A', accountId: ctx.livret.id });
    expect(listBankAccounts(ctx.db, c.id)).toHaveLength(2);
  });
});

describe('requêtes de jonction', () => {
  it('dernière date confirmée et présence date + montant', () => {
    expect(lastConfirmedDate(ctx.db, ctx.courant.id)).toBeNull();
    createTransaction(ctx.db, { kind: 'expense', date: '2026-03-01', amount: 12_50, label: 'Café', accountId: ctx.courant.id });
    createTransaction(ctx.db, { kind: 'income', date: '2026-03-05', amount: 2000_00, label: 'Salaire', accountId: ctx.courant.id });
    createTransaction(ctx.db, { kind: 'transfer', date: '2026-03-07', amount: 100_00, label: 'Épargne', accountId: ctx.courant.id, toAccountId: ctx.livret.id });
    createTransaction(ctx.db, { kind: 'expense', date: '2026-03-09', amount: 5_00, label: 'Prévue', accountId: ctx.courant.id, status: 'planned' });
    expect(lastConfirmedDate(ctx.db, ctx.courant.id)).toBe('2026-03-07');
    expect(lastConfirmedDate(ctx.db, ctx.livret.id)).toBe('2026-03-07');
    expect(countConfirmedOn(ctx.db, ctx.courant.id, '2026-03-01', -12_50)).toBe(1);
    expect(countConfirmedOn(ctx.db, ctx.courant.id, '2026-03-01', 12_50)).toBe(0);
    expect(countConfirmedOn(ctx.db, ctx.courant.id, '2026-03-05', 2000_00)).toBe(1);
    expect(countConfirmedOn(ctx.db, ctx.courant.id, '2026-03-07', -100_00)).toBe(1);
    expect(countConfirmedOn(ctx.db, ctx.livret.id, '2026-03-07', 100_00)).toBe(1);
    expect(countConfirmedOn(ctx.db, ctx.courant.id, '2026-03-09', -5_00)).toBe(0);
  });
});
