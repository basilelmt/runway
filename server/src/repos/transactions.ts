import { and, asc, desc, eq, getTableColumns, gte, inArray, isNotNull, isNull, like, lte, ne, or, sql, type SQL } from 'drizzle-orm';
import { merchantDisplayName, merchantKeyFor } from '@core/merchants';
import type { Transaction, TransactionFilter, TransactionInput } from '@shared/schemas';
import type { Db } from '../db/client';
import { merchants, transactions } from '../db/schema';
import { NotFoundError } from '../errors';
import { ensureMerchants } from './merchants';

export type TransactionInsert = TransactionInput & {
  status?: Transaction['status'];
  recurringRuleId?: number | null;
  importId?: number | null;
  fingerprint?: string | null;
  fundingId?: number | null;
};

/**
 * Ajoute la clé marchand tirée du type et du libellé. Seul point de calcul de `merchant_key` à l'écriture :
 * saisie, modification, matérialisation, import et rapprochement passent tous par `toRow`.
 */
export function withMerchantKey<T extends { kind: Transaction['kind']; label: string }>(values: T): T & { merchantKey: string | null } {
  return { ...values, merchantKey: merchantKeyFor(values.kind, values.label) };
}

function toRow(input: TransactionInsert) {
  return withMerchantKey({
    kind: input.kind,
    date: input.date,
    amount: input.amount,
    label: input.label,
    note: input.note ?? null,
    accountId: input.accountId ?? null,
    toAccountId: input.toAccountId ?? null,
    envelopeId: input.envelopeId ?? null,
    fromEnvelopeId: input.fromEnvelopeId ?? null,
    status: input.status ?? 'confirmed',
    recurringRuleId: input.recurringRuleId ?? null,
    importId: input.importId ?? null,
    fingerprint: input.fingerprint ?? null,
    fundingId: input.fundingId ?? null,
  } satisfies typeof transactions.$inferInsert);
}

const selection = { ...getTableColumns(transactions), storedMerchantName: merchants.name };

/** Opérations jointes à leur marchand ; une clé sans ligne `merchants` reste valide (jointure gauche). */
function selectTransactions(db: Db) {
  return db.select(selection).from(transactions).leftJoin(merchants, eq(merchants.key, transactions.merchantKey));
}

function withMerchantName({ storedMerchantName, ...row }: typeof transactions.$inferSelect & { storedMerchantName: string | null }): Transaction {
  return { ...row, merchantName: merchantDisplayName(row.merchantKey, storedMerchantName, row.label) };
}

export function listTransactions(db: Db, filter: Partial<TransactionFilter> = {}): Transaction[] {
  const where: SQL[] = [];
  if (filter.account) where.push(or(eq(transactions.accountId, filter.account), eq(transactions.toAccountId, filter.account))!);
  if (filter.envelope) where.push(or(eq(transactions.envelopeId, filter.envelope), eq(transactions.fromEnvelopeId, filter.envelope))!);
  if (filter.from) where.push(gte(transactions.date, filter.from));
  if (filter.to) where.push(lte(transactions.date, filter.to));
  if (filter.q) {
    const q = `%${filter.q.toLowerCase()}%`;
    where.push(or(like(sql`lower(${transactions.label})`, q), like(sql`lower(${merchants.name})`, q))!);
  }
  if (filter.status) where.push(eq(transactions.status, filter.status));
  if (filter.kind) where.push(eq(transactions.kind, filter.kind));
  if (filter.unsorted) where.push(and(eq(transactions.kind, 'expense'), isNull(transactions.envelopeId))!);
  if (filter.merchant) where.push(eq(transactions.merchantKey, filter.merchant));
  if (filter.excludeAllocations) where.push(ne(transactions.kind, 'allocation'));
  return selectTransactions(db)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(transactions.date), desc(transactions.id))
    .limit(filter.limit ?? 500)
    .all()
    .map(withMerchantName);
}

/** Toutes les opérations, dans l'ordre chronologique, pour les calculs. */
export function allTransactions(db: Db): Transaction[] {
  return selectTransactions(db).orderBy(asc(transactions.date), asc(transactions.id)).all().map(withMerchantName);
}

export function getTransaction(db: Db, id: number): Transaction {
  const row = selectTransactions(db).where(eq(transactions.id, id)).get();
  if (!row) throw new NotFoundError('Opération introuvable');
  return withMerchantName(row);
}

export function createTransaction(db: Db, input: TransactionInsert): Transaction {
  const row = toRow(input);
  const { id } = db.insert(transactions).values(row).returning({ id: transactions.id }).get();
  ensureMerchants(db, [row.merchantKey]);
  return getTransaction(db, id);
}

