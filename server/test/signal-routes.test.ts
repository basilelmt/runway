import { beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './helpers';

let t: TestApp;
beforeEach(() => {
  t = createTestApp();
});

describe('signaux', () => {
  it('liste les signaux actifs, les compte dans l’aperçu, et les écarte sans les recréer', async () => {
    const rule = await t.call('POST', '/api/recurring-rules', {
      name: 'Salle', kind: 'expense', amount: 10_00, label: 'Salle', accountId: t.courant.id, envelopeId: t.courses.id,
      frequency: 'monthly', dayOfMonth: 5, startDate: '2026-01-01',
    });
    expect(rule.status).toBe(201);
    // Matérialise les occurrences dues (middleware), confirme celle de mars puis change son montant :
    // une opération confirmée rapprochée de la règle, à un montant différent.
    const planned = await t.call('GET', '/api/transactions?status=planned');
    const march = planned.body.find((x: { date: string }) => x.date === '2026-03-05');
    await t.call('POST', `/api/transactions/${march.id}/confirm`);
    await t.call('PUT', `/api/transactions/${march.id}`, {
      kind: 'expense', amount: 11_00, label: 'Salle', accountId: t.courant.id, envelopeId: t.courses.id, date: '2026-03-05',
    });
    // Relance la détection : une modification de charge fixe la redéclenche.
    await t.call('PUT', `/api/recurring-rules/${rule.body.id}`, {
      name: 'Salle', kind: 'expense', amount: 10_00, label: 'Salle', accountId: t.courant.id, envelopeId: t.courses.id,
      frequency: 'monthly', dayOfMonth: 5, startDate: '2026-01-01',
    });

    const signals = await t.call('GET', '/api/signals');
    expect(signals.status).toBe(200);
    expect(signals.body).toHaveLength(1);
    expect(signals.body[0]).toMatchObject({ kind: 'price_change', dismissedAt: null, resolvedAt: null });
    expect(signals.body[0].payload).toMatchObject({ ruleName: 'Salle', oldAmount: 10_00, newAmount: 11_00 });

    const overview = await t.call('GET', '/api/overview');
    expect(overview.body.signalCount).toBe(1);

    const dismissed = await t.call('POST', `/api/signals/${signals.body[0].id}/dismiss`);
    expect(dismissed.status).toBe(204);
    expect((await t.call('GET', '/api/signals')).body).toEqual([]);
    expect((await t.call('GET', '/api/overview')).body.signalCount).toBe(0);

    // Un passage de plus (via une nouvelle modification) ne ressuscite pas le signal écarté.
    await t.call('PUT', `/api/recurring-rules/${rule.body.id}`, {
      name: 'Salle', kind: 'expense', amount: 10_00, label: 'Salle', accountId: t.courant.id, envelopeId: t.courses.id,
      frequency: 'monthly', dayOfMonth: 5, startDate: '2026-01-01',
    });
    expect((await t.call('GET', '/api/signals')).body).toEqual([]);
  });

  it('404 sur un signal inconnu', async () => {
    expect((await t.call('POST', '/api/signals/999/dismiss')).status).toBe(404);
  });
});
