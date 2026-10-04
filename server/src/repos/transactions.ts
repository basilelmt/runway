import { and, asc, desc, eq, gte, inArray, isNull, like, lte, or, sql, type SQL } from 'drizzle-orm';
import type { Transaction, TransactionFilter, TransactionInput } from '@shared/schemas';
import type { Db } from '../db/client';
import { transactions } from '../db/schema';
import { NotFoundError } from '../errors';

export type TransactionInsert = TransactionInput & {
  status?: Transaction['status'];
  recurringRuleId?: number | null;
  importId?: number | null;
  fingerprint?: string | null;
};

function toRow(input: TransactionInsert): typeof transactions.$inferInsert {
  return {
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
  };
}

export function listTransactions(db: Db, filter: Partial<TransactionFilter> = {}): Transaction[] {
  const where: SQL[] = [];
  if (filter.account) where.push(or(eq(transactions.accountId, filter.account), eq(transactions.toAccountId, filter.account))!);
  if (filter.envelope) where.push(or(eq(transactions.envelopeId, filter.envelope), eq(transactions.fromEnvelopeId, filter.envelope))!);
  if (filter.from) where.push(gte(transactions.date, filter.from));
  if (filter.to) where.push(lte(transactions.date, filter.to));
  if (filter.q) where.push(like(sql`lower(${transactions.label})`, `%${filter.q.toLowerCase()}%`));
  if (filter.status) where.push(eq(transactions.status, filter.status));
  if (filter.kind) where.push(eq(transactions.kind, filter.kind));
  if (filter.unsorted) where.push(and(eq(transactions.kind, 'expense'), isNull(transactions.envelopeId))!);
  return db
    .select()
    .from(transactions)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(transactions.date), desc(transactions.id))
    .limit(filter.limit ?? 500)
    .all();
}

/** Toutes les opérations, dans l'ordre chronologique, pour les calculs. */
export function allTransactions(db: Db): Transaction[] {
  return db.select().from(transactions).orderBy(asc(transactions.date), asc(transactions.id)).all();
}

export function getTransaction(db: Db, id: number): Transaction {
  const row = db.select().from(transactions).where(eq(transactions.id, id)).get();
  if (!row) throw new NotFoundError('Opération introuvable');
  return row;
}

export function createTransaction(db: Db, input: TransactionInsert): Transaction {
  return db.insert(transactions).values(toRow(input)).returning().get();
}

export function bulkCreateTransactions(db: Db, inputs: TransactionInsert[]): Transaction[] {
  return db.transaction((tx) => inputs.map((input) => tx.insert(transactions).values(toRow(input)).returning().get()));
}

export function updateTransaction(db: Db, id: number, input: Partial<TransactionInsert>): Transaction {
  const current = getTransaction(db, id);
  const merged: TransactionInsert = {
    ...current,
    ...input,
  };
  return db.update(transactions).set(toRow(merged)).where(eq(transactions.id, id)).returning().get()!;
}

export function deleteTransaction(db: Db, id: number): void {
  const result = db.delete(transactions).where(eq(transactions.id, id)).run();
  if (result.changes === 0) throw new NotFoundError('Opération introuvable');
}

export function listPlanned(db: Db, accountId?: number): Transaction[] {
  const where = accountId
    ? and(eq(transactions.status, 'planned'), or(eq(transactions.accountId, accountId), eq(transactions.toAccountId, accountId)))
    : eq(transactions.status, 'planned');
  return db.select().from(transactions).where(where).orderBy(asc(transactions.date)).all();
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
  return db
    .select()
    .from(transactions)
    .where(and(eq(transactions.kind, 'transfer'), eq(transactions.toAccountId, accountId), eq(transactions.amount, amount), gte(transactions.date, from), lte(transactions.date, to)))
    .orderBy(asc(transactions.date))
    .all();
}

export function countUnsorted(db: Db): number {
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(transactions)
    .where(and(eq(transactions.kind, 'expense'), isNull(transactions.envelopeId)))
    .get();
  return row?.n ?? 0;
}

export function countPlanned(db: Db): number {
  const row = db.select({ n: sql<number>`count(*)` }).from(transactions).where(eq(transactions.status, 'planned')).get();
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
 * Une opération confirmée existe-t-elle sur ce compte, ce jour, pour ce montant signé ?
 * Sert à la jonction entre l'historique importé des relevés et la synchronisation API,
 * dont les libellés diffèrent (l'empreinte ne suffit pas).
 */
export function hasConfirmedOn(db: Db, accountId: number, date: string, signedAmount: number): boolean {
  const side =
    signedAmount < 0
      ? and(eq(transactions.accountId, accountId), inArray(transactions.kind, ['expense', 'transfer']))
      : or(and(eq(transactions.accountId, accountId), eq(transactions.kind, 'income')), and(eq(transactions.toAccountId, accountId), eq(transactions.kind, 'transfer')));
  const row = db
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.status, 'confirmed'), eq(transactions.date, date), eq(transactions.amount, Math.abs(signedAmount)), side))
    .limit(1)
    .get();
  return row !== undefined;
}
