import { asc, eq } from 'drizzle-orm';
import type { RecurringRule, RecurringRuleInput } from '@shared/schemas';
import type { Db } from '../db/client';
import { recurringRules } from '../db/schema';
import { NotFoundError } from '../errors';

function toRow(input: RecurringRuleInput): typeof recurringRules.$inferInsert {
  return {
    name: input.name,
    kind: input.kind,
    amount: input.amount,
    label: input.label,
    accountId: input.accountId ?? null,
    toAccountId: input.toAccountId ?? null,
    envelopeId: input.envelopeId ?? null,
    fromEnvelopeId: input.fromEnvelopeId ?? null,
    frequency: input.frequency,
    interval: input.interval,
    dayOfMonth: input.dayOfMonth ?? null,
    startDate: input.startDate,
    endDate: input.endDate ?? null,
    active: input.active,
  };
}

export function listRules(db: Db): RecurringRule[] {
  return db.select().from(recurringRules).orderBy(asc(recurringRules.name)).all();
}

export function getRule(db: Db, id: number): RecurringRule {
  const row = db.select().from(recurringRules).where(eq(recurringRules.id, id)).get();
  if (!row) throw new NotFoundError('Règle introuvable');
  return row;
}

export function createRule(db: Db, input: RecurringRuleInput): RecurringRule {
  return db.insert(recurringRules).values(toRow(input)).returning().get();
}

export function updateRule(db: Db, id: number, input: RecurringRuleInput): RecurringRule {
  getRule(db, id);
  return db.update(recurringRules).set(toRow(input)).where(eq(recurringRules.id, id)).returning().get()!;
}

export function setRuleActive(db: Db, id: number, active: boolean): RecurringRule {
  getRule(db, id);
  return db.update(recurringRules).set({ active }).where(eq(recurringRules.id, id)).returning().get()!;
}

export function setLastGenerated(db: Db, id: number, date: string): void {
  db.update(recurringRules).set({ lastGeneratedDate: date }).where(eq(recurringRules.id, id)).run();
}

export function deleteRule(db: Db, id: number): void {
  const result = db.delete(recurringRules).where(eq(recurringRules.id, id)).run();
  if (result.changes === 0) throw new NotFoundError('Règle introuvable');
}
