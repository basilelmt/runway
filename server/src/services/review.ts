import { eq } from 'drizzle-orm';
import { computeBalances } from '@core/balances';
import { monthReview } from '@core/review';
import type { MonthReview } from '@shared/api-types';
import { formatMonth, monthKey, type ISODate } from '@shared/dates';
import type { AppliedReview, ReviewApply } from '@shared/schemas';
import type { Db } from '../db/client';
import { transactions } from '../db/schema';
import { BadRequestError, ConflictError, NotFoundError } from '../errors';
import { createTransaction } from '../repos/transactions';
import { getEnvelope, updateEnvelope } from '../repos/envelopes';
import { createReview, deleteReview, getReview, listReviews } from '../repos/reviews';
import { loadState } from './state';

function assertPastMonth(month: string, today: ISODate): void {
  if (month >= monthKey(today)) throw new BadRequestError('Le bilan ne porte que sur un mois déjà passé');
}

/** Bilan du mois `month`, calculé par `core/review.ts` à partir de l'état courant et des bilans déjà validés. */
export function buildReview(db: Db, month: string, today: ISODate): MonthReview {
  assertPastMonth(month, today);
  const state = loadState(db, today);
  return monthReview({ ...state, reviews: listReviews(db) }, state.rules, month, today);
}

/**
 * Valide le bilan : applique les compléments et les versements dans une transaction SQLite,
 * puis enregistre la ligne `month_reviews`. Un versement invalide n'applique aucun budget :
 * tout est vérifié avant d'écrire quoi que ce soit.
 */
export function applyReview(db: Db, month: string, today: ISODate, input: ReviewApply): MonthReview {
  assertPastMonth(month, today);
  if (getReview(db, month)) throw new ConflictError('Ce bilan est déjà validé');

  const state = loadState(db, today);
  const envelopesById = new Map(state.envelopes.map((e) => [e.id, e]));
  const balances = computeBalances(state, today);

  for (const b of input.budgets) {
    if (!envelopesById.has(b.envelopeId)) throw new NotFoundError('Enveloppe introuvable');
  }
  // Solde restant de chaque enveloppe source, décrémenté au fil des versements : plusieurs versements
  // depuis la même enveloppe ne peuvent pas ensemble dépasser son solde actuel.
  const remaining = new Map<number, number>();
  for (const t of input.transfers) {
    const from = envelopesById.get(t.fromEnvelopeId);
    const to = envelopesById.get(t.toEnvelopeId);
    if (!from) throw new NotFoundError('Enveloppe source introuvable');
    if (!to || to.archived || !to.isSavings) throw new BadRequestError('Le versement doit aller vers une enveloppe d’épargne non archivée');
    const left = remaining.get(from.id) ?? balances.envelopes[from.id] ?? 0;
    if (t.amount > left) throw new BadRequestError(`Le versement dépasse le solde de ${from.name}`);
    remaining.set(from.id, left - t.amount);
  }

  const appliedBudgets: AppliedReview['budgets'] = input.budgets.map((b) => ({ envelopeId: b.envelopeId, before: envelopesById.get(b.envelopeId)!.monthlyExtra, after: b.monthlyExtra }));
  const allocationIds: number[] = [];
  const reviewedAt = new Date().toISOString();
  const label = `Bilan de ${formatMonth(month)}`;

  db.transaction((tx) => {
    for (const b of input.budgets) updateEnvelope(tx as unknown as Db, b.envelopeId, { monthlyExtra: b.monthlyExtra });
    for (const t of input.transfers) {
      const created = createTransaction(tx as unknown as Db, { kind: 'allocation', date: today, amount: t.amount, label, envelopeId: t.toEnvelopeId, fromEnvelopeId: t.fromEnvelopeId });
      allocationIds.push(created.id);
    }
    createReview(tx as unknown as Db, month, reviewedAt, { budgets: appliedBudgets, allocationIds });
  });

  return buildReview(db, month, today);
}

/**
 * Annule le bilan : remet chaque complément à sa valeur d'avant, sauf s'il a changé depuis
 * (la valeur actuelle n'est alors pas écrasée, et son nom revient dans `skipped`), supprime les
 * versements créés, puis la ligne `month_reviews`.
 */
export function cancelReview(db: Db, month: string): { skipped: { envelopeId: number; name: string }[] } {
  const review = getReview(db, month);
  if (!review) throw new NotFoundError('Bilan introuvable');
  const skipped: { envelopeId: number; name: string }[] = [];

  db.transaction((tx) => {
    for (const b of review.applied.budgets) {
      const envelope = getEnvelope(tx as unknown as Db, b.envelopeId);
      if (envelope.monthlyExtra === b.after) updateEnvelope(tx as unknown as Db, b.envelopeId, { monthlyExtra: b.before });
      else skipped.push({ envelopeId: b.envelopeId, name: envelope.name });
    }
    for (const id of review.applied.allocationIds) tx.delete(transactions).where(eq(transactions.id, id)).run();
    deleteReview(tx as unknown as Db, month);
  });

  return { skipped };
}
