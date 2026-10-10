import { beforeEach, describe, expect, it } from 'vitest';
import { createRule, updateRule } from '../src/repos/recurring-rules';
import { dismissSignal, listActiveSignals, listAllSignals } from '../src/repos/signals';
import { createTransaction, deleteTransaction } from '../src/repos/transactions';
import { detectSignals } from '../src/services/signals';
import { createTestDb, type TestContext } from './helpers';

const TODAY = '2026-10-10';
const NOW = new Date('2026-10-10T09:00:00.000Z');

let ctx: TestContext;
beforeEach(() => {
  ctx = createTestDb();
});

function expense(amount: number, date: string, extra: Partial<Parameters<typeof createTransaction>[1]> = {}) {
  return createTransaction(ctx.db, { kind: 'expense', amount, date, label: 'Fnac', accountId: ctx.courant.id, envelopeId: ctx.courses.id, ...extra });
}

describe('detectSignals', () => {
  it('crée un signal nouveau puis ne le recrée pas au passage suivant (idempotence)', () => {
    expense(40_00, '2026-09-01');
    expense(40_00, '2026-09-10');
    expense(40_00, '2026-09-20');
    expense(100_00, '2026-10-05');

    detectSignals(ctx.db, TODAY, NOW);
    const first = listActiveSignals(ctx.db);
    expect(first).toHaveLength(1);
    expect(first[0]!.kind).toBe('unusual_expense');

    detectSignals(ctx.db, TODAY, NOW);
    expect(listActiveSignals(ctx.db)).toHaveLength(1);
    expect(listAllSignals(ctx.db)).toHaveLength(1);
  });

  it('un signal écarté n’est jamais recréé même si la condition tient toujours', () => {
    expense(40_00, '2026-09-01');
    expense(40_00, '2026-09-10');
    expense(40_00, '2026-09-20');
    expense(100_00, '2026-10-05');
    detectSignals(ctx.db, TODAY, NOW);
    const [signal] = listActiveSignals(ctx.db);
    dismissSignal(ctx.db, signal!.id, NOW.toISOString());

    detectSignals(ctx.db, TODAY, NOW);
    expect(listActiveSignals(ctx.db)).toEqual([]);
    expect(listAllSignals(ctx.db)).toHaveLength(1);
  });

  it('résout automatiquement un signal de charge manquante une fois l’opération supprimée', () => {
    const rule = createRule(ctx.db, {
      name: 'Loyer', kind: 'expense', amount: 800_00, label: 'Loyer', accountId: ctx.courant.id, envelopeId: ctx.courses.id,
      frequency: 'monthly', interval: 1, dayOfMonth: 1, startDate: '2026-01-01', active: true, triggersFunding: false, fundsNextMonth: false,
    });
    const planned = createTransaction(ctx.db, {
      kind: 'expense', amount: 800_00, date: '2026-10-01', label: 'Loyer', accountId: ctx.courant.id, envelopeId: ctx.courses.id,
      status: 'planned', recurringRuleId: rule.id,
    });

    detectSignals(ctx.db, TODAY, NOW);
    expect(listActiveSignals(ctx.db).map((s) => s.kind)).toEqual(['missing_charge']);

    deleteTransaction(ctx.db, planned.id);
    detectSignals(ctx.db, TODAY, NOW);
    expect(listActiveSignals(ctx.db)).toEqual([]);
    expect(listAllSignals(ctx.db)[0]!.resolvedAt).not.toBeNull();
  });

  it('résout un signal de changement de prix une fois la règle mise à jour au nouveau montant', () => {
    const rule = createRule(ctx.db, {
      name: 'Salle', kind: 'expense', amount: 10_00, label: 'Salle', accountId: ctx.courant.id, envelopeId: ctx.courses.id,
      frequency: 'monthly', interval: 1, dayOfMonth: 1, startDate: '2026-01-01', active: true, triggersFunding: false, fundsNextMonth: false,
    });
    createTransaction(ctx.db, {
      kind: 'expense', amount: 11_00, date: '2026-10-01', label: 'Salle', accountId: ctx.courant.id, envelopeId: ctx.courses.id, recurringRuleId: rule.id,
    });

    detectSignals(ctx.db, TODAY, NOW);
    expect(listActiveSignals(ctx.db).map((s) => s.kind)).toEqual(['price_change']);

    updateRule(ctx.db, rule.id, {
      name: 'Salle', kind: 'expense', amount: 11_00, label: 'Salle', accountId: ctx.courant.id, envelopeId: ctx.courses.id,
      frequency: 'monthly', interval: 1, dayOfMonth: 1, startDate: '2026-01-01', active: true, triggersFunding: false, fundsNextMonth: false,
    });
    detectSignals(ctx.db, TODAY, NOW);
    expect(listActiveSignals(ctx.db)).toEqual([]);
  });
});
