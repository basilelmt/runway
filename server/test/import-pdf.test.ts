import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ImportPreview } from '@shared/api-types';
import { createApp } from '../src/app';
import { updateAccount } from '../src/repos/accounts';
import { createTestDb, type TestContext } from './helpers';

const statementText = readFileSync(fileURLToPath(new URL('./fixtures/lbp-statement.txt', import.meta.url)), 'utf8');
const fakePdf = Buffer.from('%PDF-1.4 faux relevé');

let ctx: TestContext;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  ctx = createTestDb();
  app = createApp({ db: ctx.db, now: () => '2025-01-10', importDeps: { extractPdfText: async () => statementText } });
});

async function preview(extra: Record<string, string> = {}): Promise<ImportPreview & { fileName: string }> {
  const form = new FormData();
  form.append('file', new File([fakePdf], 'releve-2025-01.pdf', { type: 'application/pdf' }));
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  const res = await app.request('/api/imports/preview', { method: 'POST', body: form });
  expect(res.status).toBe(200);
  return (await res.json()) as ImportPreview & { fileName: string };
}

async function commit(p: ImportPreview & { fileName: string }) {
  const body = {
    fileName: p.fileName,
    accountId: p.accountId,
    bankAccountNumber: p.bankAccountNumber,
    duplicateCount: p.counts.duplicate + p.counts.internal,
    rows: p.rows
      .filter((r) => r.status === 'new' || r.status === 'matched' || r.status === 'transfer')
      .map(({ index, date, label, signedAmount, fingerprint, plannedId, envelopeId, note, transferToAccountId }) => ({ index, date, label, signedAmount, fingerprint, plannedId, envelopeId, note, transferToAccountId })),
  };
  const res = await app.request('/api/imports/commit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  expect(res.status).toBe(201);
  return (await res.json()) as { newCount: number };
}

describe('import PDF', () => {
  it('liste les sections et affiche la première par défaut', async () => {
    const p = await preview();
    expect(p.parserId).toBe('lbp-pdf');
    expect(p.sections.map((s) => [s.accountName, s.bankAccountNumber, s.accountId, s.rowCount])).toEqual([
      ['Compte courant', '1234567K890', null, 8],
      ['Livret A', '9998888777V', null, 2],
    ]);
    expect(p.sectionIndex).toBe(0);
    expect(p.accountId).toBeNull();
    expect(p.rows[0]).toMatchObject({ date: '2024-12-09', label: 'ACHAT CB CARREFOUR CITY', signedAmount: -4_86, status: 'new' });
    expect(p.rows[0]?.note).toContain('CARTE NUMERO 844');
  });

  it('retrouve la section du compte connu et reconnaît un virement interne dans les deux sens', async () => {
    updateAccount(ctx.db, ctx.courant.id, { bankAccountNumber: '1234567K890' });
    updateAccount(ctx.db, ctx.livret.id, { bankAccountNumber: '9998888777V' });

    // Côté Livret A : le débit vers l'IBAN du CCP devient un transfert.
    const livret = await preview({ accountId: String(ctx.livret.id) });
    expect(livret.sectionIndex).toBe(1);
    expect(livret.accountId).toBe(ctx.livret.id);
    const transfer = livret.rows.find((r) => r.status === 'transfer');
    expect(transfer).toMatchObject({ date: '2024-12-21', signedAmount: -200_00, transferToAccountId: ctx.courant.id });
    expect(livret.counts.transfer).toBe(1);
    expect((await commit(livret)).newCount).toBe(2);

    const txRes = await app.request(`/api/transactions?account=${ctx.livret.id}`);
    const txs = (await txRes.json()) as { kind: string; label: string; note: string | null }[];
    expect(txs.find((t) => t.kind === 'transfer')).toMatchObject({ label: 'Virement Livret → Courant' });

    // Côté CCP : le crédit correspondant est reconnu comme déjà saisi.
    const ccp = await preview({ section: '0' });
    expect(ccp.accountId).toBe(ctx.courant.id);
    const internal = ccp.rows.find((r) => r.status === 'internal');
    expect(internal).toMatchObject({ date: '2024-12-23', signedAmount: 200_00 });
    expect(ccp.counts).toMatchObject({ new: 7, internal: 1 });
    expect((await commit(ccp)).newCount).toBe(7);

    const overview = (await (await app.request('/api/overview')).json()) as { accounts: { id: number; balance: number }[] };
    // Courant : 1000 + opérations du relevé (-4,86 -15,67 -20 +45 -96,30 -10,80 +112,60) + 200 reçus = 1 209,97
    expect(overview.accounts.find((a) => a.id === ctx.courant.id)?.balance).toBe(1209_97);
    // Livret : 0 - 200 + 208,01
    expect(overview.accounts.find((a) => a.id === ctx.livret.id)?.balance).toBe(8_01);
  });

  it('un réimport ne crée rien', async () => {
    updateAccount(ctx.db, ctx.courant.id, { bankAccountNumber: '1234567K890' });
    await commit(await preview());
    const again = await preview();
    expect(again.counts).toMatchObject({ duplicate: 8, new: 0 });
  });
});
