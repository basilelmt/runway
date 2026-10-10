import { and, asc, desc, eq, gte, inArray, isNull } from 'drizzle-orm';
import { merchantDisplayName } from '@core/merchants';
import type { AdvanceView, PersonAdvancesSummary } from '@shared/api-types';
import { addDays, type ISODate } from '@shared/dates';
import type { Advance, AdvanceLineInput } from '@shared/schemas';
import type { Db } from '../db/client';
import { advances, envelopes, merchants, transactions } from '../db/schema';
import { BadRequestError, NotFoundError } from '../errors';
import { getTransaction } from './transactions';

/**
 * Un revenu sans enveloppe des `days` derniers jours, candidat à un rapprochement.
 * `label` (libellé bancaire brut) sert au rapprochement par mot commun avec le nom de la personne ;
 * `displayLabel` (nom du marchand s'il y en a un) est celui montré à l'écran.
 */
export type IncomeCandidate = { id: number; label: string; displayLabel: string; amount: number; date: ISODate };

const openClause = and(isNull(advances.refundId), isNull(advances.settledAt))!;

/** Nom affiché d'une opération jointe aux marchands : le marchand s'il y en a un, le libellé brut sinon. */
function resolveLabel(row: { label: string; merchantKey: string | null; merchantName: string | null }): string {
  return merchantDisplayName(row.merchantKey, row.merchantName, row.label) ?? row.label;
}

export function getAdvance(db: Db, id: number): Advance {
  const row = db.select().from(advances).where(eq(advances.id, id)).get();
  if (!row) throw new NotFoundError('Avance introuvable');
  return row;
}

/** Avances d'une dépense, ouvertes ou soldées. */
export function listAdvancesForExpense(db: Db, expenseId: number): Advance[] {
  return db.select().from(advances).where(eq(advances.expenseId, expenseId)).orderBy(asc(advances.id)).all();
}

/**
 * Remplace les lignes ouvertes d'une dépense (les avances déjà soldées sont conservées, elles sont de l'historique).
 * La somme des avances, soldées comprises, ne peut pas dépasser le montant de la dépense.
 */
export function replaceAdvances(db: Db, expenseId: number, lines: AdvanceLineInput[]): Advance[] {
  const expense = getTransaction(db, expenseId);
  if (expense.kind !== 'expense') throw new BadRequestError('Seule une dépense porte des avances');
  const current = listAdvancesForExpense(db, expenseId);
  const settled = current.filter((a) => a.refundId !== null || a.settledAt !== null);
  const settledTotal = settled.reduce((s, a) => s + a.amount, 0);
  const newTotal = lines.reduce((s, l) => s + l.amount, 0);
  if (settledTotal + newTotal > expense.amount) {
    throw new BadRequestError('La somme des avances dépasse le montant de la dépense');
  }
  return db.transaction((tx) => {
    const t = tx as unknown as Db;
    t.delete(advances).where(and(eq(advances.expenseId, expenseId), openClause)).run();
    for (const line of lines) t.insert(advances).values({ expenseId, person: line.person, amount: line.amount }).run();
    return listAdvancesForExpense(t, expenseId);
  });
}

/**
 * Solde des avances ouvertes : avec un remboursement (`refundId`), sans (date du jour dans `settledAt`).
 * Avec un remboursement, range celui-ci dans l'enveloppe de la dépense s'il n'en avait pas encore
 * et que toutes les avances soldées pointent vers la même enveloppe.
 */
export function settleAdvances(db: Db, advanceIds: number[], refundId: number | null): Advance[] {
  const rows = db.select().from(advances).where(inArray(advances.id, advanceIds)).all();
  if (rows.length !== advanceIds.length) throw new NotFoundError('Avance introuvable');
  if (rows.some((a) => a.refundId !== null || a.settledAt !== null)) throw new BadRequestError('Une avance déjà soldée ne peut pas être resoldée');

  return db.transaction((tx) => {
    const t = tx as unknown as Db;
    if (refundId !== null) {
      const refund = getTransaction(t, refundId);
      if (refund.kind !== 'income') throw new BadRequestError('Le remboursement doit être un revenu');
      t.update(advances).set({ refundId }).where(inArray(advances.id, advanceIds)).run();
      if (refund.envelopeId === null) {
        const expenseIds = [...new Set(rows.map((a) => a.expenseId))];
        const expenseEnvelopes = new Set(
          t
            .select({ envelopeId: transactions.envelopeId })
            .from(transactions)
            .where(inArray(transactions.id, expenseIds))
            .all()
            .map((e) => e.envelopeId)
            .filter((id): id is number => id !== null),
        );
        if (expenseEnvelopes.size === 1) {
          t.update(transactions).set({ envelopeId: [...expenseEnvelopes][0] }).where(eq(transactions.id, refundId)).run();
        }
      }
    } else {
      t.update(advances).set({ settledAt: new Date().toISOString() }).where(inArray(advances.id, advanceIds)).run();
    }
    return t.select().from(advances).where(inArray(advances.id, advanceIds)).all();
  });
}

export function reopenAdvance(db: Db, id: number): Advance {
  getAdvance(db, id);
  db.update(advances).set({ refundId: null, settledAt: null }).where(eq(advances.id, id)).run();
  return getAdvance(db, id);
}

