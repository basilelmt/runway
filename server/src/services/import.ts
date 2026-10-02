import { fingerprint } from '@core/fingerprint';
import { matchPlanned } from '@core/matching';
import { applySortingRules } from '@core/sorting';
import type { ImportCommitInput, ImportPreview, ImportPreviewRow, ImportSection } from '@shared/api-types';
import { addDays, daysBetween, type ISODate } from '@shared/dates';
import type { ImportRecord } from '@shared/schemas';
import type { Db } from '../db/client';
import { BadRequestError } from '../errors';
import { detectParser } from '../parsers';
import { extractPdfText as defaultExtractPdfText, isPdf, parseLbpStatementText, type StatementSection } from '../parsers/lbp-pdf';
import { findAccountByBankNumber, getAccount, updateAccount } from '../repos/accounts';
import { createImport } from '../repos/imports';
import { listSortingRules } from '../repos/sorting-rules';
import { createTransaction, findByFingerprints, findTransfersTo, getTransaction, listPlanned, updateTransaction } from '../repos/transactions';

export type ImportDeps = { extractPdfText?: (buffer: Buffer) => Promise<string> };

type SourceRow = { date: ISODate; label: string; signedAmount: number; note: string | null; raw: string };

type Source = {
  parserId: string;
  bankAccountNumber: string | null;
  rows: SourceRow[];
  sections: ImportSection[];
  sectionIndex: number;
  /** Sections d'un PDF, pour reconnaître les virements entre comptes propres. */
  pdfSections: StatementSection[];
};

const TRANSFER_TOLERANCE_DAYS = 4;

async function readSource(db: Db, input: { buffer: Buffer; accountId: number | null; section: number | null }, deps: ImportDeps): Promise<Source> {
  if (isPdf(input.buffer)) {
    const text = await (deps.extractPdfText ?? defaultExtractPdfText)(input.buffer);
    const { sections } = parseLbpStatementText(text);
    const meta: ImportSection[] = sections.map((s, index) => ({
      index,
      accountName: s.accountName,
      bankAccountNumber: s.bankAccountNumber,
      accountId: findAccountByBankNumber(db, s.bankAccountNumber)?.id ?? null,
      rowCount: s.rows.length,
    }));
    let sectionIndex = input.section ?? -1;
    if (sectionIndex < 0 && input.accountId != null) {
      const number = getAccount(db, input.accountId).bankAccountNumber;
      sectionIndex = meta.findIndex((m) => number !== null && m.bankAccountNumber === number);
    }
    if (sectionIndex < 0) sectionIndex = 0;
    const section = sections[sectionIndex];
    if (!section) throw new BadRequestError('Section de relevé introuvable');
    return {
      parserId: 'lbp-pdf',
      bankAccountNumber: section.bankAccountNumber,
      rows: section.rows.map((r) => ({ date: r.date, label: r.label, signedAmount: r.signedAmount, note: r.raw, raw: r.raw })),
      sections: meta,
      sectionIndex,
      pdfSections: sections,
    };
  }

  const parser = detectParser(input.buffer);
  if (!parser) throw new BadRequestError('Format de fichier non reconnu (export CSV ou relevé PDF La Banque Postale attendu)');
  const statement = parser.parse(input.buffer);
  return {
    parserId: parser.id,
    bankAccountNumber: statement.bankAccountNumber,
    rows: statement.rows.map((r) => ({ ...r, note: null, raw: r.label })),
    sections: [],
    sectionIndex: 0,
    pdfSections: [],
  };
}

/**
 * Virements entre comptes propres dans un relevé PDF : un débit qui cite l'IBAN d'une autre section,
 * avec un crédit du même montant à ±4 jours dans cette section, devient un transfert vers ce compte.
 */
function detectInternalTransfers(db: Db, source: Source, rows: ImportPreviewRow[]): void {
  const current = source.pdfSections[source.sectionIndex];
  if (!current) return;
  const others = source.pdfSections.filter((s) => s !== current && s.iban);
  for (const row of rows) {
    if (row.status !== 'new' || row.signedAmount >= 0 || !/VIREMENT/i.test(row.note ?? '')) continue;
    const compact = (row.note ?? '').replace(/\s/g, '');
    const target = others.find((s) => compact.includes(s.iban!));
    if (!target) continue;
    const account = findAccountByBankNumber(db, target.bankAccountNumber);
    if (!account) continue;
    const counterpart = target.rows.find((r) => r.signedAmount === -row.signedAmount && Math.abs(daysBetween(row.date, r.date)) <= TRANSFER_TOLERANCE_DAYS);
    if (!counterpart) continue;
    row.status = 'transfer';
    row.transferToAccountId = account.id;
    row.envelopeId = null;
  }
}

/** Crédit d'un virement dont le transfert est déjà saisi (importé depuis l'autre compte) : à ignorer. */
function markInternalCredits(db: Db, accountId: number, rows: ImportPreviewRow[]): void {
  const claimed = new Set<number>();
  for (const row of rows) {
    if (row.status !== 'new' || row.signedAmount <= 0 || !/VIREMENT/i.test(row.note ?? '')) continue;
    const transfers = findTransfersTo(db, accountId, row.signedAmount, addDays(row.date, -TRANSFER_TOLERANCE_DAYS), addDays(row.date, TRANSFER_TOLERANCE_DAYS));
    const free = transfers.find((t) => !claimed.has(t.id));
    if (!free) continue;
    claimed.add(free.id);
    row.status = 'internal';
  }
}

