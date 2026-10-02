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
  it('assemble soldes, alertes et compteurs', async () => {
    const { status, body } = await t.call('GET', '/api/overview');
    expect(status).toBe(200);
    // 1000 + 2000 - 60 - 15 - 500 = 2425 sur le courant ; 500 sur le livret (hors budget)
    expect(body.accounts.find((a: any) => a.id === t.courant.id).balance).toBe(2425_00);
    expect(body.netWorth).toBe(2925_00);
    // 2425 - (400 - 60) = 2085 à répartir
    expect(body.toAllocate).toBe(2085_00);
    const courses = body.envelopes.find((e: any) => e.id === t.courses.id);
    expect(courses).toMatchObject({ balance: 340_00, allocatedThisMonth: 400_00, spentThisMonth: 60_00 });
    expect(body.unsortedCount).toBe(1);
    expect(body.plannedCount).toBe(0);
    // Même date : le solde le plus bas d'abord (sur 90 jours, trois loyers : l'enveloppe plonge à -9 000 €, le compte à -6 575 €).
    expect(body.alerts.map((a: any) => [a.kind, a.firstNegativeDate, a.minBalance])).toEqual([
      ['envelope', '2026-03-20', -9000_00],
      ['account', '2026-03-20', -6575_00],
    ]);
    expect(body.netWorthSparkline).toHaveLength(6);
    expect(body.netWorthSparkline.at(-1)).toEqual({ date: '2026-03-10', value: 2925_00 });
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
    expect(body).toMatchObject({ from: '2026-03-01', to: '2026-03-31', total: 75_00 });
    expect(body.byEnvelope).toEqual([
      { envelopeId: t.courses.id, name: 'Courses', color: '#4f8a5b', amount: 60_00 },
      { envelopeId: null, name: 'À trier', color: '#9a9a9a', amount: 15_00 },
    ]);
  });

  it('revenus et dépenses par mois', async () => {
    const { body } = await t.call('GET', '/api/reports/monthly?months=3');
    expect(body).toEqual([
      { month: '2026-01', income: 0, expense: 0 },
      { month: '2026-02', income: 2000_00, expense: 0 },
      { month: '2026-03', income: 0, expense: 75_00 },
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
