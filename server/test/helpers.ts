import { openDb, type Db } from '../src/db/client';
import { createAccount } from '../src/repos/accounts';
import { createEnvelope } from '../src/repos/envelopes';
import type { Account, Envelope } from '@shared/schemas';

export type TestContext = {
  db: Db;
  courant: Account;
  livret: Account;
  courses: Envelope;
  loisirs: Envelope;
};

/** Base mémoire avec un compte courant (1 000 €), un livret hors budget et deux enveloppes. */
export function createTestDb(): TestContext {
  const db = openDb(':memory:');
  const courant = createAccount(db, { name: 'Courant', initialBalance: 1000_00, onBudget: true });
  const livret = createAccount(db, { name: 'Livret', initialBalance: 0, onBudget: false });
  const courses = createEnvelope(db, { name: 'Courses', color: '#4f8a5b' });
  const loisirs = createEnvelope(db, { name: 'Loisirs', color: '#c2703d' });
  return { db, courant, livret, courses, loisirs };
}
