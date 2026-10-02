import { beforeEach, describe, expect, it } from 'vitest';
import { createRule } from '../src/repos/recurring-rules';
import { listTransactions } from '../src/repos/transactions';
import { materializeDue } from '../src/services/materialize';
import { createTestDb, type TestContext } from './helpers';

let ctx: TestContext;
beforeEach(() => {
  ctx = createTestDb();
});

const loyer = (ctx: TestContext) =>
  createRule(ctx.db, {
    name: 'Loyer', kind: 'expense', amount: 800_00, label: 'Loyer', accountId: ctx.courant.id, envelopeId: ctx.courses.id,
    frequency: 'monthly', interval: 1, dayOfMonth: 5, startDate: '2026-01-01', active: true,
  });

describe('materializeDue', () => {
  it('génère les occurrences passées en prévues, une seule fois', () => {
    loyer(ctx);
    expect(materializeDue(ctx.db, '2026-03-10')).toBe(3);
    const planned = listTransactions(ctx.db, { status: 'planned' });
    expect(planned.map((t) => t.date)).toEqual(['2026-03-05', '2026-02-05', '2026-01-05']);
    expect(planned[0]?.envelopeId).toBe(ctx.courses.id);
    expect(materializeDue(ctx.db, '2026-03-10')).toBe(0);
    expect(materializeDue(ctx.db, '2026-04-05')).toBe(1);
  });

  it('les allocations sont confirmées d’office', () => {
    createRule(ctx.db, {
      name: 'Budget courses', kind: 'allocation', amount: 400_00, label: 'Budget courses', envelopeId: ctx.courses.id,
      frequency: 'monthly', interval: 1, dayOfMonth: 1, startDate: '2026-03-01', active: true,
    });
    materializeDue(ctx.db, '2026-03-10');
    const [t] = listTransactions(ctx.db);
    expect(t?.status).toBe('confirmed');
    expect(t?.kind).toBe('allocation');
  });

  it('respecte la date de fin et l’inactivité', () => {
    createRule(ctx.db, {
      name: 'Fini', kind: 'expense', amount: 1, label: 'Fini', accountId: ctx.courant.id,
      frequency: 'monthly', interval: 1, dayOfMonth: 1, startDate: '2026-01-01', endDate: '2026-02-15', active: true,
    });
    createRule(ctx.db, {
      name: 'Pause', kind: 'expense', amount: 1, label: 'Pause', accountId: ctx.courant.id,
      frequency: 'daily', interval: 1, startDate: '2026-01-01', active: false,
    });
    expect(materializeDue(ctx.db, '2026-03-10')).toBe(2);
  });

  it('ne recrée pas une occurrence déjà présente', () => {
    const r = loyer(ctx);
    materializeDue(ctx.db, '2026-01-10');
    ctx.db.run(`update recurring_rules set last_generated_date = null where id = ${r.id}`);
    expect(materializeDue(ctx.db, '2026-01-10')).toBe(0);
  });
});
