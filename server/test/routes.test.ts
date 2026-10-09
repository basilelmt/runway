import { beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './helpers';

let t: TestApp;
beforeEach(() => {
  t = createTestApp();
});

describe('accounts', () => {
  it('crée, liste, modifie, archive', async () => {
    const created = await t.call('POST', '/api/accounts', { name: 'Joint', initialBalance: 50_00 });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Joint', initialBalance: 50_00, onBudget: true, archived: false });

    const patched = await t.call('PATCH', `/api/accounts/${created.body.id}`, { archived: true, onBudget: false });
    expect(patched.body).toMatchObject({ archived: true, onBudget: false });

    const list = await t.call('GET', '/api/accounts');
    expect(list.body.map((a: any) => a.name)).toEqual(['Courant', 'Livret']);
    const all = await t.call('GET', '/api/accounts?archived=true');
    expect(all.body).toHaveLength(3);
  });

  it('archiver ne touche pas aux autres champs', async () => {
    const created = await t.call('POST', '/api/accounts', { name: 'Épargne', initialBalance: 500_00, onBudget: false });
    const patched = await t.call('PATCH', `/api/accounts/${created.body.id}`, { archived: true });
    expect(patched.body).toMatchObject({ archived: true, initialBalance: 500_00, onBudget: false });
  });

  it('valide et signale les doublons', async () => {
    expect((await t.call('POST', '/api/accounts', { name: '' })).status).toBe(400);
    const dup = await t.call('POST', '/api/accounts', { name: 'Courant' });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe('Ce nom existe déjà');
    expect((await t.call('GET', '/api/accounts/999')).status).toBe(404);
  });
});

describe('envelopes', () => {
  it('crée avec couleur par défaut et réordonne', async () => {
    const created = await t.call('POST', '/api/envelopes', { name: 'Vacances', monthlyExtra: 100_00 });
    expect(created.body).toMatchObject({ color: '#4f8a5b', monthlyExtra: 100_00, sortOrder: 2 });
    const reordered = await t.call('PUT', '/api/envelopes/reorder', { ids: [created.body.id, t.courses.id, t.loisirs.id] });
    expect(reordered.body.map((e: any) => e.name)).toEqual(['Vacances', 'Courses', 'Loisirs']);
  });

  it('archiver ne touche pas aux autres champs', async () => {
    const created = await t.call('POST', '/api/envelopes', { name: 'Bourse', color: '#3f6fae', isSavings: true });
    expect(created.body).toMatchObject({ isSavings: true });
    const patched = await t.call('PATCH', `/api/envelopes/${created.body.id}`, { archived: true });
    expect(patched.body).toMatchObject({ archived: true, color: '#3f6fae', isSavings: true });
  });

  it('refuse une couleur invalide', async () => {
    const r = await t.call('POST', '/api/envelopes', { name: 'X', color: 'red' });
    expect(r.status).toBe(400);
    expect(r.body.error).toContain('color');
  });
});

describe('transactions', () => {
  it('crée, filtre, confirme et supprime', async () => {
    const dep = await t.call('POST', '/api/transactions', { kind: 'expense', date: '2026-03-02', amount: 30_00, label: 'Carrefour', accountId: t.courant.id });
    expect(dep.status).toBe(201);
    const unsorted = await t.call('GET', '/api/transactions?unsorted=true');
    expect(unsorted.body).toHaveLength(1);

    const upd = await t.call('PUT', `/api/transactions/${dep.body.id}`, { ...dep.body, envelopeId: t.courses.id });
    expect(upd.body.envelopeId).toBe(t.courses.id);
    expect((await t.call('GET', '/api/transactions?unsorted=true')).body).toHaveLength(0);

    expect((await t.call('DELETE', `/api/transactions/${dep.body.id}`)).status).toBe(204);
    expect((await t.call('DELETE', `/api/transactions/${dep.body.id}`)).status).toBe(404);
  });

  it('refuse un transfert vers le même compte avec un message ciblé', async () => {
    const r = await t.call('POST', '/api/transactions', { kind: 'transfer', date: '2026-03-02', amount: 1, label: 'x', accountId: t.courant.id, toAccountId: t.courant.id });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('toAccountId : Les deux comptes doivent être différents');
  });

  it('refuse un compte inexistant', async () => {
    const r = await t.call('POST', '/api/transactions', { kind: 'income', date: '2026-03-02', amount: 1, label: 'x', accountId: 999 });
    expect(r.status).toBe(409);
  });
});

describe('recurring rules', () => {
  const loyer = () => ({
    name: 'Loyer', kind: 'expense', amount: 800_00, label: 'Loyer', accountId: t.courant.id, envelopeId: t.courses.id,
    frequency: 'monthly', dayOfMonth: 5, startDate: '2026-01-01',
  });

  it('crée et matérialise à la requête suivante, avec prochaine occurrence', async () => {
    const created = await t.call('POST', '/api/recurring-rules', loyer());
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ interval: 1, active: true, nextDate: '2026-04-05', monthlyEquivalent: 800_00 });

    const planned = await t.call('GET', '/api/transactions?status=planned');
    expect(planned.body.map((x: any) => x.date)).toEqual(['2026-03-05', '2026-02-05', '2026-01-05']);

    const confirmed = await t.call('POST', `/api/transactions/${planned.body[0].id}/confirm`);
    expect(confirmed.body.status).toBe('confirmed');

    const paused = await t.call('PATCH', `/api/recurring-rules/${created.body.id}/active`, { active: false });
    expect(paused.body).toMatchObject({ active: false, nextDate: null });

    expect((await t.call('DELETE', `/api/recurring-rules/${created.body.id}`)).status).toBe(204);
    expect((await t.call('GET', '/api/recurring-rules')).body).toEqual([]);
  });

  const salaire = (over: Record<string, unknown> = {}) => ({
    name: 'Salaire', kind: 'income', amount: 2000_00, label: 'VIR SALAIRE', accountId: t.courant.id,
    frequency: 'monthly', dayOfMonth: 28, startDate: '2026-03-01', ...over,
  });

  it('mémorise le déclenchement de la répartition sur un revenu', async () => {
    const r = await t.call('POST', '/api/recurring-rules', salaire({ triggersFunding: true, fundsNextMonth: true }));
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ triggersFunding: true, fundsNextMonth: true });
    const plain = await t.call('POST', '/api/recurring-rules', salaire({ name: 'Prime' }));
    expect(plain.body).toMatchObject({ triggersFunding: false, fundsNextMonth: false });
  });

  it('refuse le déclenchement hors revenu ou le mois suivant sans déclenchement', async () => {
    const expense = await t.call('POST', '/api/recurring-rules', salaire({ kind: 'expense', triggersFunding: true }));
    expect(expense.status).toBe(400);
    const orphan = await t.call('POST', '/api/recurring-rules', salaire({ fundsNextMonth: true }));
    expect(orphan.status).toBe(400);
  });

  it('exige un jour du mois pour une règle mensuelle', async () => {
    const r = await t.call('POST', '/api/recurring-rules', { ...loyer(), dayOfMonth: undefined });
    expect(r.status).toBe(400);
    expect(r.body.error).toContain('dayOfMonth');
  });
});