/** Avances (ouvertes, ou toutes), avec leur dépense et leur remboursement, les plus récentes d'abord. */
export function listAdvanceViews(db: Db, status: 'open' | 'all', expenseId?: number): AdvanceView[] {
  const statusClause = status === 'open' ? openClause : undefined;
  const clause = expenseId === undefined ? statusClause : statusClause ? and(statusClause, eq(advances.expenseId, expenseId)) : eq(advances.expenseId, expenseId);
  const rows = clause ? db.select().from(advances).where(clause).all() : db.select().from(advances).all();
  if (rows.length === 0) return [];

  const txIds = [...new Set(rows.flatMap((r) => [r.expenseId, r.refundId]).filter((id): id is number => id !== null))];
  const txRows = db
    .select({ id: transactions.id, date: transactions.date, label: transactions.label, envelopeId: transactions.envelopeId, merchantKey: transactions.merchantKey, merchantName: merchants.name })
    .from(transactions)
    .leftJoin(merchants, eq(merchants.key, transactions.merchantKey))
    .where(inArray(transactions.id, txIds))
    .all();
  const txById = new Map(txRows.map((t) => [t.id, t]));

  const envelopeIds = [...new Set(txRows.map((t) => t.envelopeId).filter((id): id is number => id !== null))];
  const envNameById = new Map(
    envelopeIds.length ? db.select({ id: envelopes.id, name: envelopes.name }).from(envelopes).where(inArray(envelopes.id, envelopeIds)).all().map((e) => [e.id, e.name]) : [],
  );

  return rows
    .map((r): AdvanceView => {
      const expense = txById.get(r.expenseId)!;
      const refund = r.refundId !== null ? txById.get(r.refundId) ?? null : null;
      return {
        id: r.id,
        person: r.person,
        amount: r.amount,
        expense: {
          id: expense.id,
          date: expense.date,
          label: resolveLabel(expense),
          envelopeId: expense.envelopeId,
          envelopeName: expense.envelopeId !== null ? envNameById.get(expense.envelopeId) ?? null : null,
        },
        refund: refund ? { id: refund.id, date: refund.date, label: resolveLabel(refund) } : null,
        settledAt: r.settledAt,
        createdAt: r.createdAt,
      };
    })
    .sort((a, b) => (a.expense.date < b.expense.date ? 1 : a.expense.date > b.expense.date ? -1 : b.id - a.id));
}

/** Par personne, total des avances ouvertes et date de la plus vieille, les plus anciennes d'abord. */
export function listPersonSummaries(db: Db): PersonAdvancesSummary[] {
  const rows = db.select().from(advances).where(openClause).all();
  const byPerson = new Map<string, Advance[]>();
  for (const r of rows) byPerson.set(r.person, [...(byPerson.get(r.person) ?? []), r]);
  const summaries: PersonAdvancesSummary[] = [...byPerson.entries()].map(([person, list]) => ({
    person,
    totalOpen: list.reduce((s, a) => s + a.amount, 0),
    oldestOpenDate: list.reduce((oldest, a) => (a.createdAt < oldest ? a.createdAt : oldest), list[0]!.createdAt),
    openCount: list.length,
  }));
  summaries.sort((a, b) => (a.oldestOpenDate < b.oldestOpenDate ? -1 : 1));
  return summaries;
}

/** Avances ouvertes jointes à leur dépense, pour les rapprochements proposés. */
export function listOpenAdvancesWithExpense(db: Db): { id: number; person: string; amount: number; expenseId: number; expenseLabel: string; expenseDate: ISODate }[] {
  const rows = db.select().from(advances).where(openClause).all();
  if (rows.length === 0) return [];
  const expenseIds = [...new Set(rows.map((r) => r.expenseId))];
  const txById = new Map(
    db
      .select({ id: transactions.id, date: transactions.date, label: transactions.label, merchantKey: transactions.merchantKey, merchantName: merchants.name })
      .from(transactions)
      .leftJoin(merchants, eq(merchants.key, transactions.merchantKey))
      .where(inArray(transactions.id, expenseIds))
      .all()
      .map((t) => [t.id, t]),
  );
  return rows.map((r) => {
    const expense = txById.get(r.expenseId)!;
    return { id: r.id, person: r.person, amount: r.amount, expenseId: r.expenseId, expenseLabel: resolveLabel(expense), expenseDate: expense.date };
  });
}

/** Revenus confirmés sans enveloppe, des `windowDays` derniers jours : candidats à un rapprochement. */
export function listUnsortedIncomeCandidates(db: Db, today: ISODate, windowDays: number): IncomeCandidate[] {
  return db
    .select({
      id: transactions.id,
      label: transactions.label,
      amount: transactions.amount,
      date: transactions.date,
      merchantKey: transactions.merchantKey,
      merchantName: merchants.name,
    })
    .from(transactions)
    .leftJoin(merchants, eq(merchants.key, transactions.merchantKey))
    .where(and(eq(transactions.kind, 'income'), eq(transactions.status, 'confirmed'), isNull(transactions.envelopeId), gte(transactions.date, addDays(today, -windowDays))))
    .orderBy(desc(transactions.date))
    .all()
    .map((r) => ({ id: r.id, label: r.label, displayLabel: resolveLabel(r), amount: r.amount, date: r.date }));
}
