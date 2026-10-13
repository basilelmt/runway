import { beforeEach, describe, expect, it } from 'vitest';
import { recurringRuleInputSchema } from '@shared/schemas';
import { validateActions } from '../src/ask/actions';
import { buildAskSystemPrompt } from '../src/ask/prompt';
import { createEnvelope, updateEnvelope } from '../src/repos/envelopes';
import { createRule } from '../src/repos/recurring-rules';
import { createTransaction } from '../src/repos/transactions';
import { createTestDb, type TestContext } from './helpers';

const TODAY = '2026-03-12';

let ctx: TestContext;
beforeEach(() => {
  ctx = createTestDb();
});

/** Charge fixe de 40 € par mois rattachée à l'enveloppe. */
const navigo = (envelopeId: number) =>
  createRule(
    ctx.db,
    recurringRuleInputSchema.parse({ name: 'Navigo', kind: 'expense', amount: 40_00, label: 'NAVIGO', accountId: ctx.courant.id, envelopeId, frequency: 'monthly', dayOfMonth: 5, startDate: '2026-01-05' }),
  );

describe('validateActions', () => {
  it('enrichit un rangement : nombre, total, enveloppe', () => {
    const a = createTransaction(ctx.db, { kind: 'expense', date: '2026-03-01', amount: 12_50, label: 'UBER', accountId: ctx.courant.id });
    const b = createTransaction(ctx.db, { kind: 'expense', date: '2026-03-02', amount: 7_50, label: 'UBER', accountId: ctx.courant.id });
    const r = validateActions(ctx.db, [{ type: 'sort', transactionIds: [a.id, b.id], envelopeId: ctx.loisirs.id, rulePattern: 'UBER' }], TODAY);
    expect(r).toEqual({
      actions: [{ type: 'sort', transactionIds: [a.id, b.id], envelopeId: ctx.loisirs.id, envelopeName: 'Loisirs', rulePattern: 'UBER', count: 2, total: 20_00 }],
      reasons: [],
    });
  });

  it('écarte un rangement d’opérations inconnues ou qui ne sont pas des dépenses', () => {
    const income = createTransaction(ctx.db, { kind: 'income', date: '2026-03-01', amount: 100_00, label: 'Salaire', accountId: ctx.courant.id });
    const r = validateActions(
      ctx.db,
      [
        { type: 'sort', transactionIds: [income.id], envelopeId: ctx.loisirs.id, rulePattern: null },
        { type: 'sort', transactionIds: [9999], envelopeId: ctx.loisirs.id, rulePattern: null },
      ],
      TODAY,
    );
    expect(r).toEqual({ actions: [], reasons: [] });
  });

  it('enrichit un déplacement, y compris depuis « Pas encore réparti »', () => {
    const r = validateActions(
      ctx.db,
      [
        { type: 'move', fromEnvelopeId: ctx.courses.id, toEnvelopeId: ctx.loisirs.id, amount: 50_00 },
        { type: 'move', fromEnvelopeId: null, toEnvelopeId: ctx.loisirs.id, amount: 10_00 },
        { type: 'move', fromEnvelopeId: ctx.loisirs.id, toEnvelopeId: ctx.loisirs.id, amount: 10_00 },
      ],
      TODAY,
    );
    expect(r.actions).toEqual([
      { type: 'move', fromEnvelopeId: ctx.courses.id, fromName: 'Courses', toEnvelopeId: ctx.loisirs.id, toName: 'Loisirs', amount: 50_00 },
      { type: 'move', fromEnvelopeId: null, fromName: 'Pas encore réparti', toEnvelopeId: ctx.loisirs.id, toName: 'Loisirs', amount: 10_00 },
    ]);
  });

  it('convertit le budget voulu en complément au-dessus des charges, et refuse une enveloppe archivée', () => {
    navigo(ctx.courses.id);
    updateEnvelope(ctx.db, ctx.courses.id, { monthlyExtra: 140_00 });
    const old = createEnvelope(ctx.db, { name: 'Ancienne', color: '#4f8a5b' });
    updateEnvelope(ctx.db, old.id, { archived: true });
    const r = validateActions(
      ctx.db,
      [
        { type: 'budget', envelopeId: ctx.courses.id, monthlyTarget: 150_00 },
        { type: 'budget', envelopeId: ctx.courses.id, monthlyTarget: 40_00 },
        { type: 'budget', envelopeId: ctx.courses.id, monthlyTarget: null },
        { type: 'budget', envelopeId: old.id, monthlyTarget: 10_00 },
      ],
      TODAY,
    );
    const courses = { type: 'budget', envelopeId: ctx.courses.id, envelopeName: 'Courses', charges: 40_00, current: 180_00 };
    expect(r).toEqual({
      actions: [
        { ...courses, monthlyTarget: 150_00, monthlyExtra: 110_00 },
        // Exactement les charges, ou null : plus de complément.
        { ...courses, monthlyTarget: 40_00, monthlyExtra: null },
        { ...courses, monthlyTarget: null, monthlyExtra: null },
      ],
      reasons: [],
    });
  });

  it('refuse un budget sous les charges fixes, avec la raison', () => {
    navigo(ctx.courses.id);
    const r = validateActions(ctx.db, [{ type: 'budget', envelopeId: ctx.courses.id, monthlyTarget: 30_00 }], TODAY);
    expect(r).toEqual({ actions: [], reasons: ['Le budget de Courses ne peut pas descendre sous ses charges fixes (40,00 €)'] });
  });

  it('valide une charge fixe avec le schéma des règles', () => {
    const rule = { name: 'Spotify', kind: 'expense', amount: 11_99, label: 'Spotify', accountId: ctx.courant.id, envelopeId: ctx.loisirs.id, frequency: 'monthly', dayOfMonth: 4, startDate: '2026-11-04' };
    const r = validateActions(ctx.db, [{ type: 'recurring', rule }, { type: 'recurring', rule: { ...rule, dayOfMonth: null } }, { type: 'inconnu' }], TODAY);
    expect(r.actions).toEqual([{ type: 'recurring', rule: expect.objectContaining({ name: 'Spotify', interval: 1, active: true }), accountName: 'Courant' }]);
  });
});

describe('buildAskSystemPrompt', () => {
  it('décrit le budget, les charges et le schéma des enveloppes', () => {
    const transports = { id: 3, name: 'Transports', isSavings: false, monthlyCharges: 40_00, monthlyBudget: 130_00, allocatedThisMonth: 0, spentThisMonth: 0, balance: 0 };
    const divers = { ...transports, id: 4, name: 'Divers', monthlyCharges: 0, monthlyBudget: 0 };
    const prompt = buildAskSystemPrompt({ today: '2026-10-08', overview: { toAllocate: 0, unsortedCount: 0, envelopes: [transports, divers], accounts: [] } });
    expect(prompt).toContain('- 3 : Transports, budget 130,00 € (dont 40,00 € de charges fixes), réparti 0,00 €');
    expect(prompt).toContain('- 4 : Divers, budget 0,00 €, réparti');
    expect(prompt).toContain('envelopes(id, name, monthly_extra en centimes');
    expect(prompt).not.toContain('monthly_target');
  });
});