describe('sorting rules', () => {
  it('crée, teste et réordonne', async () => {
    const a = await t.call('POST', '/api/sorting-rules', { pattern: 'carrefour', envelopeId: t.courses.id });
    const b = await t.call('POST', '/api/sorting-rules', { pattern: 'carrefour market', envelopeId: t.loisirs.id });
    expect((await t.call('POST', '/api/sorting-rules/test', { label: 'CB CARREFOUR MARKET' })).body.envelopeId).toBe(t.courses.id);
    await t.call('PUT', '/api/sorting-rules/reorder', { ids: [b.body.id, a.body.id] });
    expect((await t.call('POST', '/api/sorting-rules/test', { label: 'CB CARREFOUR MARKET' })).body.envelopeId).toBe(t.loisirs.id);
    expect((await t.call('POST', '/api/sorting-rules/test', { label: 'VIR SALAIRE' })).body.envelopeId).toBeNull();
  });
});

describe('sorting rules apply', () => {
  it('range les opérations à trier qui correspondent', async () => {
    await t.call('POST', '/api/transactions', { kind: 'expense', date: '2026-03-02', amount: 30_00, label: 'CB CARREFOUR', accountId: t.courant.id });
    await t.call('POST', '/api/transactions', { kind: 'expense', date: '2026-03-02', amount: 5_00, label: 'INCONNU', accountId: t.courant.id });
    await t.call('POST', '/api/sorting-rules', { pattern: 'carrefour', envelopeId: t.courses.id });
    expect((await t.call('POST', '/api/sorting-rules/apply')).body).toEqual({ assigned: 1 });
    expect((await t.call('GET', '/api/transactions?unsorted=true')).body.map((x: any) => x.label)).toEqual(['INCONNU']);
    expect((await t.call('POST', '/api/sorting-rules/apply')).body).toEqual({ assigned: 0 });
  });
});

describe('settings', () => {
  it('lit les valeurs par défaut et enregistre', async () => {
    expect((await t.call('GET', '/api/settings')).body).toEqual({ forecastHorizonDays: 90, claudeModel: '', enableBankingAppId: '', enableBankingPrivateKey: '' });
    const r = await t.call('PUT', '/api/settings', { forecastHorizonDays: 60, claudeModel: 'haiku', enableBankingAppId: 'app-1', enableBankingPrivateKey: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----' });
    expect(r.body).toMatchObject({ forecastHorizonDays: 60, claudeModel: 'haiku', enableBankingAppId: 'app-1' });
    expect((await t.call('PUT', '/api/settings', { forecastHorizonDays: 1 })).status).toBe(400);
  });

  it("l'export JSON ne contient pas la clé privée", async () => {
    await t.call('PUT', '/api/settings', { forecastHorizonDays: 90, claudeModel: '', enableBankingAppId: 'app-1', enableBankingPrivateKey: 'SECRET' });
    const res = await t.app.request('/api/export.json');
    const body = (await res.json()) as { settings: { enableBankingPrivateKey: string; enableBankingAppId: string } };
    expect(body.settings.enableBankingAppId).toBe('app-1');
    expect(body.settings.enableBankingPrivateKey).toBe('');
  });
});

describe('erreurs', () => {
  it('404 JSON pour une route inconnue', async () => {
    const r = await t.call('GET', '/api/nope');
    expect(r.status).toBe(404);
    expect(r.body.code).toBe('not_found');
  });
});
