import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { fingerprint } from '@core/fingerprint';
import type { ImportPreview } from '@shared/api-types';
import { createTransaction } from '../src/repos/transactions';
import { buildPreview, type Source, type SourceRow } from '../src/services/import';
import { createTestApp, createTestDb, type TestApp, type TestContext } from './helpers';

const fixture = readFileSync(fileURLToPath(new URL('./fixtures/lbp.csv', import.meta.url)));

let t: TestApp;
beforeEach(() => {
  t = createTestApp('2026-03-12');
});

async function preview(accountId?: number): Promise<{ status: number; body: ImportPreview & { fileName: string; error?: string } }> {
  const form = new FormData();
  form.append('file', new File([fixture], 'export.csv', { type: 'text/csv' }));
  if (accountId) form.append('accountId', String(accountId));
  const res = await t.app.request('/api/imports/preview', { method: 'POST', body: form });
  return { status: res.status, body: (await res.json()) as any };
}

function commitBody(p: ImportPreview & { fileName: string }) {
  return {
    fileName: p.fileName,
    accountId: p.accountId,
    bankAccountNumber: p.bankAccountNumber,
    duplicateCount: p.counts.duplicate,
    rows: p.rows
      .filter((r) => r.status !== 'duplicate')
      .map(({ index, date, label, signedAmount, fingerprint, plannedId, envelopeId }) => ({ index, date, label, signedAmount, fingerprint, plannedId, envelopeId })),
  };
}

describe('import', () => {
  it('sans compte connu, l’aperçu ne rattache rien mais renvoie le numéro', async () => {
    const { status, body } = await preview();
    expect(status).toBe(200);
    expect(body.accountId).toBeNull();
    expect(body.bankAccountNumber).toBe('1234567A123');
    expect(body.counts).toEqual({ total: 8, new: 8, duplicate: 0, matched: 0, transfer: 0, internal: 0 });
  });

  it('applique les règles de tri et distingue deux lignes identiques', async () => {
    await t.call('POST', '/api/sorting-rules', { pattern: 'carrefour', envelopeId: t.courses.id });
    const { body } = await preview(t.courant.id);
    expect(body.accountId).toBe(t.courant.id);
    expect(body.rows[0]?.envelopeId).toBe(t.courses.id);
    expect(body.rows[3]?.envelopeId).toBeNull();
    const cafes = body.rows.filter((r) => r.label.includes('CAFE'));
    expect(cafes).toHaveLength(2);
    expect(cafes[0]?.fingerprint).not.toBe(cafes[1]?.fingerprint);
  });

  it('commit puis réimport : tout est doublon, et le compte mémorise le numéro', async () => {
    const first = await preview(t.courant.id);
    const commit = await t.call('POST', '/api/imports/commit', commitBody(first.body));
    expect(commit.status).toBe(201);
    expect(commit.body).toMatchObject({ rowCount: 8, newCount: 8, duplicateCount: 0, matchedCount: 0, accountId: t.courant.id });

    const account = await t.call('GET', `/api/accounts/${t.courant.id}`);
    expect(account.body.bankAccountNumber).toBe('1234567A123');

    const again = await preview();
    expect(again.body.accountId).toBe(t.courant.id);
    expect(again.body.counts).toEqual({ total: 8, new: 0, duplicate: 8, matched: 0, transfer: 0, internal: 0 });

    const txs = await t.call('GET', '/api/transactions');
    expect(txs.body).toHaveLength(8);
    expect(txs.body.every((x: any) => x.importId === commit.body.id)).toBe(true);
    expect(txs.body.find((x: any) => x.label.includes('SALAIRE'))).toMatchObject({ kind: 'income', amount: 2000_00 });
    expect((await t.call('GET', '/api/transactions?unsorted=true')).body).toHaveLength(6);
    expect((await t.call('GET', '/api/imports')).body).toHaveLength(1);
  });

  it('rapproche une prévue et la confirme avec les vraies valeurs', async () => {
    await t.call('POST', '/api/recurring-rules', {
      name: 'Loyer', kind: 'expense', amount: 800_00, label: 'Loyer', accountId: t.courant.id, envelopeId: t.loisirs.id,
      frequency: 'monthly', dayOfMonth: 3, startDate: '2026-03-01',
    });
    const plannedBefore = await t.call('GET', '/api/transactions?status=planned');
    expect(plannedBefore.body).toHaveLength(1);

    const p = await preview(t.courant.id);
    const matched = p.body.rows.find((r) => r.status === 'matched');
    expect(matched).toMatchObject({ label: 'PRELEVEMENT DE AGENCE IMMO LOYER', plannedId: plannedBefore.body[0].id, plannedLabel: 'Loyer', envelopeId: t.loisirs.id });
    expect(p.body.counts.matched).toBe(1);

    await t.call('POST', '/api/imports/commit', commitBody(p.body));
    const loyer = await t.call('GET', `/api/transactions/${plannedBefore.body[0].id}`);
    expect(loyer.body).toMatchObject({ status: 'confirmed', date: '2026-03-05', label: 'PRELEVEMENT DE AGENCE IMMO LOYER', envelopeId: t.loisirs.id });
    expect((await t.call('GET', '/api/transactions?status=planned')).body).toHaveLength(0);
    expect((await t.call('GET', '/api/transactions')).body).toHaveLength(8);
  });

  it('le commit est atomique', async () => {
    const p = await preview(t.courant.id);
    const body = commitBody(p.body);
    body.rows[2]!.plannedId = 9999;
    const res = await t.call('POST', '/api/imports/commit', body);
    expect(res.status).toBe(404);
    expect((await t.call('GET', '/api/transactions')).body).toHaveLength(0);
    expect((await t.call('GET', '/api/imports')).body).toHaveLength(0);
  });

  it('refuse un fichier inconnu ou absent', async () => {
    const form = new FormData();
    form.append('file', new File(['a;b\n1;2\n'], 'x.csv'));
    const res = await t.app.request('/api/imports/preview', { method: 'POST', body: form });
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error).toContain('non reconnu');
    const empty = await t.app.request('/api/imports/preview', { method: 'POST', body: new FormData() });
    expect(empty.status).toBe(400);
  });
});

