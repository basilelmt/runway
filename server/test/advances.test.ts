import { beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './helpers';

let t: TestApp;
beforeEach(() => {
  t = createTestApp('2026-07-30');
});

async function createExpense(amount: number, label = 'Bowling', date = '2026-07-26', envelopeId?: number) {
  const r = await t.call('POST', '/api/transactions', { kind: 'expense', date, amount, label, accountId: t.courant.id, envelopeId: envelopeId ?? null });
  return r.body;
}

async function createIncome(amount: number, label: string, date = '2026-07-28', envelopeId?: number | null) {
  const r = await t.call('POST', '/api/transactions', { kind: 'income', date, amount, label, accountId: t.courant.id, envelopeId: envelopeId ?? null });
  return r.body;
}

describe('avances', () => {
  it('un revenu accepte une enveloppe : il la crédite et réduit son dépensé du mois', async () => {
    const dep = await createExpense(80_00, 'Bowling', '2026-07-26', t.loisirs.id);
    const income = await createIncome(40_00, 'VIREMENT INSTANTANE WERO DE MAX CEKANOWSKI', '2026-07-28', t.loisirs.id);
    expect(income.envelopeId).toBe(t.loisirs.id);

    const overview = await t.call('GET', '/api/overview');
    const loisirs = overview.body.envelopes.find((e: any) => e.id === t.loisirs.id);
    expect(loisirs.spentThisMonth).toBe(40_00);
    expect(dep.id).toBeDefined();
  });

  it('PUT /api/transactions/:id/advances : plafonne la somme au montant de la dépense', async () => {
    const dep = await createExpense(80_00);
    const ok = await t.call('PUT', `/api/transactions/${dep.id}/advances`, [{ person: 'Max', amount: 40_00 }]);
    expect(ok.status).toBe(200);
    expect(ok.body).toHaveLength(1);
    expect(ok.body[0]).toMatchObject({ person: 'Max', amount: 40_00, refundId: null, settledAt: null });

    const tooMuch = await t.call('PUT', `/api/transactions/${dep.id}/advances`, [{ person: 'Max', amount: 50_00 }, { person: 'Léa', amount: 40_00 }]);
    expect(tooMuch.status).toBe(400);
  });

  it('modifier le montant d’une dépense sous la somme de ses avances est refusé', async () => {
    const dep = await createExpense(80_00);
    await t.call('PUT', `/api/transactions/${dep.id}/advances`, [{ person: 'Max', amount: 40_00 }]);
    const patched = await t.call('PUT', `/api/transactions/${dep.id}`, { ...dep, amount: 30_00 });
    expect(patched.status).toBe(400);
    const ok = await t.call('PUT', `/api/transactions/${dep.id}`, { ...dep, amount: 50_00 });
    expect(ok.status).toBe(200);
  });

  it('POST /api/advances/settle avec un remboursement range le revenu dans l’enveloppe de la dépense', async () => {
    const dep = await createExpense(80_00, 'Bowling', '2026-07-26', t.loisirs.id);
    const advances = (await t.call('PUT', `/api/transactions/${dep.id}/advances`, [{ person: 'Max', amount: 40_00 }])).body;
    const income = await createIncome(40_00, 'VIREMENT INSTANTANE WERO DE MAX CEKANOWSKI');
    expect(income.envelopeId).toBeNull();

    const settled = await t.call('POST', '/api/advances/settle', { advanceIds: [advances[0].id], refundId: income.id });
    expect(settled.status).toBe(200);
    expect(settled.body[0]).toMatchObject({ refundId: income.id, settledAt: null });

    const refund = await t.call('GET', `/api/transactions/${income.id}`);
    expect(refund.body.envelopeId).toBe(t.loisirs.id);
  });

  it('POST /api/advances/settle sans remboursement pose settledAt', async () => {
    const dep = await createExpense(80_00);
    const advances = (await t.call('PUT', `/api/transactions/${dep.id}/advances`, [{ person: 'Léa', amount: 20_00 }])).body;
    const settled = await t.call('POST', '/api/advances/settle', { advanceIds: [advances[0].id], refundId: null });
    expect(settled.body[0].settledAt).not.toBeNull();
    expect(settled.body[0].refundId).toBeNull();
  });

  it('réouverture : une avance soldée redevient ouverte', async () => {
    const dep = await createExpense(80_00);
    const advances = (await t.call('PUT', `/api/transactions/${dep.id}/advances`, [{ person: 'Léa', amount: 20_00 }])).body;
    await t.call('POST', '/api/advances/settle', { advanceIds: [advances[0].id], refundId: null });
    const reopened = await t.call('POST', `/api/advances/${advances[0].id}/reopen`, {});
    expect(reopened.body).toMatchObject({ refundId: null, settledAt: null });
  });

  it('supprimer la dépense supprime ses avances ; supprimer le remboursement rouvre l’avance', async () => {
    const dep = await createExpense(80_00, 'Bowling', '2026-07-26', t.loisirs.id);
    const advances = (await t.call('PUT', `/api/transactions/${dep.id}/advances`, [{ person: 'Max', amount: 40_00 }])).body;
    const income = await createIncome(40_00, 'WERO DE MAX');
    await t.call('POST', '/api/advances/settle', { advanceIds: [advances[0].id], refundId: income.id });

    await t.call('DELETE', `/api/transactions/${income.id}`);
    const afterRefundDeleted = await t.call('GET', '/api/advances?status=all');
    expect(afterRefundDeleted.body[0]).toMatchObject({ refund: null, settledAt: null });

    const del = await t.call('DELETE', `/api/transactions/${dep.id}`);
    expect(del.status).toBe(204);
    const afterExpenseDeleted = await t.call('GET', '/api/advances?status=all');
    expect(afterExpenseDeleted.body).toHaveLength(0);
  });

  it('GET /api/advances/people : total ouvert et date de la dépense la plus ancienne (pas la date d’enregistrement de l’avance)', async () => {
    const dep1 = await createExpense(80_00, 'Bowling', '2026-07-01', t.loisirs.id);
    const dep2 = await createExpense(30_00, 'Ciné', '2026-07-15', t.loisirs.id);
    // Les deux avances sont saisies aujourd'hui (2026-07-30 dans ce test), bien après les dépenses.
    await t.call('PUT', `/api/transactions/${dep1.id}/advances`, [{ person: 'Max', amount: 40_00 }]);
    await t.call('PUT', `/api/transactions/${dep2.id}/advances`, [{ person: 'Max', amount: 10_00 }]);

    const people = await t.call('GET', '/api/advances/people');
    expect(people.body).toEqual([{ person: 'Max', totalOpen: 50_00, oldestOpenDate: '2026-07-01', openCount: 2 }]);
  });

  it('GET /api/advances/suggestions : nom en commun et montant exact', async () => {
    const dep = await createExpense(82_50, 'Bowling', '2026-07-26', t.loisirs.id);
    await t.call('PUT', `/api/transactions/${dep.id}/advances`, [{ person: 'Max', amount: 41_50 }]);
    await createIncome(41_50, 'VIREMENT INSTANTANE WERO DE MAX CEKANOWSKI', '2026-07-28');

    const suggestions = await t.call('GET', '/api/advances/suggestions');
    expect(suggestions.body).toHaveLength(1);
    expect(suggestions.body[0]).toMatchObject({ person: 'Max', amount: 41_50, expenses: [{ id: dep.id, label: 'Bowling' }] });
  });

  it('GET /api/advances/suggestions : rien sur un revenu déjà rangé dans une enveloppe', async () => {
    const dep = await createExpense(82_50, 'Bowling', '2026-07-26', t.loisirs.id);
    await t.call('PUT', `/api/transactions/${dep.id}/advances`, [{ person: 'Max', amount: 41_50 }]);
    await createIncome(41_50, 'VIREMENT INSTANTANE WERO DE MAX CEKANOWSKI', '2026-07-28', t.courses.id);

    const suggestions = await t.call('GET', '/api/advances/suggestions');
    expect(suggestions.body).toHaveLength(0);
  });

  it('GET /api/advances/suggestions : le rapprochement s’appuie sur le libellé bancaire, même renommé par un marchand', async () => {
    const dep = await createExpense(82_50, 'Bowling', '2026-07-26', t.loisirs.id);
    await t.call('PUT', `/api/transactions/${dep.id}/advances`, [{ person: 'Max', amount: 41_50 }]);
    const income = await createIncome(41_50, 'VIREMENT INSTANTANE WERO DE MAX CEKANOWSKI', '2026-07-28');
    // Renommer le marchand ne doit pas casser le rapprochement par mot commun (basé sur le libellé brut),
    // et la proposition affiche bien le nom du marchand, pas le libellé bancaire brut.
    await t.call('PUT', `/api/merchants/${encodeURIComponent(income.merchantKey)}`, { name: 'Copain Max' });

    const suggestions = await t.call('GET', '/api/advances/suggestions');
    expect(suggestions.body).toHaveLength(1);
    expect(suggestions.body[0]).toMatchObject({ person: 'Max', incomeLabel: 'Copain Max' });
  });

  it('GET /api/advances/suggestions : la fenêtre est relative à la dépense, pas à aujourd’hui', async () => {
    t.setToday('2026-10-10');
    const dep = await createExpense(82_50, 'Bowling', '2026-07-27', t.loisirs.id);
    await t.call('PUT', `/api/transactions/${dep.id}/advances`, [{ person: 'Max', amount: 41_50 }]);
    // Remboursement le jour même de la dépense, plus de 60 jours avant aujourd'hui : doit quand même être proposé.
    await createIncome(41_50, 'VIREMENT INSTANTANE WERO DE MAX CEKANOWSKI bowling', '2026-07-27');

    const suggestions = await t.call('GET', '/api/advances/suggestions');
    expect(suggestions.body).toHaveLength(1);
    expect(suggestions.body[0]).toMatchObject({ person: 'Max', amount: 41_50 });
  });

  it('GET /api/advances/unsorted-incomes : exclut un revenu couvert par une règle de revenu active, même sans recurring_rule_id', async () => {
    t.setToday('2026-10-10');
    // La règle n'a été créée qu'en octobre : les occurrences passées n'ont pas de recurring_rule_id.
    await t.call('POST', '/api/recurring-rules', {
      name: 'Salaire', kind: 'income', amount: 2450_00, label: 'VIREMENT SPORTEASY', accountId: t.courant.id,
      frequency: 'monthly', dayOfMonth: 28, startDate: '2026-10-01',
    });
    await createIncome(2500_58, 'VIREMENT SPORTEASY SEPTEMBRE', '2026-09-29');
    // Un revenu sans rapport ne doit pas être exclu.
    await createIncome(50_00, 'VIREMENT DE MR LAMOTTE BASILE', '2026-09-28');

    const unsorted = await t.call('GET', '/api/advances/unsorted-incomes');
    expect(unsorted.body.map((i: any) => i.label)).toEqual(['VIREMENT DE MR LAMOTTE BASILE']);
  });

  it('GET /api/advances/unsorted-incomes : exclut un revenu au marchand d’une occurrence déjà liée à une règle, même hors ±10 % du montant', async () => {
    t.setToday('2026-10-10');
    // Matérialise une occurrence (prévue) liée à la règle, dès le premier appel : même marchand que l'historique.
    await t.call('POST', '/api/recurring-rules', {
      name: 'Salaire', kind: 'income', amount: 2450_00, label: 'VIREMENT SPORTEASY', accountId: t.courant.id,
      frequency: 'monthly', dayOfMonth: 5, startDate: '2026-09-01',
    });
    const planned = await t.call('GET', '/api/transactions?status=planned');
    expect(planned.body.some((x: any) => x.label === 'VIREMENT SPORTEASY' && x.recurringRuleId !== null)).toBe(true);

    // Un montant très éloigné de la règle (donc hors ±10 %), même marchand : exclu par le marchand déjà lié.
    await createIncome(1_00, 'VIREMENT SPORTEASY', '2026-08-05');

    const unsorted = await t.call('GET', '/api/advances/unsorted-incomes');
    expect(unsorted.body).toHaveLength(0);
  });
});
