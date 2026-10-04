import { fingerprint } from '@core/fingerprint';
import { extractIbans } from '@core/iban';
import { matchPlanned } from '@core/matching';
import { applySortingRules } from '@core/sorting';
import type { ImportCommitInput, ImportPreview, ImportPreviewRow, ImportSection } from '@shared/api-types';
import { addDays, daysBetween, type ISODate } from '@shared/dates';
import type { ImportRecord } from '@shared/schemas';
import type { Db } from '../db/client';
import { BadRequestError } from '../errors';
import { detectParser } from '../parsers';
import { extractPdfText as defaultExtractPdfText, isPdf, parseLbpStatementText } from '../parsers/lbp-pdf';
import { findAccountByBankNumber, getAccount, updateAccount } from '../repos/accounts';
import { createImport } from '../repos/imports';
import { listSortingRules } from '../repos/sorting-rules';
import { createTransaction, findByFingerprints, findTransfersTo, getTransaction, listPlanned, updateTransaction } from '../repos/transactions';

export type ImportDeps = { extractPdfText?: (buffer: Buffer) => Promise<string> };

export type SourceRow = { date: ISODate; label: string; signedAmount: number; note: string | null };

/** Autre compte lu dans le même lot (section d'un PDF, autre compte synchronisé) : sert à reconnaître les virements internes. */
export type Sibling = { accountId: number | null; iban: string | null; rows: { date: ISODate; signedAmount: number }[] };

/** Opérations d'un compte prêtes à être traitées, quelle que soit leur origine (fichier ou API). */
export type Source = {
  parserId: string;
  bankAccountNumber: string | null;
  rows: SourceRow[];
  sections: ImportSection[];
  sectionIndex: number;
  siblings: Sibling[];
};

const TRANSFER_TOLERANCE_DAYS = 4;

async function readFileSource(db: Db, input: { buffer: Buffer; accountId: number | null; section: number | null }, deps: ImportDeps): Promise<Source> {
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
      rows: section.rows.map((r) => ({ date: r.date, label: r.label, signedAmount: r.signedAmount, note: r.raw })),
      sections: meta,
      sectionIndex,
      siblings: sections.filter((s) => s !== section).map((s) => ({ accountId: meta.find((m) => m.bankAccountNumber === s.bankAccountNumber)?.accountId ?? null, iban: s.iban, rows: s.rows })),
    };
  }

  const parser = detectParser(input.buffer);
  if (!parser) throw new BadRequestError('Format de fichier non reconnu (export CSV ou relevé PDF La Banque Postale attendu)');
  const statement = parser.parse(input.buffer);
  return {
    parserId: parser.id,
    bankAccountNumber: statement.bankAccountNumber,
    rows: statement.rows.map((r) => ({ ...r, note: null })),
    sections: [],
    sectionIndex: 0,
    siblings: [],
  };
}

function rowText(row: ImportPreviewRow): string {
  return `${row.label} ${row.note ?? ''}`;
}

/**
 * Virements entre comptes propres : un débit « VIREMENT » avec un crédit du même montant à ±4 jours
 * chez un compte frère devient un transfert vers ce compte. Le texte examiné est le libellé plus la note :
 * - s'il cite l'IBAN d'un compte frère, ce compte est la cible ;
 * - s'il cite un autre IBAN valide (tiers inconnu), la ligne reste telle quelle ;
 * - sans IBAN (cas de l'API), la cible est l'unique compte frère portant la contrepartie.
 * Chaque crédit d'un compte frère ne sert de contrepartie qu'à un seul débit.
 */
