import { asc, eq } from 'drizzle-orm';
import type { Account, AccountInput, AccountPatch } from '@shared/schemas';
import type { Db } from '../db/client';
import { accounts } from '../db/schema';
import { NotFoundError } from '../errors';

export function listAccounts(db: Db, { includeArchived = false } = {}): Account[] {
  const rows = db.select().from(accounts).orderBy(asc(accounts.createdAt), asc(accounts.id)).all();
  return includeArchived ? rows : rows.filter((a) => !a.archived);
}

export function getAccount(db: Db, id: number): Account {
  const row = db.select().from(accounts).where(eq(accounts.id, id)).get();
  if (!row) throw new NotFoundError('Compte introuvable');
  return row;
}

export function findAccountByBankNumber(db: Db, bankAccountNumber: string): Account | null {
  return db.select().from(accounts).where(eq(accounts.bankAccountNumber, bankAccountNumber)).get() ?? null;
}

export function createAccount(db: Db, input: AccountInput): Account {
  return db
    .insert(accounts)
    .values({
      name: input.name,
      initialBalance: input.initialBalance,
      onBudget: input.onBudget,
      bankAccountNumber: input.bankAccountNumber ?? null,
    })
    .returning()
    .get();
}

export function updateAccount(db: Db, id: number, input: AccountPatch): Account {
  getAccount(db, id);
  const patch: Partial<typeof accounts.$inferInsert> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.initialBalance !== undefined) patch.initialBalance = input.initialBalance;
  if (input.onBudget !== undefined) patch.onBudget = input.onBudget;
  if (input.bankAccountNumber !== undefined) patch.bankAccountNumber = input.bankAccountNumber;
  if (input.archived !== undefined) patch.archived = input.archived;
  if (Object.keys(patch).length === 0) return getAccount(db, id);
  return db.update(accounts).set(patch).where(eq(accounts.id, id)).returning().get()!;
}