export async function previewImport(
  db: Db,
  input: { buffer: Buffer; accountId?: number | null; section?: number | null },
  deps: ImportDeps = {},
): Promise<ImportPreview> {
  const source = await readSource(db, { buffer: input.buffer, accountId: input.accountId ?? null, section: input.section ?? null }, deps);

  let accountId = input.accountId ?? null;
  if (source.sections.length > 0) accountId = source.sections[source.sectionIndex]?.accountId ?? null;
  if (accountId == null && source.bankAccountNumber) {
    accountId = findAccountByBankNumber(db, source.bankAccountNumber)?.id ?? null;
  }
  if (accountId != null) getAccount(db, accountId);

  const rules = listSortingRules(db);
  const planned = accountId == null ? [] : listPlanned(db, accountId);

  // Deux lignes identiques le même jour (deux cafés) doivent garder deux empreintes distinctes.
  const seen = new Map<string, number>();
  const rows: ImportPreviewRow[] = source.rows.map((r, index) => {
    const key = `${r.date}|${r.signedAmount}|${r.label}`;
    const occurrence = seen.get(key) ?? 0;
    seen.set(key, occurrence + 1);
    return {
      index,
      date: r.date,
      label: r.label,
      signedAmount: r.signedAmount,
      status: 'new',
      fingerprint: fingerprint(accountId ?? 0, r.date, r.signedAmount, r.label, occurrence),
      plannedId: null,
      plannedLabel: null,
      envelopeId: r.signedAmount < 0 ? applySortingRules(r.label, rules) : null,
      note: r.note,
      transferToAccountId: null,
    };
  });

  const existing = accountId == null ? new Set<string>() : findByFingerprints(db, rows.map((r) => r.fingerprint));
  for (const row of rows) if (existing.has(row.fingerprint)) row.status = 'duplicate';

  if (accountId != null) {
    detectInternalTransfers(db, source, rows);
    markInternalCredits(db, accountId, rows);
  }

  const fresh = rows.filter((r) => r.status === 'new');
  const matches = matchPlanned(fresh, planned);
  const plannedById = new Map(planned.map((p) => [p.id, p]));
  for (const row of fresh) {
    const plannedId = matches.get(row.index);
    if (plannedId === undefined) continue;
    const p = plannedById.get(plannedId)!;
    row.status = 'matched';
    row.plannedId = plannedId;
    row.plannedLabel = p.label;
    row.envelopeId = p.envelopeId;
  }

  const count = (status: ImportPreviewRow['status']) => rows.filter((r) => r.status === status).length;
  return {
    parserId: source.parserId,
    bankAccountNumber: source.bankAccountNumber,
    accountId,
    rows,
    counts: { total: rows.length, new: count('new'), duplicate: count('duplicate'), matched: count('matched'), transfer: count('transfer'), internal: count('internal') },
    sections: source.sections,
    sectionIndex: source.sectionIndex,
  };
}

export function commitImport(db: Db, input: ImportCommitInput & { bankAccountNumber?: string | null }): ImportRecord {
  const account = getAccount(db, input.accountId);
  return db.transaction((tx) => {
    const t = tx as unknown as Db;
    let matched = 0;
    let created = 0;
    for (const row of input.rows) {
      if (row.plannedId != null) {
        const planned = getTransaction(t, row.plannedId);
        if (planned.status !== 'planned') throw new BadRequestError(`L'opération ${row.plannedId} n'est plus prévue`);
        updateTransaction(t, row.plannedId, {
          date: row.date,
          amount: Math.abs(row.signedAmount),
          label: row.label,
          note: row.note ?? planned.note,
          status: 'confirmed',
          fingerprint: row.fingerprint,
          envelopeId: row.envelopeId ?? planned.envelopeId,
        });
        matched++;
        continue;
      }
      if (row.transferToAccountId != null) {
        if (row.transferToAccountId === input.accountId) throw new BadRequestError('Un virement interne doit viser un autre compte');
        const target = getAccount(t, row.transferToAccountId);
        createTransaction(t, {
          kind: 'transfer',
          date: row.date,
          amount: Math.abs(row.signedAmount),
          label: `Virement ${account.name} → ${target.name}`,
          note: row.note ?? null,
          accountId: input.accountId,
          toAccountId: target.id,
          fingerprint: row.fingerprint,
        });
        created++;
        continue;
      }
      createTransaction(t, {
        kind: row.signedAmount < 0 ? 'expense' : 'income',
        date: row.date,
        amount: Math.abs(row.signedAmount),
        label: row.label,
        note: row.note ?? null,
        accountId: input.accountId,
        envelopeId: row.signedAmount < 0 ? row.envelopeId : null,
        fingerprint: row.fingerprint,
      });
      created++;
    }
    if (input.bankAccountNumber && !account.bankAccountNumber) {
      updateAccount(t, account.id, { bankAccountNumber: input.bankAccountNumber });
    }
    const record = createImport(t, {
      fileName: input.fileName,
      accountId: input.accountId,
      rowCount: input.rows.length + input.duplicateCount,
      newCount: created,
      duplicateCount: input.duplicateCount,
      matchedCount: matched,
    });
    // Rattache les opérations créées à cet import.
    t.run(`update transactions set import_id = ${record.id} where import_id is null and fingerprint in (${input.rows.map((r) => `'${r.fingerprint}'`).join(',') || "''"})`);
    return record;
  });
}
