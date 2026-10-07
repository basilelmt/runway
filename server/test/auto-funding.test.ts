import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { updateEnvelope } from '../src/repos/envelopes';
import { createTestApp, type TestApp } from './helpers';

const fixture = readFileSync(fileURLToPath(new URL('./fixtures/lbp.csv', import.meta.url)));

let t: TestApp;
beforeEach(() => {
  t = createTestApp('2026-03-12');
  updateEnvelope(t.db, t.courses.id, { monthlyTarget: 300_00 });
  updateEnvelope(t.db, t.loisirs.id, { monthlyTarget: 100_00 });
});

const salaire = (over: Record<string, unknown> = {}) => ({
  name: 'Salaire', kind: 'income', amount: 2000_00, label: 'Salaire', accountId: t.courant.id,
  frequency: 'monthly', dayOfMonth: 10, startDate: '2026-03-01', triggersFunding: true, ...over,
});

async function plannedSalary() {
  const planned = await t.call('GET', '/api/transactions?status=planned');
  return planned.body.find((p: any) => p.kind === 'income');
}

const allocations = async () => (await t.call('GET', '/api/transactions?kind=allocation')).body;

async function confirmSalary(over: Record<string, unknown> = {}) {
  await t.call('POST', '/api/recurring-rules', salaire(over));
  const salary = await plannedSalary();
  await t.call('POST', `/api/transactions/${salary.id}/confirm`);
  return salary;
}

describe('répartition automatique', () => {
  it('confirmer le salaire complète les enveloppes et l’annonce dans la vue d’ensemble', async () => {
    await confirmSalary();
    const allocs = await allocations();
    expect(allocs.map((a: any) => [a.envelopeId, a.amount, a.date, a.label]).sort()).toEqual(
      [[t.courses.id, 300_00, '2026-03-10', 'Budget mars 2026'], [t.loisirs.id, 100_00, '2026-03-10', 'Budget mars 2026']].sort(),
    );
    const overview = await t.call('GET', '/api/overview');
    expect(overview.body.latestFunding).toMatchObject({ month: '2026-03', total: 400_00, envelopeCount: 2, shortfallCount: 0, sourceLabel: 'Salaire' });
  });

  it('une règle non marquée ne déclenche rien', async () => {
    await confirmSalary({ triggersFunding: false });
    expect(await allocations()).toHaveLength(0);
  });

  it('versé pour le mois suivant : allocations datées du 1er du mois d’après', async () => {
    await confirmSalary({ fundsNextMonth: true });
    const allocs = await allocations();
    expect(allocs).toHaveLength(2);
    expect(allocs.every((a: any) => a.date === '2026-04-01' && a.label === 'Budget avril 2026')).toBe(true);
    // Le budget de mars n'est pas touché.
    const overview = await t.call('GET', '/api/overview');
    expect(overview.body.envelopes.find((e: any) => e.id === t.courses.id).toFundThisMonth).toBe(300_00);
  });

  it('manque d’argent : par ordre des enveloppes, incomplètes signalées', async () => {
    // 1 000 € de solde initial + 2 000 € de salaire = 3 000 € disponibles pour 3 050 € de budgets.
    updateEnvelope(t.db, t.courses.id, { monthlyTarget: 2950_00 });
    await confirmSalary();
    const allocs = await allocations();
    expect(allocs.map((a: any) => [a.envelopeId, a.amount]).sort()).toEqual([[t.courses.id, 2950_00], [t.loisirs.id, 50_00]].sort());
    expect((await t.call('GET', '/api/overview')).body.latestFunding).toMatchObject({ shortfallCount: 1 });
  });

  it('import d’un relevé : le salaire rapproché déclenche la répartition', async () => {
    await t.call('POST', '/api/recurring-rules', salaire({ dayOfMonth: 28, startDate: '2026-02-01', fundsNextMonth: true }));
    const form = new FormData();
    form.append('file', new File([fixture], 'export.csv', { type: 'text/csv' }));
    form.append('accountId', String(t.courant.id));
    const p: any = await (await t.app.request('/api/imports/preview', { method: 'POST', body: form })).json();
    expect(p.counts.matched).toBe(1);
    await t.call('POST', '/api/imports/commit', {
      fileName: p.fileName,
      accountId: p.accountId,
      bankAccountNumber: p.bankAccountNumber,
      duplicateCount: p.counts.duplicate,
      rows: p.rows
        .filter((r: any) => r.status !== 'duplicate')
        .map(({ index, date, label, signedAmount, fingerprint, plannedId, envelopeId }: any) => ({ index, date, label, signedAmount, fingerprint, plannedId, envelopeId })),
    });
    const allocs = await allocations();
    expect(allocs).toHaveLength(2);
    expect(allocs.every((a: any) => a.date === '2026-03-01')).toBe(true);
  });

  it('idempotent : un salaire ne répartit qu’une fois', async () => {
    const salary = await confirmSalary();
    await t.call('POST', `/api/transactions/${salary.id}/confirm`);
    expect(await allocations()).toHaveLength(2);
  });

  it('supprimer le salaire supprime sa répartition', async () => {
    const salary = await confirmSalary();
    await t.call('DELETE', `/api/transactions/${salary.id}`);
    expect(await allocations()).toHaveLength(0);
    expect((await t.call('GET', '/api/overview')).body.latestFunding).toBeNull();
  });

  it('annuler rend l’argent et ne répartit plus jamais ce salaire', async () => {
    const salary = await confirmSalary();
    const funding = (await t.call('GET', '/api/overview')).body.latestFunding;
    expect((await t.call('POST', `/api/fundings/${funding.id}/undo`)).status).toBe(204);
    expect(await allocations()).toHaveLength(0);
    const overview = (await t.call('GET', '/api/overview')).body;
    expect(overview.latestFunding).toBeNull();
    expect(overview.toAllocate).toBe(3000_00);
    await t.call('POST', `/api/transactions/${salary.id}/confirm`);
    expect(await allocations()).toHaveLength(0);
    expect((await t.call('POST', `/api/fundings/${funding.id}/undo`)).status).toBe(400);
  });

  it('fermer le bandeau garde les allocations', async () => {
    await confirmSalary();
    const funding = (await t.call('GET', '/api/overview')).body.latestFunding;
    expect((await t.call('POST', `/api/fundings/${funding.id}/dismiss`)).status).toBe(204);
    expect((await t.call('GET', '/api/overview')).body.latestFunding).toBeNull();
    expect(await allocations()).toHaveLength(2);
  });

  it('l’export JSON contient les répartitions', async () => {
    await confirmSalary();
    const exported = await t.call('GET', '/api/export.json');
    expect(exported.body.fundings).toHaveLength(1);
  });
});
