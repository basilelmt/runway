import { eq } from 'drizzle-orm';
import type { Funding } from '@shared/schemas';
import type { Db } from '../db/client';
import { fundings } from '../db/schema';
import { NotFoundError } from '../errors';

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
