import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { FundingView } from '@shared/api-types';
import type { Funding } from '@shared/schemas';
import type { Db } from '../db/client';
import { fundings, transactions } from '../db/schema';
import { BadRequestError, NotFoundError } from '../errors';

export function createFunding(db: Db, input: { sourceTransactionId: number; month: string; shortfallCount: number }): Funding {
  return db.insert(fundings).values(input).returning().get();
}

export function findFundingBySource(db: Db, transactionId: number): Funding | undefined {
  return db.select().from(fundings).where(eq(fundings.sourceTransactionId, transactionId)).get();
}

export function getFunding(db: Db, id: number): Funding {
  const row = db.select().from(fundings).where(eq(fundings.id, id)).get();
  if (!row) throw new NotFoundError('Répartition introuvable');
  return row;
}

export function listFundings(db: Db): Funding[] {
  return db.select().from(fundings).all();
}

export function latestFundingView(db: Db): FundingView | null {
  const funding = db
    .select()
    .from(fundings)
    .where(and(eq(fundings.status, 'applied'), isNull(fundings.dismissedAt)))
    .orderBy(desc(fundings.id))
    .limit(1)
    .get();
  if (!funding) return null;
  const totals = db
    .select({ total: sql<number>`coalesce(sum(${transactions.amount}), 0)`, count: sql<number>`count(distinct ${transactions.envelopeId})` })
    .from(transactions)
    .where(eq(transactions.fundingId, funding.id))
    .get();
  const source = db.select({ label: transactions.label }).from(transactions).where(eq(transactions.id, funding.sourceTransactionId)).get();
  return {
    id: funding.id,
    month: funding.month,
    total: totals?.total ?? 0,
    envelopeCount: totals?.count ?? 0,
    shortfallCount: funding.shortfallCount,
    sourceLabel: source?.label ?? '',
  };
}

/** Supprime les allocations de la répartition et la marque annulée : l'argent revient à répartir. */
export function undoFunding(db: Db, id: number): void {
  const funding = getFunding(db, id);
  if (funding.status === 'undone') throw new BadRequestError('Répartition déjà annulée');
  db.transaction((tx) => {
    tx.delete(transactions).where(eq(transactions.fundingId, id)).run();
    tx.update(fundings).set({ status: 'undone' }).where(eq(fundings.id, id)).run();
  });
}

export function dismissFunding(db: Db, id: number): void {
  getFunding(db, id);
  db.update(fundings).set({ dismissedAt: new Date().toISOString() }).where(eq(fundings.id, id)).run();
}
