import { beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './helpers';

let t: TestApp;
beforeEach(async () => {
  t = createTestApp('2026-03-10');
  await t.call('POST', '/api/transactions', { kind: 'income', date: '2026-02-28', amount: 2000_00, label: 'Salaire', accountId: t.courant.id });
  await t.call('POST', '/api/transactions', { kind: 'allocation', date: '2026-03-01', amount: 400_00, label: 'Budget courses', envelopeId: t.courses.id });
  await t.call('POST', '/api/transactions', { kind: 'expense', date: '2026-03-02', amount: 60_00, label: 'Carrefour', accountId: t.courant.id, envelopeId: t.courses.id });
  await t.call('POST', '/api/transactions', { kind: 'expense', date: '2026-03-03', amount: 15_00, label: 'Inconnu', accountId: t.courant.id });
  await t.call('POST', '/api/transactions', { kind: 'transfer', date: '2026-03-04', amount: 500_00, label: 'Épargne', accountId: t.courant.id, toAccountId: t.livret.id });
  await t.call('POST', '/api/recurring-rules', {
    name: 'Loyer', kind: 'expense', amount: 3000_00, label: 'Loyer', accountId: t.courant.id, envelopeId: t.loisirs.id,
    frequency: 'monthly', dayOfMonth: 20, startDate: '2026-03-15',
  });
});

describe('GET /api/overview', () => {
  it('compare les budgets des enveloppes au revenu mensuel attendu', async () => {
    await t.call('PATCH', `/api/envelopes/${t.courses.id}`, { monthlyTarget: 400_00 });
    await t.call('PATCH', `/api/envelopes/${t.loisirs.id}`, { monthlyTarget: 3000_00 });
    const epargne = await t.call('POST', '/api/envelopes', { name: 'Épargne', color: '#4f8a5b', monthlyTarget: 100_00, isSavings: true });
    expect(epargne.status).toBe(201);
    const rule = (body: object) => t.call('POST', '/api/recurring-rules', { kind: 'income', label: 'Salaire', accountId: t.courant.id, startDate: '2026-01-01', ...body });
    await rule({ name: 'Salaire', amount: 2450_00, frequency: 'monthly', dayOfMonth: 28 });
    // Une prime annuelle compte pour un douzième, un revenu terminé ou en pause ne compte pas.
    await rule({ name: 'Prime', amount: 1200_00, frequency: 'yearly', dayOfMonth: 15 });
    await rule({ name: 'Ancien job', amount: 500_00, frequency: 'monthly', dayOfMonth: 5, endDate: '2026-02-28' });
    const paused = await rule({ name: 'Freelance', amount: 300_00, frequency: 'monthly', dayOfMonth: 10 });
    await t.call('PATCH', `/api/recurring-rules/${paused.body.id}/active`, { active: false });

    const { body } = await t.call('GET', '/api/overview');
    expect(body.month.income).toBe(2550_00);
    // Épargne comprise : c'est aussi de l'argent prélevé sur le revenu.
    expect(body.month.planned).toBe(3500_00);
    expect(body.month.budget).toBe(3400_00);
  });

  it('assemble soldes, alertes et compteurs', async () => {
    const { status, body } = await t.call('GET', '/api/overview');
    expect(status).toBe(200);
    // 1000 + 2000 - 60 - 15 - 500 = 2425 sur le courant ; 500 sur le livret (hors budget)
    expect(body.accounts.find((a: any) => a.id === t.courant.id).balance).toBe(2425_00);
    expect(body.netWorth).toBe(2925_00);
    // 2425 - (400 - 60) = 2085 à répartir
    expect(body.toAllocate).toBe(2085_00);
    const courses = body.envelopes.find((e: any) => e.id === t.courses.id);
    expect(courses).toMatchObject({ balance: 340_00, allocatedThisMonth: 400_00, spentThisMonth: 60_00, toFundThisMonth: 0 });
    // Dépenses du mois à trier comprises ; le virement vers le livret est mis de côté.
    expect(body.month).toEqual({ start: '2026-03-01', end: '2026-03-31', spent: 75_00, budget: 0, variable: { spent: 75_00, budget: 0 }, saved: 500_00, toFund: 0, income: 0, planned: 0 });
    expect(body.unsortedCount).toBe(1);
    expect(body.latePlanned).toEqual([]);
    // Même date : le solde le plus bas d'abord. Sur 90 jours, trois loyers font plonger le compte à -6 575 € ;
    // l'enveloppe repart de zéro chaque mois, son creux est un loyer.
    expect(body.alerts.map((a: any) => [a.kind, a.firstNegativeDate, a.minBalance])).toEqual([
      ['account', '2026-03-20', -6575_00],
      ['envelope', '2026-03-20', -3000_00],
    ]);
  });
});

describe('prévues en retard', () => {
  it('une prévue n’est à vérifier qu’une fois sortie de la fenêtre de rapprochement', async () => {
    // Le loyer tombe le 20 : le relevé peut encore le confirmer jusqu'au 25.
    t.setToday('2026-03-25');
    expect((await t.call('GET', '/api/overview')).body.latePlanned).toEqual([]);
    t.setToday('2026-03-26');
    const { body } = await t.call('GET', '/api/overview');
    expect(body.latePlanned.map((p: any) => [p.label, p.date, p.amount])).toEqual([['Loyer', '2026-03-20', 3000_00]]);
  });
});

describe('budget mensuel et épargne', () => {
  it('le résumé du mois sépare consommation et épargne, et compte ce qu’il reste à répartir', async () => {
    await t.call('PATCH', `/api/envelopes/${t.courses.id}`, { monthlyTarget: 500_00 });
    await t.call('PATCH', `/api/envelopes/${t.loisirs.id}`, { monthlyTarget: 100_00, isSavings: true });
    await t.call('POST', '/api/transactions', { kind: 'expense', date: '2026-03-05', amount: 40_00, label: 'PEA', accountId: t.courant.id, envelopeId: t.loisirs.id });
    const { body } = await t.call('GET', '/api/overview');
    expect(body.envelopes.find((e: any) => e.id === t.courses.id).toFundThisMonth).toBe(100_00);
    expect(body.month).toMatchObject({ spent: 75_00, budget: 500_00, variable: { spent: 75_00, budget: 500_00 }, saved: 540_00, toFund: 200_00 });

    const spending = await t.call('GET', '/api/reports/spending');
    expect(spending.body.byEnvelope.map((e: any) => e.name)).toEqual(['Courses', 'À ranger']);
    // Le budget d'épargne n'est pas un budget de dépenses.
    expect(spending.body.monthlyBudget).toBe(500_00);
  });

  it('les dépenses courantes excluent les enveloppes portées par une charge fixe', async () => {
    await t.call('PATCH', `/api/envelopes/${t.courses.id}`, { monthlyTarget: 300_00 });
    await t.call('PATCH', `/api/envelopes/${t.loisirs.id}`, { monthlyTarget: 3000_00 });
    await t.call('POST', '/api/transactions', { kind: 'expense', date: '2026-03-08', amount: 900_00, label: 'Loyer payé', accountId: t.courant.id, envelopeId: t.loisirs.id });
    const { body } = await t.call('GET', '/api/overview');
    // Loisirs porte la règle "Loyer" : ses 900 € sont une charge fixe.
    expect(body.month).toMatchObject({ spent: 975_00, budget: 3300_00, variable: { spent: 75_00, budget: 300_00 } });
  });

  it('POST /api/envelopes/fund répartit en une fois', async () => {
    const r = await t.call('POST', '/api/envelopes/fund', {
      items: [
        { envelopeId: t.courses.id, amount: 100_00 },
        { envelopeId: t.loisirs.id, amount: 50_00 },
      ],
    });
    expect(r.status).toBe(201);
    expect(r.body.map((x: any) => [x.kind, x.date, x.amount, x.label])).toEqual([
      ['allocation', '2026-03-10', 100_00, 'Budget mars 2026'],
      ['allocation', '2026-03-10', 50_00, 'Budget mars 2026'],
    ]);
    const { body } = await t.call('GET', '/api/overview');
    expect(body.toAllocate).toBe(1935_00);
  });

  it('POST /api/envelopes/fund refuse tout si une enveloppe est invalide', async () => {
    await t.call('PATCH', `/api/envelopes/${t.loisirs.id}`, { archived: true });
    const r = await t.call('POST', '/api/envelopes/fund', {
      items: [
        { envelopeId: t.courses.id, amount: 100_00 },
        { envelopeId: t.loisirs.id, amount: 50_00 },
      ],
    });
    expect(r.status).toBe(400);
    expect((await t.call('POST', '/api/envelopes/fund', { items: [{ envelopeId: 999, amount: 1 }] })).status).toBe(404);
    expect((await t.call('POST', '/api/envelopes/fund', { items: [] })).status).toBe(400);
    const { body } = await t.call('GET', '/api/overview');
    expect(body.toAllocate).toBe(2085_00);
  });
});

describe('GET /api/forecast', () => {
  it('projette sur l’horizon demandé', async () => {
    const { body } = await t.call('GET', '/api/forecast?horizon=30');
    expect(body.horizonDays).toBe(30);
    expect(body.days).toHaveLength(31);
    expect(body.events.map((e: any) => e.date)).toEqual(['2026-03-20']);
    expect(body.accounts.map((a: any) => a.name)).toEqual(['Courant', 'Livret']);
    expect((await t.call('GET', '/api/forecast?horizon=1')).status).toBe(400);
  });
});

describe('reports', () => {
  it('dépenses par enveloppe sur le mois courant', async () => {
    const { body } = await t.call('GET', '/api/reports/spending');
    expect(body).toMatchObject({ from: '2026-03-01', to: '2026-03-31', total: 75_00, monthlyBudget: 0 });
    expect(body.byEnvelope).toEqual([
      { envelopeId: t.courses.id, name: 'Courses', color: '#4f8a5b', amount: 60_00, monthlyTarget: null },
      { envelopeId: null, name: 'À ranger', color: '#9a9a9a', amount: 15_00, monthlyTarget: null },
    ]);
  });

  it('revenus et dépenses par mois', async () => {
    const { body } = await t.call('GET', '/api/reports/monthly?months=3');
    expect(body).toEqual([
      { month: '2026-01', income: 0, expense: 0, saved: 0 },
      { month: '2026-02', income: 2000_00, expense: 0, saved: 0 },
      { month: '2026-03', income: 0, expense: 75_00, saved: 500_00 },
    ]);
  });

  it('valeur nette passée et projetée', async () => {
    const { body } = await t.call('GET', '/api/reports/net-worth?months=3&horizon=15');
    expect(body.history).toEqual([
      { date: '2026-01-31', value: 1000_00 },
      { date: '2026-02-28', value: 3000_00 },
      { date: '2026-03-10', value: 2925_00 },
    ]);
    expect(body.projection).toHaveLength(16);
    expect(body.projection[0]).toEqual({ date: '2026-03-10', value: 2925_00 });
    expect(body.projection.at(-1)).toEqual({ date: '2026-03-25', value: -75_00 });
  });
});

describe('export', () => {
  it('json complet', async () => {
    const res = await t.app.request('/api/export.json');
    expect(res.headers.get('content-disposition')).toContain('runway-2026-03-10.json');
    const body = (await res.json()) as any;
    expect(body.accounts).toHaveLength(2);
    expect(body.transactions).toHaveLength(5);
    expect(body.recurringRules).toHaveLength(1);
    expect(body.settings.forecastHorizonDays).toBe(90);
  });

  it('csv lisible', async () => {
    const res = await t.app.request('/api/export.csv');
    expect(res.headers.get('content-type')).toContain('text/csv');
    const text = await res.text();
    const lines = text.replace('﻿', '').trim().split('\r\n');
    expect(lines[0]).toBe('date;type;statut;libellé;montant;compte;compte destination;enveloppe;enveloppe source;note');
    expect(lines).toContain('2026-03-02;expense;confirmed;Carrefour;-60,00;Courant;;Courses;;');
    expect(lines).toContain('2026-03-04;transfer;confirmed;Épargne;500,00;Courant;Livret;;;');
  });
});
