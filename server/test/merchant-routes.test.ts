import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Exec, ExecResult } from '../src/services/claude';
import { createTestApp, type TestApp } from './helpers';

const fixture = readFileSync(fileURLToPath(new URL('./fixtures/lbp.csv', import.meta.url)));

let t: TestApp;
beforeEach(() => {
  t = createTestApp('2026-03-12');
});

const expense = (label: string) => t.call('POST', '/api/transactions', { kind: 'expense', date: '2026-03-02', amount: 10_00, label, accountId: t.courant.id });
const path = (key: string) => `/api/merchants/${encodeURIComponent(key)}`;

function ok(structured: unknown): ExecResult {
  return { stdout: JSON.stringify({ is_error: false, result: 'ok', structured_output: structured }), stderr: '', exitCode: 0 };
}

describe('routes /api/merchants', () => {
  it('statut, détail et renommage par l’utilisateur', async () => {
    await expense('ACHAT CB CAFE DU PORT 03.10.26');
    await expense('ACHAT CB CAFE DU PORT');
    expect((await t.call('GET', '/api/merchants/status')).body).toEqual({ total: 1, named: 0, running: false, lastError: null });
    expect((await t.call('GET', path('CAFE DU PORT'))).body).toEqual({ key: 'CAFE DU PORT', name: 'Cafe du Port', source: null, transactionCount: 2 });

    const renamed = await t.call('PUT', path('CAFE DU PORT'), { name: '  Café du Port  ' });
    expect(renamed.body).toEqual({ key: 'CAFE DU PORT', name: 'Café du Port', source: 'user', transactionCount: 2 });
    expect((await t.call('GET', '/api/transactions')).body.map((x: any) => x.merchantName)).toEqual(['Café du Port', 'Café du Port']);
    expect((await t.call('GET', '/api/merchants/status')).body).toMatchObject({ total: 1, named: 1 });
  });

  it('un nom vide remet le marchand à nommer par Claude et relance le nommage', async () => {
    await expense('ACHAT CB CAFE DU PORT');
    await t.call('PUT', path('CAFE DU PORT'), { name: 'Café du Port' });
    const request = vi.spyOn(t.merchantNamer, 'request');
    const reset = await t.call('PUT', path('CAFE DU PORT'), { name: '' });
    expect(reset.body).toEqual({ key: 'CAFE DU PORT', name: 'Cafe du Port', source: null, transactionCount: 1 });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('refuse une clé inconnue et un nom trop long', async () => {
    const unknown = await t.call('PUT', path('INCONNU'), { name: 'Inconnu' });
    expect(unknown.status).toBe(404);
    expect(unknown.body.error).toBe('Marchand introuvable');
    await expense('ACHAT CB CAFE DU PORT');
    expect((await t.call('PUT', path('CAFE DU PORT'), { name: 'x'.repeat(61) })).status).toBe(400);
  });

  it('accepte une clé qui contient une barre oblique', async () => {
    await expense('ACHAT CB APPLE.COM/BILL APPLE PAY');
    expect((await t.call('GET', path('APPLE.COM/BILL'))).body).toMatchObject({ key: 'APPLE.COM/BILL', name: 'Apple.com/Bill', transactionCount: 1 });
  });

  it('POST /name lance le nommage en tâche de fond et répond tout de suite', async () => {
    const exec = vi.fn<Exec>(async () => ok({ names: [{ key: 'CAFE DU PORT', name: 'Café du Port' }] }));
    t = createTestApp('2026-03-12', { exec });
    await expense('ACHAT CB CAFE DU PORT');

    const started = await t.call('POST', '/api/merchants/name');
    expect(started.body).toEqual({ total: 1, named: 0, running: true, lastError: null });
    await t.merchantNamer.idle();
    expect((await t.call('GET', '/api/merchants/status')).body).toEqual({ total: 1, named: 1, running: false, lastError: null });
    expect((await t.call('GET', '/api/transactions')).body[0].merchantName).toBe('Café du Port');
  });

  it('confirmer un import relance le nommage', async () => {
    const request = vi.spyOn(t.merchantNamer, 'request');
    const form = new FormData();
    form.append('file', new File([fixture], 'export.csv', { type: 'text/csv' }));
    form.append('accountId', String(t.courant.id));
    const preview = (await (await t.app.request('/api/imports/preview', { method: 'POST', body: form })).json()) as any;
    const commit = await t.call('POST', '/api/imports/commit', {
      fileName: preview.fileName,
      accountId: preview.accountId,
      duplicateCount: 0,
      rows: preview.rows.map(({ index, date, label, signedAmount, fingerprint, plannedId, envelopeId }: any) => ({ index, date, label, signedAmount, fingerprint, plannedId, envelopeId })),
    });
    expect(commit.status).toBe(201);
    expect(request).toHaveBeenCalledTimes(1);
    expect((await t.call('GET', '/api/transactions')).body.map((x: any) => x.merchantKey)).toContain('CARREFOUR MARKET');
  });

  it('l’export JSON contient les marchands', async () => {
    await expense('ACHAT CB CAFE DU PORT');
    const body = (await (await t.app.request('/api/export.json')).json()) as any;
    expect(body.merchants).toEqual([{ key: 'CAFE DU PORT', name: null, source: null, updatedAt: expect.any(String) }]);
    expect(body.transactions[0]).toMatchObject({ merchantKey: 'CAFE DU PORT', merchantName: 'Cafe du Port' });
  });
});
