import { and, desc, eq, isNull } from 'drizzle-orm';
import type { AnySignal } from '@shared/api-types';
import type { SignalKind } from '@shared/schemas';
import type { Db } from '../db/client';
import { signals } from '../db/schema';
import { NotFoundError } from '../errors';

export type SignalRow = typeof signals.$inferSelect;

function toView(row: SignalRow): AnySignal {
  return { ...row, kind: row.kind as SignalKind, payload: JSON.parse(row.payload) } as AnySignal;
}

/** Signaux actifs (ni écartés, ni résolus), du plus récent au plus ancien. */
export function listActiveSignals(db: Db): AnySignal[] {
  return db
    .select()
    .from(signals)
    .where(and(isNull(signals.dismissedAt), isNull(signals.resolvedAt)))
    .orderBy(desc(signals.id))
    .all()
    .map(toView);
}

export function countActiveSignals(db: Db): number {
  return listActiveSignals(db).length;
}

/** Toutes les lignes, écartées et résolues comprises : la détection s'en sert pour ne jamais recréer une clé connue. */
export function listAllSignals(db: Db): SignalRow[] {
  return db.select().from(signals).all();
}

export function insertSignal(db: Db, input: { kind: SignalKind; key: string; payload: unknown; createdAt: string }): void {
  db.insert(signals).values({ kind: input.kind, key: input.key, payload: JSON.stringify(input.payload), createdAt: input.createdAt }).run();
}

export function resolveSignal(db: Db, id: number, resolvedAt: string): void {
  db.update(signals).set({ resolvedAt }).where(eq(signals.id, id)).run();
}

export function dismissSignal(db: Db, id: number, dismissedAt: string): void {
  const result = db.update(signals).set({ dismissedAt }).where(eq(signals.id, id)).run();
  if (result.changes === 0) throw new NotFoundError('Signal introuvable');
}
