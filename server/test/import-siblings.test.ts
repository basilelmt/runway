import { beforeEach, describe, expect, it } from 'vitest';
import type { ImportPreviewRow } from '@shared/api-types';
import type { ISODate } from '@shared/dates';
import { createAccount } from '../src/repos/accounts';
import { buildPreview, markClaimedCounterparts, type Sibling, type Source, type SourceRow } from '../src/services/import';
import { createTransaction } from '../src/repos/transactions';
import { createTestDb, type TestContext } from './helpers';

/** IBAN valides (somme de contrôle ISO 13616 juste). */
const LIVRET_IBAN = 'FR3520041010121234567K03022';
const THIRD_PARTY_IBAN = 'FR7630006000011234567890189';

function row(date: ISODate, label: string, signedAmount: number, note: string | null = null): SourceRow {
  return { date, label, signedAmount, note };
}

function source(rows: SourceRow[], siblings: Sibling[]): Source {
  return { parserId: 'test', bankAccountNumber: null, rows, sections: [], sectionIndex: 0, siblings };
}

describe('virements internes entre comptes du même lot', () => {
  let ctx: TestContext;
  let livret: Sibling;

  beforeEach(() => {
    ctx = createTestDb();
    livret = { accountId: ctx.livret.id, iban: LIVRET_IBAN, rows: [{ date: '2026-10-05', signedAmount: 200_00 }] };
  });

  it('sans IBAN, un seul compte frère portant la contrepartie devient la cible', () => {
    const preview = buildPreview(ctx.db, source([row('2026-10-04', 'VIREMENT EPARGNE', -200_00)], [livret]), ctx.courant.id);
    expect(preview.rows[0]).toMatchObject({ status: 'transfer', transferToAccountId: ctx.livret.id });
  });

  it('une longue référence SEPA sans IBAN ne bloque pas la contrepartie unique', () => {
    const preview = buildPreview(ctx.db, source([row('2026-10-04', 'VIREMENT REF 2026100412345678 LOYER', -200_00, 'VIR SEPA 0410 LOYER OCTOBRE')], [livret]), ctx.courant.id);
    expect(preview.rows[0]).toMatchObject({ status: 'transfer', transferToAccountId: ctx.livret.id });
  });

  it('un IBAN valide étranger aux comptes frères laisse la ligne nouvelle', () => {
    const preview = buildPreview(ctx.db, source([row('2026-10-04', 'VIREMENT', -200_00, `POUR M DUPONT ${THIRD_PARTY_IBAN}`)], [livret]), ctx.courant.id);
    expect(preview.rows[0]).toMatchObject({ status: 'new', transferToAccountId: null });
  });

  it("l'IBAN cité désigne le compte frère même si un autre porte aussi la contrepartie", () => {
    const pel = createAccount(ctx.db, { name: 'PEL', initialBalance: 0, onBudget: false });
    const other: Sibling = { accountId: pel.id, iban: null, rows: [{ date: '2026-10-04', signedAmount: 200_00 }] };
    const preview = buildPreview(ctx.db, source([row('2026-10-04', 'VIREMENT VERS FR35 2004 1010 1212 3456 7K03 022', -200_00)], [other, livret]), ctx.courant.id);
    expect(preview.rows[0]).toMatchObject({ status: 'transfer', transferToAccountId: ctx.livret.id });
  });

  it('sans IBAN, deux comptes frères portant la contrepartie laissent la ligne nouvelle', () => {
    const pel = createAccount(ctx.db, { name: 'PEL', initialBalance: 0, onBudget: false });
    const other: Sibling = { accountId: pel.id, iban: null, rows: [{ date: '2026-10-04', signedAmount: 200_00 }] };
    const preview = buildPreview(ctx.db, source([row('2026-10-04', 'VIREMENT EPARGNE', -200_00)], [other, livret]), ctx.courant.id);
    expect(preview.rows[0]).toMatchObject({ status: 'new', transferToAccountId: null });
  });

  it('une contrepartie ne sert qu’à un seul débit', () => {
    const rows = [row('2026-10-04', 'VIREMENT EPARGNE', -200_00), row('2026-10-04', 'VIREMENT EPARGNE', -200_00)];
    const preview = buildPreview(ctx.db, source(rows, [livret]), ctx.courant.id);
    expect(preview.rows.map((r) => r.status)).toEqual(['transfer', 'new']);
  });

  it('libellé abrégé « VIR SEPA » (API) : reconnu comme virement, côté débit et côté crédit', () => {
    const preview = buildPreview(ctx.db, source([row('2026-10-04', 'VIR SEPA M LAMOTTE EPARGNE', -200_00)], [livret]), ctx.courant.id);
    expect(preview.rows[0]).toMatchObject({ status: 'transfer', transferToAccountId: ctx.livret.id });
    createTransaction(ctx.db, { kind: 'transfer', date: '2026-10-04', amount: 200_00, label: 'Virement', accountId: ctx.courant.id, toAccountId: ctx.livret.id });
    const credit = buildPreview(ctx.db, source([row('2026-10-05', 'VIR SEPA DE M LAMOTTE', 200_00)], []), ctx.livret.id);
    expect(credit.rows[0]!.status).toBe('internal');
  });

  it('un mot qui commence par VIR n’est pas un virement', () => {
    const preview = buildPreview(ctx.db, source([row('2026-10-04', 'CARTE VIRGIN MOBILE', -200_00)], [livret]), ctx.courant.id);
    expect(preview.rows[0]).toMatchObject({ status: 'new', transferToAccountId: null });
  });
});

describe('markClaimedCounterparts', () => {
  const previewRow = (index: number, date: ISODate, signedAmount: number, status: ImportPreviewRow['status'], transferToAccountId: number | null = null): ImportPreviewRow => ({
    index,
    date,
    label: 'VIREMENT',
    signedAmount,
    status,
    fingerprint: `f${index}`,
    plannedId: null,
    plannedLabel: null,
    envelopeId: null,
    note: null,
    transferToAccountId,
  });

  it('marque internal la contrepartie de chaque transfert, une seule fois, dans la tolérance de 4 jours', () => {
    const courant = { accountId: 1, rows: [previewRow(0, '2026-10-01', -100_00, 'transfer', 2), previewRow(1, '2026-10-01', -100_00, 'transfer', 2)] };
    const livret = { accountId: 2, rows: [previewRow(0, '2026-10-10', 100_00, 'new'), previewRow(1, '2026-10-02', 100_00, 'duplicate'), previewRow(2, '2026-10-03', 100_00, 'new')] };
    markClaimedCounterparts([livret, courant]);
    expect(livret.rows.map((r) => r.status)).toEqual(['new', 'duplicate', 'internal']);
  });
});
