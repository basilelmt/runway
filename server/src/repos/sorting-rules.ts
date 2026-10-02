import { asc, eq, sql } from 'drizzle-orm';
import type { SortingRule, SortingRuleInput } from '@shared/schemas';
import type { Db } from '../db/client';
import { sortingRules } from '../db/schema';
import { NotFoundError } from '../errors';

export function listSortingRules(db: Db): SortingRule[] {
  return db.select().from(sortingRules).orderBy(asc(sortingRules.priority), asc(sortingRules.id)).all();
}

export function createSortingRule(db: Db, input: SortingRuleInput): SortingRule {
  const max = db.select({ m: sql<number | null>`max(${sortingRules.priority})` }).from(sortingRules).get();
  return db
    .insert(sortingRules)
    .values({ pattern: input.pattern, envelopeId: input.envelopeId, priority: (max?.m ?? -1) + 1 })
    .returning()
    .get();
}

export function updateSortingRule(db: Db, id: number, input: SortingRuleInput): SortingRule {
  const row = db.update(sortingRules).set({ pattern: input.pattern, envelopeId: input.envelopeId }).where(eq(sortingRules.id, id)).returning().get();
  if (!row) throw new NotFoundError('Règle de tri introuvable');
  return row;
}

export function deleteSortingRule(db: Db, id: number): void {
  const result = db.delete(sortingRules).where(eq(sortingRules.id, id)).run();
  if (result.changes === 0) throw new NotFoundError('Règle de tri introuvable');
}

export function reorderSortingRules(db: Db, ids: number[]): SortingRule[] {
  db.transaction((tx) => {
    ids.forEach((id, i) => {
      tx.update(sortingRules).set({ priority: i }).where(eq(sortingRules.id, id)).run();
    });
  });
  return listSortingRules(db);
}