function detectInternalTransfers(siblings: Sibling[], rows: ImportPreviewRow[]): void {
  const known = siblings.filter((s) => s.accountId !== null);
  if (known.length === 0) return;
  const claimed = new Map<Sibling, Set<number>>();
  const claimedOf = (s: Sibling): Set<number> => {
    let set = claimed.get(s);
    if (!set) claimed.set(s, (set = new Set<number>()));
    return set;
  };
  const findCounterpart = (s: Sibling, row: ImportPreviewRow): number =>
    s.rows.findIndex((r, i) => !claimedOf(s).has(i) && r.signedAmount === -row.signedAmount && Math.abs(daysBetween(row.date, r.date)) <= TRANSFER_TOLERANCE_DAYS);
  for (const row of rows) {
    const text = rowText(row);
    if (row.status !== 'new' || row.signedAmount >= 0 || !/VIREMENT/i.test(text)) continue;
    const ibans = extractIbans(text);
    const byIban = known.find((s) => s.iban && ibans.includes(s.iban.replace(/\s/g, '').toUpperCase()));
    const candidates = byIban ? [byIban] : ibans.length > 0 ? [] : known.filter((s) => findCounterpart(s, row) >= 0);
    const target = candidates.length === 1 ? candidates[0]! : null;
    if (!target) continue;
    const counterpart = findCounterpart(target, row);
    if (counterpart < 0) continue;
    claimedOf(target).add(counterpart);
    row.status = 'transfer';
    row.transferToAccountId = target.accountId;
    row.envelopeId = null;
  }
}

/**
 * Lot de plusieurs comptes prévisualisés ensemble (synchronisation) : le crédit qui sert de contrepartie
 * à un transfert détecté sur un autre compte du lot devient `internal`, quel que soit l'ordre de traitement.
 * Sans cela, le crédit serait enregistré comme revenu si son compte passait avant celui du débit.
 */
export function markClaimedCounterparts(previews: { accountId: number; rows: ImportPreviewRow[] }[]): void {
  const claimed = new Set<ImportPreviewRow>();
  for (const { rows } of previews) {
    for (const row of rows) {
      if (row.status !== 'transfer' || row.transferToAccountId === null) continue;
      const target = previews.find((p) => p.accountId === row.transferToAccountId);
      const counterpart = target?.rows.find(
        (r) => !claimed.has(r) && r.status === 'new' && r.signedAmount === -row.signedAmount && Math.abs(daysBetween(row.date, r.date)) <= TRANSFER_TOLERANCE_DAYS,
      );
      if (!counterpart) continue;
      claimed.add(counterpart);
      counterpart.status = 'internal';
      counterpart.envelopeId = null;
    }
  }
}

/** Crédit d'un virement dont le transfert est déjà saisi (importé depuis l'autre compte) : à ignorer. */
function markInternalCredits(db: Db, accountId: number, rows: ImportPreviewRow[]): void {
  const claimed = new Set<number>();
  for (const row of rows) {
    if (row.status !== 'new' || row.signedAmount <= 0 || !/VIREMENT/i.test(rowText(row))) continue;
    const transfers = findTransfersTo(db, accountId, row.signedAmount, addDays(row.date, -TRANSFER_TOLERANCE_DAYS), addDays(row.date, TRANSFER_TOLERANCE_DAYS));
    const free = transfers.find((t) => !claimed.has(t.id));
    if (!free) continue;
    claimed.add(free.id);
    row.status = 'internal';
  }
}

/**
 * Traitement commun à toutes les sources : empreintes, doublons, virements internes,
 * rapprochement des opérations prévues et règles de tri.
 */
export function buildPreview(db: Db, source: Source, accountId: number | null): ImportPreview {
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
    detectInternalTransfers(source.siblings, rows);
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

export async function previewImport(
  db: Db,
  input: { buffer: Buffer; accountId?: number | null; section?: number | null },
  deps: ImportDeps = {},
): Promise<ImportPreview> {
  const source = await readFileSource(db, { buffer: input.buffer, accountId: input.accountId ?? null, section: input.section ?? null }, deps);

  let accountId = input.accountId ?? null;
  if (source.sections.length > 0) accountId = source.sections[source.sectionIndex]?.accountId ?? null;
  if (accountId == null && source.bankAccountNumber) {
    accountId = findAccountByBankNumber(db, source.bankAccountNumber)?.id ?? null;
  }
  return buildPreview(db, source, accountId);
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
