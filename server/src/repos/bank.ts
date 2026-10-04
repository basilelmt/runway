import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { bankAccounts, bankConnections } from '../db/schema';
import { NotFoundError } from '../errors';

export type BankConnection = typeof bankConnections.$inferSelect;
export type BankAccount = typeof bankAccounts.$inferSelect;

export function listConnections(db: Db): BankConnection[] {
  return db.select().from(bankConnections).orderBy(asc(bankConnections.id)).all();
}

export function getConnection(db: Db, id: number): BankConnection {
  const row = db.select().from(bankConnections).where(eq(bankConnections.id, id)).get();
  if (!row) throw new NotFoundError('Connexion bancaire introuvable');
  return row;
}

export function createConnection(db: Db, input: { aspspName: string; aspspCountry: string; state: string }): BankConnection {
  return db.insert(bankConnections).values(input).returning().get();
}

export function updateConnection(db: Db, id: number, patch: Partial<Omit<BankConnection, 'id' | 'createdAt'>>): BankConnection {
  const row = db.update(bankConnections).set(patch).where(eq(bankConnections.id, id)).returning().get();
  if (!row) throw new NotFoundError('Connexion bancaire introuvable');
  return row;
}

/** Une seule autorisation à la fois : les connexions jamais terminées sont jetées. */
export function deletePendingConnections(db: Db): void {
  db.delete(bankConnections).where(eq(bankConnections.status, 'pending')).run();
}

export function listBankAccounts(db: Db, connectionId: number): BankAccount[] {
  return db.select().from(bankAccounts).where(eq(bankAccounts.connectionId, connectionId)).orderBy(asc(bankAccounts.id)).all();
}

export function getBankAccount(db: Db, id: number): BankAccount {
  const row = db.select().from(bankAccounts).where(eq(bankAccounts.id, id)).get();
  if (!row) throw new NotFoundError('Compte bancaire introuvable');
  return row;
}

/**
 * Enregistre un compte renvoyé par la banque. Un compte déjà connu de la connexion (même IBAN,
 * sinon même uid) garde sa liaison et ses dates : seuls `uid` et `bankName` sont rafraîchis.
 */
export function upsertBankAccount(
  db: Db,
  input: { connectionId: number; uid: string; iban: string | null; bankName: string; accountId: number | null },
): BankAccount {
  const byIban = input.iban
    ? db.select().from(bankAccounts).where(and(eq(bankAccounts.connectionId, input.connectionId), eq(bankAccounts.iban, input.iban))).get()
    : undefined;
  const existing = byIban ?? db.select().from(bankAccounts).where(and(eq(bankAccounts.connectionId, input.connectionId), eq(bankAccounts.uid, input.uid))).get();
  if (existing) {
    return db
      .update(bankAccounts)
      .set({ uid: input.uid, bankName: input.bankName, iban: input.iban ?? existing.iban, accountId: existing.accountId ?? input.accountId })
      .where(eq(bankAccounts.id, existing.id))
      .returning()
      .get();
  }
  return db.insert(bankAccounts).values(input).returning().get();
}

export function updateBankAccount(db: Db, id: number, patch: Partial<Omit<BankAccount, 'id' | 'connectionId'>>): BankAccount {
  const row = db.update(bankAccounts).set(patch).where(eq(bankAccounts.id, id)).returning().get();
  if (!row) throw new NotFoundError('Compte bancaire introuvable');
  return row;
}
