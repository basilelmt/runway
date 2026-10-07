import { and, desc, eq, gte } from 'drizzle-orm';
import type { IdeaCandidate } from '@shared/schemas';
import type { Db } from '../db/client';
import { ideaRuns, ideas } from '../db/schema';
import { NotFoundError } from '../errors';

export type IdeaRow = typeof ideas.$inferSelect;
export type IdeaRunRow = typeof ideaRuns.$inferSelect;

export function createRun(db: Db, trigger: 'manual' | 'weekly', startedAt: string): IdeaRunRow {
  return db.insert(ideaRuns).values({ trigger, startedAt }).returning().get();
}

export function finishRun(
  db: Db,
  id: number,
  patch: { status: 'done' | 'failed'; finishedAt: string; acceptedCount?: number; rejected?: { ticker: string; reason: string }[]; error?: string | null },
): IdeaRunRow {
  getRun(db, id);
  const set: Partial<typeof ideaRuns.$inferInsert> = { status: patch.status, finishedAt: patch.finishedAt };
  if (patch.acceptedCount !== undefined) set.acceptedCount = patch.acceptedCount;
  if (patch.rejected !== undefined) set.rejected = JSON.stringify(patch.rejected);
  if (patch.error !== undefined) set.error = patch.error;
  return db.update(ideaRuns).set(set).where(eq(ideaRuns.id, id)).returning().get()!;
}

export function getRun(db: Db, id: number): IdeaRunRow {
  const row = db.select().from(ideaRuns).where(eq(ideaRuns.id, id)).get();
  if (!row) throw new NotFoundError('Fournée introuvable');
  return row;
}

export function latestRun(db: Db): IdeaRunRow | null {
  return db.select().from(ideaRuns).orderBy(desc(ideaRuns.startedAt), desc(ideaRuns.id)).limit(1).get() ?? null;
}

export function runningRun(db: Db): IdeaRunRow | null {
  return (
    db
      .select()
      .from(ideaRuns)
      .where(eq(ideaRuns.status, 'running'))
      .orderBy(desc(ideaRuns.startedAt), desc(ideaRuns.id))
      .limit(1)
      .get() ?? null
  );
}

export function lastSuccessfulRun(db: Db): IdeaRunRow | null {
  return (
    db
      .select()
      .from(ideaRuns)
      .where(eq(ideaRuns.status, 'done'))
      .orderBy(desc(ideaRuns.startedAt), desc(ideaRuns.id))
      .limit(1)
      .get() ?? null
  );
}

export function failInterruptedRuns(db: Db, at: string): number {
  const result = db
    .update(ideaRuns)
    .set({ status: 'failed', finishedAt: at, error: 'Interrompue par un redémarrage' })
    .where(eq(ideaRuns.status, 'running'))
    .run();
  return result.changes;
}

export function insertIdea(db: Db, runId: number, createdOn: string, c: IdeaCandidate, start: { priceEur: number; benchPriceEur: number }): IdeaRow {
  return db
    .insert(ideas)
    .values({
      runId,
      createdOn,
      title: c.title,
      event: c.event,
      sourceUrl: c.sourceUrl,
      reasoning: JSON.stringify(c.reasoning),
      pricedIn: c.pricedIn,
      ticker: c.ticker,
      assetName: c.assetName,
      whereToBuy: c.whereToBuy,
      horizon: c.horizon,
      startPriceEur: start.priceEur,
      benchStartPriceEur: start.benchPriceEur,
    })
    .returning()
    .get();
}

export function listIdeas(db: Db, filter?: { status?: 'open' | 'closed'; since?: string }): IdeaRow[] {
  const conditions = [];
  if (filter?.status !== undefined) conditions.push(eq(ideas.status, filter.status));
  if (filter?.since !== undefined) conditions.push(gte(ideas.createdOn, filter.since));
  const order = [desc(ideas.createdOn), desc(ideas.id)] as const;
  const query = db.select().from(ideas);
  return conditions.length > 0 ? query.where(and(...conditions)).orderBy(...order).all() : query.orderBy(...order).all();
}

export function closeIdea(db: Db, id: number, finalReturn: number, benchFinalReturn: number): void {
  db.update(ideas).set({ status: 'closed', finalReturn, benchFinalReturn }).where(eq(ideas.id, id)).run();
}
