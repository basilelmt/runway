import { describe, expect, it } from 'vitest';
import { createTestApp } from './helpers';

describe('GET /api/reviews/:month', () => {
  it('refuse le mois en cours et un mois futur', async () => {
    const t = createTestApp('2026-10-10');
    expect((await t.call('GET', '/api/reviews/2026-10')).status).toBe(400);
    expect((await t.call('GET', '/api/reviews/2026-11')).status).toBe(400);
  });

  it('calcule le bilan d’un mois passé, non validé', async () => {
    const t = createTestApp('2026-10-10');
    await t.call('PATCH', `/api/envelopes/${t.courses.id}`, { monthlyExtra: 180_00 });
    await t.call('POST', '/api/transactions', { kind: 'allocation', date: '2026-09-01', amount: 400_00, label: 'Budget', envelopeId: t.courses.id });
    await t.call('POST', '/api/transactions', { kind: 'expense', date: '2026-09-05', amount: 300_00, label: 'Carrefour', accountId: t.courant.id, envelopeId: t.courses.id });

    const { status, body } = await t.call('GET', '/api/reviews/2026-09');
    expect(status).toBe(200);
    expect(body.month).toBe('2026-09');
    expect(body.status).toEqual({ validated: false, reviewedAt: null, applied: null });
    const courses = body.envelopes.find((e: any) => e.envelopeId === t.courses.id);
    expect(courses).toMatchObject({ budget: 180_00, spent: 300_00, gap: 120_00 });
    // Reste à aujourd'hui : 400 répartis - 300 dépensés = 100 €, et c'est le mois qui précède directement aujourd'hui.
    expect(body.remainders).toEqual([{ envelopeId: t.courses.id, name: 'Courses', color: t.courses.color, amount: 100_00 }]);
  });
});

describe('POST /api/reviews/:month', () => {
  it('applique budgets et versements dans une même transaction, et enregistre le bilan', async () => {
    const t = createTestApp('2026-10-10');
    const bourse = (await t.call('POST', '/api/envelopes', { name: 'Bourse', color: '#4f8a5b', isSavings: true })).body;
    await t.call('POST', '/api/transactions', { kind: 'allocation', date: '2026-09-01', amount: 400_00, label: 'Budget', envelopeId: t.courses.id });
    await t.call('POST', '/api/transactions', { kind: 'expense', date: '2026-09-05', amount: 300_00, label: 'Carrefour', accountId: t.courant.id, envelopeId: t.courses.id });

    const apply = await t.call('POST', '/api/reviews/2026-09', {
      budgets: [{ envelopeId: t.loisirs.id, monthlyExtra: 50_00 }],
      transfers: [{ fromEnvelopeId: t.courses.id, toEnvelopeId: bourse.id, amount: 60_00 }],
    });
    expect(apply.status).toBe(200);
    expect(apply.body.status.validated).toBe(true);

    expect((await t.call('GET', `/api/envelopes/${t.loisirs.id}`)).body.monthlyExtra).toBe(50_00);
    const versement = await t.call('GET', `/api/transactions?envelope=${bourse.id}`);
    expect(versement.body).toHaveLength(1);
    expect(versement.body[0]).toMatchObject({ kind: 'allocation', date: '2026-10-10', amount: 60_00, fromEnvelopeId: t.courses.id, envelopeId: bourse.id });
  });

  it('un versement invalide n’applique aucun budget (tout ou rien)', async () => {
    const t = createTestApp('2026-10-10');
    await t.call('POST', '/api/transactions', { kind: 'allocation', date: '2026-09-01', amount: 400_00, label: 'Budget', envelopeId: t.courses.id });
    await t.call('POST', '/api/transactions', { kind: 'expense', date: '2026-09-05', amount: 300_00, label: 'Carrefour', accountId: t.courant.id, envelopeId: t.courses.id });
    // Loisirs n'est pas une enveloppe d'épargne : le versement doit être refusé.
    const apply = await t.call('POST', '/api/reviews/2026-09', {
      budgets: [{ envelopeId: t.loisirs.id, monthlyExtra: 50_00 }],
      transfers: [{ fromEnvelopeId: t.courses.id, toEnvelopeId: t.loisirs.id, amount: 10_00 }],
    });
    expect(apply.status).toBe(400);
    expect((await t.call('GET', `/api/envelopes/${t.loisirs.id}`)).body.monthlyExtra).toBeNull();
    expect((await t.call('GET', '/api/reviews/2026-09')).body.status.validated).toBe(false);
  });

  it('un versement qui dépasse le solde de la source est refusé', async () => {
    const t = createTestApp('2026-10-10');
    const bourse = (await t.call('POST', '/api/envelopes', { name: 'Bourse', color: '#4f8a5b', isSavings: true })).body;
    // Solde de Courses à aujourd'hui : 0.
    const apply = await t.call('POST', '/api/reviews/2026-09', { budgets: [], transfers: [{ fromEnvelopeId: t.courses.id, toEnvelopeId: bourse.id, amount: 1_00 }] });
    expect(apply.status).toBe(400);
  });

  it('un versement plafonné au reste de septembre, pas au solde actuel gonflé par le budget d’octobre', async () => {
    const t = createTestApp('2026-10-10');
    const bourse = (await t.call('POST', '/api/envelopes', { name: 'Bourse', color: '#4f8a5b', isSavings: true })).body;
    // Fin septembre : 100 € de reste. Octobre ajoute 300 € de budget du mois, jamais dépensés : solde à aujourd'hui 400 €.
    await t.call('POST', '/api/transactions', { kind: 'allocation', date: '2026-09-01', amount: 300_00, label: 'Budget', envelopeId: t.courses.id });
    await t.call('POST', '/api/transactions', { kind: 'expense', date: '2026-09-05', amount: 200_00, label: 'Carrefour', accountId: t.courant.id, envelopeId: t.courses.id });
    await t.call('POST', '/api/transactions', { kind: 'allocation', date: '2026-10-01', amount: 300_00, label: 'Budget', envelopeId: t.courses.id });

    const tooMuch = await t.call('POST', '/api/reviews/2026-09', { budgets: [], transfers: [{ fromEnvelopeId: t.courses.id, toEnvelopeId: bourse.id, amount: 200_00 }] });
    expect(tooMuch.status).toBe(400);

    const exact = await t.call('POST', '/api/reviews/2026-09', { budgets: [], transfers: [{ fromEnvelopeId: t.courses.id, toEnvelopeId: bourse.id, amount: 100_00 }] });
    expect(exact.status).toBe(200);
  });

  it('refuse un mois déjà validé (409)', async () => {
    const t = createTestApp('2026-10-10');
    await t.call('POST', '/api/reviews/2026-09', { budgets: [], transfers: [] });
    const second = await t.call('POST', '/api/reviews/2026-09', { budgets: [], transfers: [] });
    expect(second.status).toBe(409);
  });
});

