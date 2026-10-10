import { beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './helpers';

let t: TestApp;
beforeEach(() => {
  t = createTestApp();
});

describe('signaux', () => {
  it('liste les signaux actifs, les compte dans l’aperçu, et les écarte sans les recréer', async () => {
    const rule = await t.call('POST', '/api/recurring-rules', {
      name: 'Loyer', kind: 'expense', amount: 800_00, label: 'Loyer', accountId: t.courant.id, envelopeId: t.courses.id,
      frequency: 'monthly', dayOfMonth: 1, startDate: '2026-03-01',
    });
    expect(rule.status).toBe(201);
    // Matérialise les occurrences dues (middleware) ; le loyer de mars est en retard de plus de 5 jours au 2026-03-10.
    await t.call('GET', '/api/transactions?status=planned');
    // Relance la détection : une modification de charge fixe la redéclenche.
    await t.call('PUT', `/api/recurring-rules/${rule.body.id}`, {
      name: 'Loyer', kind: 'expense', amount: 800_00, label: 'Loyer', accountId: t.courant.id, envelopeId: t.courses.id,
      frequency: 'monthly', dayOfMonth: 1, startDate: '2026-03-01',
    });

    const signals = await t.call('GET', '/api/signals');
    expect(signals.status).toBe(200);
    expect(signals.body).toHaveLength(1);
    expect(signals.body[0]).toMatchObject({ kind: 'missing_charge', dismissedAt: null, resolvedAt: null });
    expect(signals.body[0].payload).toMatchObject({ label: 'Loyer', amount: 800_00 });

    const overview = await t.call('GET', '/api/overview');
    expect(overview.body.signalCount).toBe(1);

    const dismissed = await t.call('POST', `/api/signals/${signals.body[0].id}/dismiss`);
    expect(dismissed.status).toBe(204);
    expect((await t.call('GET', '/api/signals')).body).toEqual([]);
    expect((await t.call('GET', '/api/overview')).body.signalCount).toBe(0);

    // Un passage de plus (via une nouvelle modification) ne ressuscite pas le signal écarté.
    await t.call('PUT', `/api/recurring-rules/${rule.body.id}`, {
      name: 'Loyer', kind: 'expense', amount: 800_00, label: 'Loyer', accountId: t.courant.id, envelopeId: t.courses.id,
      frequency: 'monthly', dayOfMonth: 1, startDate: '2026-03-01',
    });
    expect((await t.call('GET', '/api/signals')).body).toEqual([]);
  });

  it('404 sur un signal inconnu', async () => {
    expect((await t.call('POST', '/api/signals/999/dismiss')).status).toBe(404);
  });
});
