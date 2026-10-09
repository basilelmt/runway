import { describe, expect, it } from 'vitest';
import { createTestApp } from './helpers';

describe('GET /api/overview : enveloppes à surveiller', () => {
  it('liste les dépassées puis les presque vides, hors épargne', async () => {
    // Le 10 mars : 21 jours restants.
    const t = createTestApp('2026-03-10');
    // Courses : 100 € répartis, 112,40 € dépensés, dépassée de 12,40 €.
    await t.call('POST', '/api/transactions', { kind: 'allocation', date: '2026-03-01', amount: 100_00, label: 'Budget', envelopeId: t.courses.id });
    await t.call('POST', '/api/transactions', { kind: 'expense', date: '2026-03-05', amount: 112_40, label: 'Carrefour', accountId: t.courant.id, envelopeId: t.courses.id });
    // Loisirs : 50 € de complément, 40 € dedans, mais un abonnement de 37 € tombe le 20 : 3 € de libre.
    await t.call('PATCH', `/api/envelopes/${t.loisirs.id}`, { monthlyExtra: 50_00 });
    await t.call('POST', '/api/transactions', { kind: 'allocation', date: '2026-03-01', amount: 40_00, label: 'Budget', envelopeId: t.loisirs.id });
    await t.call('POST', '/api/recurring-rules', {
      name: 'Abonnement', kind: 'expense', amount: 37_00, label: 'Abonnement', accountId: t.courant.id, envelopeId: t.loisirs.id,
      frequency: 'monthly', dayOfMonth: 20, startDate: '2026-03-15',
    });
    // Une enveloppe d'épargne dans le rouge n'est pas à surveiller.
    const bourse = await t.call('POST', '/api/envelopes', { name: 'Bourse', color: '#4f8a5b', isSavings: true });
    await t.call('POST', '/api/transactions', { kind: 'expense', date: '2026-03-06', amount: 20_00, label: 'PEA', accountId: t.courant.id, envelopeId: bourse.body.id });

    const { body } = await t.call('GET', '/api/overview');
    expect(body.watch).toEqual([
      { envelopeId: t.courses.id, name: 'Courses', kind: 'over', amount: 12_40 },
      { envelopeId: t.loisirs.id, name: 'Loisirs', kind: 'low', amount: 3_00 },
    ]);
    // La comparaison au revenu s'appuie sur les budgets calculés : 37 € de charges + 50 € de complément.
    expect(body.month.planned).toBe(87_00);

    // Le 25 : 6 jours restants, Loisirs n'est plus signalée, Courses reste dépassée.
    t.setToday('2026-03-25');
    expect((await t.call('GET', '/api/overview')).body.watch).toEqual([{ envelopeId: t.courses.id, name: 'Courses', kind: 'over', amount: 12_40 }]);
  });
});
