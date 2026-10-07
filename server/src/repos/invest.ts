import { and, asc, eq } from 'drizzle-orm';
import type { TradeInput, TradePatch } from '@shared/schemas';
import type { Db } from '../db/client';
import { holdingTrades, holdings } from '../db/schema';
import { NotFoundError } from '../errors';

export type HoldingRow = typeof holdings.$inferSelect;
export type TradeRow = typeof holdingTrades.$inferSelect;

export function listHoldings(db: Db): HoldingRow[] {
  return db.select().from(holdings).orderBy(asc(holdings.createdAt), asc(holdings.id)).all();
}

export function getHolding(db: Db, id: number): HoldingRow {
  const row = db.select().from(holdings).where(eq(holdings.id, id)).get();
  if (!row) throw new NotFoundError('Position introuvable');
  return row;
}

export function createHolding(
  db: Db,
  input: { platform: HoldingRow['platform']; ticker: string; name: string; source: 'manual' | 'binance'; externalAsset?: string | null },
): HoldingRow {
  return db
    .insert(holdings)
    .values({
      platform: input.platform,
      ticker: input.ticker,
      name: input.name,
      source: input.source,
      externalAsset: input.externalAsset ?? null,
    })
    .returning()
    .get();
}

export function findBinanceHolding(db: Db, asset: string): HoldingRow | null {
  return db.select().from(holdings).where(and(eq(holdings.source, 'binance'), eq(holdings.externalAsset, asset))).get() ?? null;
}

export function setSyncedQuantity(db: Db, id: number, quantity: string): void {
  db.update(holdings).set({ syncedQuantity: quantity }).where(eq(holdings.id, id)).run();
}

export function deleteHolding(db: Db, id: number): void {
  db.delete(holdings).where(eq(holdings.id, id)).run();
}

export function deleteBinanceHoldings(db: Db): void {
  db.delete(holdings).where(eq(holdings.source, 'binance')).run();
}

export function listTrades(db: Db, holdingId?: number): TradeRow[] {
  const order = [asc(holdingTrades.date), asc(holdingTrades.id)] as const;
  if (holdingId === undefined) return db.select().from(holdingTrades).orderBy(...order).all();
  return db.select().from(holdingTrades).where(eq(holdingTrades.holdingId, holdingId)).orderBy(...order).all();
}

export function getTrade(db: Db, id: number): TradeRow {
  const row = db.select().from(holdingTrades).where(eq(holdingTrades.id, id)).get();
  if (!row) throw new NotFoundError('Mouvement introuvable');
  return row;
}

export function addTrade(
  db: Db,
  holdingId: number,
  input: TradeInput & { source?: 'manual' | 'binance'; externalId?: string | null },
): TradeRow | null {
  getHolding(db, holdingId);
  return (
    db
      .insert(holdingTrades)
      .values({
        holdingId,
        side: input.side,
        date: input.date,
        quantity: input.quantity,
        amount: input.amount,
        fees: input.fees,
        source: input.source ?? 'manual',
        externalId: input.externalId ?? null,
      })
      .onConflictDoNothing({ target: holdingTrades.externalId })
      .returning()
      .get() ?? null
  );
}

export function updateTrade(db: Db, id: number, patch: TradePatch): TradeRow {
  getTrade(db, id);
  const set: Partial<typeof holdingTrades.$inferInsert> = {};
  if (patch.side !== undefined) set.side = patch.side;
  if (patch.date !== undefined) set.date = patch.date;
  if (patch.quantity !== undefined) set.quantity = patch.quantity;
  if (patch.amount !== undefined) set.amount = patch.amount;
  if (patch.fees !== undefined) set.fees = patch.fees;
  if (Object.keys(set).length === 0) return getTrade(db, id);
  return db.update(holdingTrades).set(set).where(eq(holdingTrades.id, id)).returning().get()!;
}

export function deleteTrade(db: Db, id: number): void {
  db.delete(holdingTrades).where(eq(holdingTrades.id, id)).run();
}
