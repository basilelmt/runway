import { and, desc, eq, gte, isNull, or } from 'drizzle-orm';
import type { IdeaAngle } from '@shared/invest';
import type { Db } from '../db/client';
import { ideaRuns, ideas } from '../db/schema';
import { NotFoundError } from '../errors';

export type IdeaRow = typeof ideas.$inferSelect;
export type IdeaRunRow = typeof ideaRuns.$inferSelect;

export function createRun(db: Db, trigger: 'manual' | 'weekly', startedAt: string): IdeaRunRow {
  return db.insert(ideaRuns).values({ trigger, startedAt, phase: 'research' }).returning().get();
}

export function setRunPhase(db: Db, id: number, phase: 'research' | 'review'): void {
  db.update(ideaRuns).set({ phase }).where(eq(ideaRuns.id, id)).run();
}

export function finishRun(
  db: Db,
  id: number,
  patch: {
    status: 'done' | 'failed';
    finishedAt: string;
    acceptedCount?: number;
    candidateCount?: number;
    failedAngles?: IdeaAngle[];
    rejected?: { ticker: string; reason: string }[];
    error?: string | null;
  },
): IdeaRunRow {
  getRun(db, id);
  const set: Partial<typeof ideaRuns.$inferInsert> = { status: patch.status, finishedAt: patch.finishedAt, phase: null };
  if (patch.acceptedCount !== undefined) set.acceptedCount = patch.acceptedCount;
  if (patch.candidateCount !== undefined) set.candidateCount = patch.candidateCount;
  if (patch.failedAngles !== undefined) set.failedAngles = JSON.stringify(patch.failedAngles);
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
    .set({ status: 'failed', finishedAt: at, phase: null, error: 'Interrompue par un redémarrage' })
    .where(eq(ideaRuns.status, 'running'))
    .run();
  return result.changes;
}

/** Une idée à enregistrer : retenue, écartée, ou (`verdict` absent) d'avant la critique. */
export type NewIdea = Omit<typeof ideas.$inferInsert, 'id' | 'runId' | 'createdOn' | 'status' | 'finalReturn' | 'benchFinalReturn' | 'sources' | 'reasoning'> & {
  sources: string[];
  reasoning: string[];
};

export function insertIdea(db: Db, runId: number, createdOn: string, idea: NewIdea): IdeaRow {
  return db
    .insert(ideas)
    .values({ ...idea, runId, createdOn, sources: JSON.stringify(idea.sources), reasoning: JSON.stringify(idea.reasoning) })
    .returning()
    .get();
}

/** `shown` : seulement les idées affichées (retenues, ou d'avant la critique). */
export function listIdeas(db: Db, filter?: { status?: 'open' | 'closed'; since?: string; shown?: true }): IdeaRow[] {
  const conditions = [];
  if (filter?.status !== undefined) conditions.push(eq(ideas.status, filter.status));
  if (filter?.since !== undefined) conditions.push(gte(ideas.createdOn, filter.since));
  if (filter?.shown) conditions.push(or(isNull(ideas.verdict), eq(ideas.verdict, 'kept')));
  const order = [desc(ideas.createdOn), desc(ideas.id)] as const;
  const query = db.select().from(ideas);
  return conditions.length > 0 ? query.where(and(...conditions)).orderBy(...order).all() : query.orderBy(...order).all();
}

export function closeIdea(db: Db, id: number, finalReturn: number, benchFinalReturn: number): void {
  db.update(ideas).set({ status: 'closed', finalReturn, benchFinalReturn }).where(eq(ideas.id, id)).run();
}