describe('espaces superflus du libellé et de la note', () => {
  const NOISY_LABEL = 'ACHAT CB CARREFOUR EXPR 03.10.26 CARTE NUMERO                089';
  const COMPACT_LABEL = 'ACHAT CB CARREFOUR EXPR 03.10.26 CARTE NUMERO 089';

  function source(rows: SourceRow[]): Source {
    return { parserId: 'test', bankAccountNumber: null, rows, sections: [], sectionIndex: 0, siblings: [] };
  }

  let ctx: TestContext;
  beforeEach(() => {
    ctx = createTestDb();
  });

  it('compacte les espaces multiples du libellé et de la note à la prévisualisation', () => {
    const rows: SourceRow[] = [{ date: '2026-10-03', label: NOISY_LABEL, signedAmount: -45_56, note: NOISY_LABEL }];
    const preview = buildPreview(ctx.db, source(rows), ctx.courant.id);
    expect(preview.rows[0]).toMatchObject({ label: COMPACT_LABEL, note: COMPACT_LABEL });
  });

  it('une opération déjà enregistrée avec des espaces multiples est reconnue comme doublon réimportée avec un libellé compacté', () => {
    createTransaction(ctx.db, {
      kind: 'expense',
      date: '2026-10-03',
      amount: 45_56,
      label: NOISY_LABEL,
      accountId: ctx.courant.id,
      fingerprint: fingerprint(ctx.courant.id, '2026-10-03', -45_56, NOISY_LABEL, 0),
    });
    const rows: SourceRow[] = [{ date: '2026-10-03', label: COMPACT_LABEL, signedAmount: -45_56, note: null }];
    const preview = buildPreview(ctx.db, source(rows), ctx.courant.id);
    expect(preview.rows[0]!.status).toBe('duplicate');
  });

  it('une opération déjà enregistrée avec un libellé compacté est reconnue comme doublon réimportée avec des espaces multiples', () => {
    createTransaction(ctx.db, {
      kind: 'expense',
      date: '2026-10-03',
      amount: 45_56,
      label: COMPACT_LABEL,
      accountId: ctx.courant.id,
      fingerprint: fingerprint(ctx.courant.id, '2026-10-03', -45_56, COMPACT_LABEL, 0),
    });
    const rows: SourceRow[] = [{ date: '2026-10-03', label: NOISY_LABEL, signedAmount: -45_56, note: null }];
    const preview = buildPreview(ctx.db, source(rows), ctx.courant.id);
    expect(preview.rows[0]!.status).toBe('duplicate');
  });
});
