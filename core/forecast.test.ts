import { beforeEach, describe, expect, it } from 'vitest';
import { forecast } from './forecast';
import { account, envelope, resetIds, rule, tx } from './test-fixtures';

describe('forecast', () => {
  beforeEach(resetIds);

  it('détecte le jour où un compte passe dans le rouge', () => {
    const courant = account({ name: 'Courant', initialBalance: 500_00 });
    const loyer = rule({ kind: 'expense', amount: 800_00, label: 'Loyer', accountId: courant.id, frequency: 'monthly', dayOfMonth: 5, startDate: '2026-01-01', lastGeneratedDate: '2026-03-05' });
    const salaire = rule({ kind: 'income', amount: 2000_00, label: 'Salaire', accountId: courant.id, frequency: 'monthly', dayOfMonth: 28, startDate: '2026-01-01', lastGeneratedDate: '2026-03-28' });
    const r = forecast({ accounts: [courant], envelopes: [], transactions: [] }, [loyer, salaire], '2026-03-30', 90);

    expect(r.alerts).toHaveLength(1);
    expect(r.alerts[0]).toMatchObject({
      kind: 'account',
      id: courant.id,
      name: 'Courant',
      firstNegativeDate: '2026-04-05',
      daysUntil: 6,
      minBalance: -300_00,
      minBalanceDate: '2026-04-05',
    });
    expect(r.days[0]?.date).toBe('2026-03-30');
    expect(r.days.at(-1)?.date).toBe('2026-06-28');
    const apr5 = r.days.find((d) => d.date === '2026-04-05');
    expect(apr5?.accounts[courant.id]).toBe(-300_00);
    const apr28 = r.days.find((d) => d.date === '2026-04-28');
    expect(apr28?.accounts[courant.id]).toBe(1700_00);
  });

  it('détecte une enveloppe qui se vide', () => {
    const courant = account({ name: 'Courant', initialBalance: 1000_00 });
    const courses = envelope({ name: 'Courses' });
    const hebdo = rule({ kind: 'expense', amount: 60_00, accountId: courant.id, envelopeId: courses.id, frequency: 'weekly', startDate: '2026-03-02', lastGeneratedDate: '2026-03-09' });
    const r = forecast(
      { accounts: [courant], envelopes: [courses], transactions: [tx({ kind: 'allocation', amount: 100_00, envelopeId: courses.id })] },
      [hebdo],
      '2026-03-10',
      30,
    );
    const alert = r.alerts.find((a) => a.kind === 'envelope');
    expect(alert).toMatchObject({ id: courses.id, firstNegativeDate: '2026-03-23', minBalance: -140_00 });
    expect(r.alerts.find((a) => a.kind === 'account')).toBeUndefined();
  });

  it('compte le budget mensuel : le reste du mois aujourd’hui, puis le budget complet chaque 1er', () => {
    const courant = account({ name: 'Courant', initialBalance: 5000_00 });
    const logement = envelope({ name: 'Logement', monthlyTarget: 800_00 });
    const loyer = rule({ kind: 'expense', amount: 800_00, accountId: courant.id, envelopeId: logement.id, frequency: 'monthly', dayOfMonth: 5, startDate: '2026-01-01', lastGeneratedDate: '2026-03-05' });
    const dejaReparti = tx({ kind: 'allocation', amount: 300_00, envelopeId: logement.id, date: '2026-03-02' });
    const r = forecast({ accounts: [courant], envelopes: [logement], transactions: [dejaReparti] }, [loyer], '2026-03-10', 60);

    const budget = r.events.filter((e) => e.source === 'budget');
    expect(budget.map((e) => [e.date, e.amount])).toEqual([
      ['2026-03-10', 500_00],
      ['2026-04-01', 800_00],
      ['2026-05-01', 800_00],
    ]);
    expect(budget[0]).toMatchObject({ kind: 'allocation', envelopeId: logement.id, sourceId: logement.id, label: 'Budget Logement' });
    // Le loyer du 5 est couvert par le budget du 1er : pas de fausse alerte.
    expect(r.alerts).toEqual([]);
  });

  it('n’ajoute rien pour une enveloppe sans budget, archivée ou déjà remplie', () => {
    const courant = account({ name: 'Courant', initialBalance: 100_00 });
    const sansBudget = envelope({ name: 'Divers' });
    const archivee = envelope({ name: 'Ancienne', monthlyTarget: 50_00, archived: true });
    const remplie = envelope({ name: 'Courses', monthlyTarget: 200_00 });
    const r = forecast(
      { accounts: [courant], envelopes: [sansBudget, archivee, remplie], transactions: [tx({ kind: 'allocation', amount: 200_00, envelopeId: remplie.id, date: '2026-03-01' })] },
      [],
      '2026-03-10',
      15,
    );
    expect(r.events).toEqual([]);
  });

  it('un mois futur déjà réparti ne prévoit que le reste de son budget', () => {
    const courant = account({ name: 'Courant', initialBalance: 3000_00 });
    const courses = envelope({ name: 'Courses', monthlyTarget: 300_00 });
    const r = forecast(
      { accounts: [courant], envelopes: [courses], transactions: [tx({ kind: 'allocation', amount: 200_00, envelopeId: courses.id, date: '2026-10-01' })] },
      [],
      '2026-09-28',
      48,
    );
    expect(r.events.filter((e) => e.source === 'budget').map((e) => [e.date, e.amount])).toEqual([
      ['2026-09-28', 300_00],
      ['2026-10-01', 100_00],
      ['2026-11-01', 300_00],
    ]);
  });

  it('ne renvoie aucune alerte quand tout reste positif', () => {
    const courant = account({ name: 'Courant', initialBalance: 5000_00 });
    const r = forecast({ accounts: [courant], envelopes: [], transactions: [] }, [], '2026-03-10', 90);
    expect(r.alerts).toEqual([]);
    expect(r.events).toEqual([]);
  });

  it('compte les prévues en base et ne les double pas avec la règle', () => {
    const courant = account({ name: 'Courant', initialBalance: 500_00 });
    const loyer = rule({ kind: 'expense', amount: 800_00, accountId: courant.id, frequency: 'monthly', dayOfMonth: 12, startDate: '2026-01-01', lastGeneratedDate: '2026-03-12' });
    const planned = tx({ kind: 'expense', amount: 800_00, accountId: courant.id, date: '2026-03-12', status: 'planned', recurringRuleId: loyer.id });
    const r = forecast({ accounts: [courant], envelopes: [], transactions: [planned] }, [loyer], '2026-03-10', 40);
    const mar12 = r.days.find((d) => d.date === '2026-03-12');
    expect(mar12?.accounts[courant.id]).toBe(-300_00);
    expect(r.events.filter((e) => e.date === '2026-03-12')).toHaveLength(1);
    expect(r.events.find((e) => e.date === '2026-04-12')?.source).toBe('rule');
  });

  it('les prévues passées non rapprochées sont comptées dès aujourd’hui', () => {
    const courant = account({ name: 'Courant', initialBalance: 100_00 });
    const planned = tx({ kind: 'expense', amount: 150_00, accountId: courant.id, date: '2026-03-01', status: 'planned' });
    const r = forecast({ accounts: [courant], envelopes: [], transactions: [planned] }, [], '2026-03-10', 10);
    expect(r.days[0]?.accounts[courant.id]).toBe(-50_00);
    expect(r.alerts[0]?.firstNegativeDate).toBe('2026-03-10');
  });

  it('un compte déjà négatif aujourd’hui a une alerte à zéro jour', () => {
    const courant = account({ name: 'Courant', initialBalance: -20_00 });
    const r = forecast({ accounts: [courant], envelopes: [], transactions: [] }, [], '2026-03-10', 10);
    expect(r.alerts[0]).toMatchObject({ firstNegativeDate: '2026-03-10', daysUntil: 0, minBalance: -20_00 });
  });

  it('les alertes sont triées par date', () => {
    const a = account({ name: 'A', initialBalance: 10_00 });
    const b = account({ name: 'B', initialBalance: 10_00 });
    const rules = [
      rule({ kind: 'expense', amount: 20_00, accountId: a.id, frequency: 'daily', startDate: '2026-03-20', lastGeneratedDate: '2026-03-10' }),
      rule({ kind: 'expense', amount: 20_00, accountId: b.id, frequency: 'daily', startDate: '2026-03-15', lastGeneratedDate: '2026-03-10' }),
    ];
    const r = forecast({ accounts: [a, b], envelopes: [], transactions: [] }, rules, '2026-03-10', 30);
    expect(r.alerts.map((x) => x.name)).toEqual(['B', 'A']);
  });
});
