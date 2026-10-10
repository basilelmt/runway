import { asc, eq } from 'drizzle-orm';
import type { AppliedReview, MonthReviewRecord } from '@shared/schemas';
import type { Db } from '../db/client';
import { monthReviews } from '../db/schema';

function toRecord(row: typeof monthReviews.$inferSelect): MonthReviewRecord {
  return { month: row.month, reviewedAt: row.reviewedAt, applied: JSON.parse(row.applied) as AppliedReview };
}

export function listReviews(db: Db): MonthReviewRecord[] {
  return db.select().from(monthReviews).orderBy(asc(monthReviews.month)).all().map(toRecord);
}

export function getReview(db: Db, month: string): MonthReviewRecord | null {
  const row = db.select().from(monthReviews).where(eq(monthReviews.month, month)).get();
  return row ? toRecord(row) : null;
}

export function createReview(db: Db, month: string, reviewedAt: string, applied: AppliedReview): void {
  db.insert(monthReviews).values({ month, reviewedAt, applied: JSON.stringify(applied) }).run();
}

export function deleteReview(db: Db, month: string): void {
  db.delete(monthReviews).where(eq(monthReviews.month, month)).run();
}