export function bulkCreateTransactions(db: Db, inputs: TransactionInsert[]): Transaction[] {
  return db.transaction((tx) => inputs.map((input) => createTransaction(tx as unknown as Db, input)));
}

export function updateTransaction(db: Db, id: number, input: Partial<TransactionInsert>): Transaction {
  const current = getTransaction(db, id);
  const merged: TransactionInsert = {
    ...current,
    ...input,
  };
  const row = toRow(merged);
  db.update(transactions).set(row).where(eq(transactions.id, id)).run();
  ensureMerchants(db, [row.merchantKey]);
  return getTransaction(db, id);
}

export function deleteTransaction(db: Db, id: number): void {
  const result = db.delete(transactions).where(eq(transactions.id, id)).run();
  if (result.changes === 0) throw new NotFoundError('Opération introuvable');
}

export function listPlanned(db: Db, accountId?: number): Transaction[] {
  const where = accountId
    ? and(eq(transactions.status, 'planned'), or(eq(transactions.accountId, accountId), eq(transactions.toAccountId, accountId)))
    : eq(transactions.status, 'planned');
  return selectTransactions(db).where(where).orderBy(asc(transactions.date)).all().map(withMerchantName);
}

export function findByFingerprints(db: Db, fingerprints: string[]): Set<string> {
  if (fingerprints.length === 0) return new Set();
  const rows = db
    .select({ fingerprint: transactions.fingerprint })
    .from(transactions)
    .where(inArray(transactions.fingerprint, fingerprints))
    .all();
  return new Set(rows.map((r) => r.fingerprint).filter((f): f is string => f !== null));
}

/** Transferts reçus par un compte, d'un montant donné, dans une fenêtre de dates. */
export function findTransfersTo(db: Db, accountId: number, amount: number, from: string, to: string): Transaction[] {
  return selectTransactions(db)
    .where(and(eq(transactions.kind, 'transfer'), eq(transactions.toAccountId, accountId), eq(transactions.amount, amount), gte(transactions.date, from), lte(transactions.date, to)))
    .orderBy(asc(transactions.date))
    .all()
    .map(withMerchantName);
}

export function countUnsorted(db: Db): number {
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(transactions)
    .where(and(eq(transactions.kind, 'expense'), isNull(transactions.envelopeId)))
    .get();
  return row?.n ?? 0;
}

/** Dernière date générée par règle, pour vérifier l'idempotence de la matérialisation. */
export function existsForRuleAndDate(db: Db, ruleId: number, date: string): boolean {
  const row = db
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.recurringRuleId, ruleId), eq(transactions.date, date)))
    .get();
  return row !== undefined;
}

/** Date de la dernière opération confirmée touchant un compte (débitée ou créditée), ou null. */
export function lastConfirmedDate(db: Db, accountId: number): string | null {
  const row = db
    .select({ date: transactions.date })
    .from(transactions)
    .where(and(eq(transactions.status, 'confirmed'), or(eq(transactions.accountId, accountId), eq(transactions.toAccountId, accountId))))
    .orderBy(desc(transactions.date))
    .limit(1)
    .get();
  return row?.date ?? null;
}

/**
 * Date de la dernière opération confirmée issue d'un import (relevé ou synchronisation) touchant un compte, ou null.
 * Les saisies manuelles et les occurrences récurrentes confirmées n'en font pas partie : elles ne prouvent pas
 * que l'historique bancaire est complet jusqu'à leur date.
 */
export function lastImportedDate(db: Db, accountId: number): string | null {
  const row = db
    .select({ date: transactions.date })
    .from(transactions)
    .where(and(eq(transactions.status, 'confirmed'), isNotNull(transactions.importId), or(eq(transactions.accountId, accountId), eq(transactions.toAccountId, accountId))))
    .orderBy(desc(transactions.date))
    .limit(1)
    .get();
  return row?.date ?? null;
}

/**
 * Nombre d'opérations confirmées sur ce compte, ce jour, pour ce montant signé.
 * Sert à la jonction entre l'historique importé des relevés et la synchronisation API,
 * dont les libellés diffèrent (l'empreinte ne suffit pas).
 */
export function countConfirmedOn(db: Db, accountId: number, date: string, signedAmount: number): number {
  const side =
    signedAmount < 0
      ? and(eq(transactions.accountId, accountId), inArray(transactions.kind, ['expense', 'transfer']))
      : or(and(eq(transactions.accountId, accountId), eq(transactions.kind, 'income')), and(eq(transactions.toAccountId, accountId), eq(transactions.kind, 'transfer')));
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(transactions)
    .where(and(eq(transactions.status, 'confirmed'), eq(transactions.date, date), eq(transactions.amount, Math.abs(signedAmount)), side))
    .get();
  return row?.n ?? 0;
}
