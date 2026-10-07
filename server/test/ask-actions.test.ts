import { beforeEach, describe, expect, it } from 'vitest';
import { validateActions } from '../src/ask/actions';
import { createEnvelope, updateEnvelope } from '../src/repos/envelopes';
import { createTransaction } from '../src/repos/transactions';
import { createTestDb, type TestContext } from './helpers';

let ctx: TestContext;
beforeEach(() => {
  ctx = createTestDb();
});

describe('validateActions', () => {
  it('enrichit un rangement : nombre, total, enveloppe', () => {
    const a = createTransaction(ctx.db, { kind: 'expense', date: '2026-03-01', amount: 12_50, label: 'UBER', accountId: ctx.courant.id });
    const b = createTransaction(ctx.db, { kind: 'expense', date: '2026-03-02', amount: 7_50, label: 'UBER', accountId: ctx.courant.id });
    const r = validateActions(ctx.db, [{ type: 'sort', transactionIds: [a.id, b.id], envelopeId: ctx.loisirs.id, rulePattern: 'UBER' }]);
    expect(r).toEqual({
      actions: [{ type: 'sort', transactionIds: [a.id, b.id], envelopeId: ctx.loisirs.id, envelopeName: 'Loisirs', rulePattern: 'UBER', count: 2, total: 20_00 }],
      rejected: 0,
    });
  });

  it('écarte un rangement d’opérations inconnues ou qui ne sont pas des dépenses', () => {
    const income = createTransaction(ctx.db, { kind: 'income', date: '2026-03-01', amount: 100_00, label: 'Salaire', accountId: ctx.courant.id });
    const r = validateActions(ctx.db, [
      { type: 'sort', transactionIds: [income.id], envelopeId: ctx.loisirs.id, rulePattern: null },
      { type: 'sort', transactionIds: [9999], envelopeId: ctx.loisirs.id, rulePattern: null },
    ]);
    expect(r).toEqual({ actions: [], rejected: 2 });
  });

  it('enrichit un déplacement, y compris depuis « À répartir »', () => {
    const r = validateActions(ctx.db, [
      { type: 'move', fromEnvelopeId: ctx.courses.id, toEnvelopeId: ctx.loisirs.id, amount: 50_00 },
      { type: 'move', fromEnvelopeId: null, toEnvelopeId: ctx.loisirs.id, amount: 10_00 },
      { type: 'move', fromEnvelopeId: ctx.loisirs.id, toEnvelopeId: ctx.loisirs.id, amount: 10_00 },
    ]);
    expect(r.actions).toEqual([
      { type: 'move', fromEnvelopeId: ctx.courses.id, fromName: 'Courses', toEnvelopeId: ctx.loisirs.id, toName: 'Loisirs', amount: 50_00 },
      { type: 'move', fromEnvelopeId: null, fromName: 'À répartir', toEnvelopeId: ctx.loisirs.id, toName: 'Loisirs', amount: 10_00 },
    ]);
    expect(r.rejected).toBe(1);
  });

  it('enrichit un budget avec la valeur actuelle et refuse une enveloppe archivée', () => {
    updateEnvelope(ctx.db, ctx.courses.id, { monthlyTarget: 180_00 });
    const old = createEnvelope(ctx.db, { name: 'Ancienne', color: '#4f8a5b' });
    updateEnvelope(ctx.db, old.id, { archived: true });
    const r = validateActions(ctx.db, [
      { type: 'budget', envelopeId: ctx.courses.id, monthlyTarget: 150_00 },
      { type: 'budget', envelopeId: old.id, monthlyTarget: 10_00 },
    ]);
    expect(r).toEqual({ actions: [{ type: 'budget', envelopeId: ctx.courses.id, envelopeName: 'Courses', monthlyTarget: 150_00, current: 180_00 }], rejected: 1 });
  });

  it('valide une charge fixe avec le schéma des règles', () => {
    const rule = { name: 'Spotify', kind: 'expense', amount: 11_99, label: 'Spotify', accountId: ctx.courant.id, envelopeId: ctx.loisirs.id, frequency: 'monthly', dayOfMonth: 4, startDate: '2026-11-04' };
    const r = validateActions(ctx.db, [{ type: 'recurring', rule }, { type: 'recurring', rule: { ...rule, dayOfMonth: null } }, { type: 'inconnu' }]);
    expect(r.actions).toEqual([{ type: 'recurring', rule: expect.objectContaining({ name: 'Spotify', interval: 1, active: true }), accountName: 'Courant' }]);
    expect(r.rejected).toBe(2);
  });
});
