import { asc, eq, sql } from 'drizzle-orm';
import type { Envelope, EnvelopeInput, EnvelopePatch } from '@shared/schemas';
import type { Db } from '../db/client';
import { envelopes } from '../db/schema';
import { NotFoundError } from '../errors';

export function listEnvelopes(db: Db, { includeArchived = false } = {}): Envelope[] {
  const rows = db.select().from(envelopes).orderBy(asc(envelopes.sortOrder), asc(envelopes.id)).all();
  return includeArchived ? rows : rows.filter((e) => !e.archived);
}

export function getEnvelope(db: Db, id: number): Envelope {
  const row = db.select().from(envelopes).where(eq(envelopes.id, id)).get();
  if (!row) throw new NotFoundError('Enveloppe introuvable');
  return row;
}

export function createEnvelope(db: Db, input: EnvelopeInput): Envelope {
  const max = db.select({ m: sql<number | null>`max(${envelopes.sortOrder})` }).from(envelopes).get();
  return db
    .insert(envelopes)
    .values({
      name: input.name,
      color: input.color,
      monthlyExtra: input.monthlyExtra ?? null,
      isSavings: input.isSavings ?? false,
      sortOrder: (max?.m ?? -1) + 1,
    })
    .returning()
    .get();
}

export function updateEnvelope(db: Db, id: number, input: EnvelopePatch): Envelope {
  getEnvelope(db, id);
  const patch: Partial<typeof envelopes.$inferInsert> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.color !== undefined) patch.color = input.color;
  if (input.monthlyExtra !== undefined) patch.monthlyExtra = input.monthlyExtra;
  if (input.isSavings !== undefined) patch.isSavings = input.isSavings;
  if (input.archived !== undefined) patch.archived = input.archived;
  if (Object.keys(patch).length === 0) return getEnvelope(db, id);
  return db.update(envelopes).set(patch).where(eq(envelopes.id, id)).returning().get()!;
}

/** Réordonne : les ids fournis prennent les positions 0..n-1 dans l'ordre donné. */
export function reorderEnvelopes(db: Db, ids: number[]): Envelope[] {
  db.transaction((tx) => {
    ids.forEach((id, i) => {
      tx.update(envelopes).set({ sortOrder: i }).where(eq(envelopes.id, id)).run();
    });
  });
  return listEnvelopes(db);
}
