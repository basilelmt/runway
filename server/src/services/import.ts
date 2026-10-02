import { fingerprint } from '@core/fingerprint';
import { matchPlanned } from '@core/matching';
import { applySortingRules } from '@core/sorting';
import type { ImportCommitInput, ImportPreview, ImportPreviewRow } from '@shared/api-types';
import type { ImportRecord } from '@shared/schemas';
import type { Db } from '../db/client';
import { BadRequestError } from '../errors';
import { detectParser } from '../parsers';
import { findAccountByBankNumber, getAccount, updateAccount } from '../repos/accounts';
import { createImport } from '../repos/imports';
import { listSortingRules } from '../repos/sorting-rules';
import { createTransaction, findByFingerprints, getTransaction, listPlanned, updateTransaction } from '../repos/transactions';

export function previewImport(db: Db, input: { buffer: Buffer; accountId?: number | null }): ImportPreview {
  const parser = detectParser(input.buffer);
  if (!parser) throw new BadRequestError('Format de fichier non reconnu (export La Banque Postale attendu)');
  const statement = parser.parse(input.buffer);

  let accountId = input.accountId ?? null;
  if (accountId == null && statement.bankAccountNumber) {
    accountId = findAccountByBankNumber(db, statement.bankAccountNumber)?.id ?? null;
  }
  if (accountId != null) getAccount(db, accountId);

  const rules = listSortingRules(db);
  const planned = accountId == null ? [] : listPlanned(db, accountId);

  // Deux lignes identiques le même jour (deux cafés) doivent garder deux empreintes distinctes.
  const seen = new Map<string, number>();
  const rows: ImportPreviewRow[] = statement.rows.map((r, index) => {
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
    };
  });

  const existing = accountId == null ? new Set<string>() : findByFingerprints(db, rows.map((r) => r.fingerprint));
  for (const row of rows) if (existing.has(row.fingerprint)) row.status = 'duplicate';

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

  return {
    parserId: parser.id,
    bankAccountNumber: statement.bankAccountNumber,
    accountId,
    rows,
    counts: {
      total: rows.length,
      new: rows.filter((r) => r.status === 'new').length,
      duplicate: rows.filter((r) => r.status === 'duplicate').length,
      matched: rows.filter((r) => r.status === 'matched').length,
    },
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
          status: 'confirmed',
          fingerprint: row.fingerprint,
          envelopeId: row.envelopeId ?? planned.envelopeId,
        });
        matched++;
        continue;
      }
      createTransaction(t, {
        kind: row.signedAmount < 0 ? 'expense' : 'income',
        date: row.date,
        amount: Math.abs(row.signedAmount),
        label: row.label,
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
