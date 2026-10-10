import { describe, expect, it } from 'vitest';
import { createTestApp } from './helpers';

describe('GET /api/overview : pendingReview', () => {
  it('annonce le bilan du mois précédent tant qu’il n’est pas validé', async () => {
    const t = createTestApp('2026-10-10');
    await t.call('PATCH', `/api/envelopes/${t.courses.id}`, { monthlyExtra: 180_00 });
    await t.call('POST', '/api/transactions', { kind: 'allocation', date: '2026-09-01', amount: 180_00, label: 'Budget', envelopeId: t.courses.id });
    // Dépassement de 20 € en septembre.
    await t.call('POST', '/api/transactions', { kind: 'expense', date: '2026-09-05', amount: 200_00, label: 'Carrefour', accountId: t.courant.id, envelopeId: t.courses.id });

    const { body } = await t.call('GET', '/api/overview');
    expect(body.pendingReview).toEqual({ month: '2026-09', spent: 200_00, overspentCount: 1 });

    await t.call('POST', '/api/reviews/2026-09', { budgets: [], transfers: [] });
    expect((await t.call('GET', '/api/overview')).body.pendingReview).toBeNull();
  });
});