describe('DELETE /api/reviews/:month', () => {
  it('annule : remet les compléments avant, respecte un complément modifié depuis, retire les versements', async () => {
    const t = createTestApp('2026-10-10');
    const bourse = (await t.call('POST', '/api/envelopes', { name: 'Bourse', color: '#4f8a5b', isSavings: true })).body;
    await t.call('PATCH', `/api/envelopes/${t.courses.id}`, { monthlyExtra: 180_00 });
    await t.call('POST', '/api/transactions', { kind: 'allocation', date: '2026-09-01', amount: 400_00, label: 'Budget', envelopeId: t.courses.id });

    await t.call('POST', '/api/reviews/2026-09', {
      budgets: [{ envelopeId: t.courses.id, monthlyExtra: 300_00 }, { envelopeId: t.loisirs.id, monthlyExtra: 50_00 }],
      transfers: [{ fromEnvelopeId: t.courses.id, toEnvelopeId: bourse.id, amount: 20_00 }],
    });
    expect((await t.call('GET', `/api/envelopes/${t.courses.id}`)).body.monthlyExtra).toBe(300_00);

    // Courses est modifiée depuis la validation : l'annulation ne doit pas l'écraser.
    await t.call('PATCH', `/api/envelopes/${t.courses.id}`, { monthlyExtra: 999_00 });

    const cancel = await t.call('DELETE', '/api/reviews/2026-09');
    expect(cancel.status).toBe(200);
    expect(cancel.body.skipped).toEqual([{ envelopeId: t.courses.id, name: 'Courses' }]);

    expect((await t.call('GET', `/api/envelopes/${t.courses.id}`)).body.monthlyExtra).toBe(999_00);
    expect((await t.call('GET', `/api/envelopes/${t.loisirs.id}`)).body.monthlyExtra).toBeNull();
    expect((await t.call('GET', `/api/transactions?envelope=${bourse.id}`)).body).toHaveLength(0);
    expect((await t.call('GET', '/api/reviews/2026-09')).body.status.validated).toBe(false);
  });

  it('404 sur un mois non validé', async () => {
    const t = createTestApp('2026-10-10');
    expect((await t.call('DELETE', '/api/reviews/2026-09')).status).toBe(404);
  });
});
