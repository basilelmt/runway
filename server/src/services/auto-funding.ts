import { computeBalances } from '@core/balances';
import { monthActivity, planAutoFunding } from '@core/budget';
import { addMonths, formatMonth, monthKey, startOfMonth } from '@shared/dates';
import type { Funding } from '@shared/schemas';
import type { Db } from '../db/client';
import { createFunding, findFundingBySource } from '../repos/fundings';
import { getRule } from '../repos/recurring-rules';
import { createTransaction, getTransaction } from '../repos/transactions';
import { loadState } from './state';

/**
 * Après la confirmation d'une opération : si c'est l'occurrence d'un revenu qui déclenche la répartition,
 * complète les enveloppes jusqu'à leur budget du mois financé. Une seule fois par revenu, même après annulation.
 * À appeler dans la transaction qui confirme, une fois toutes les opérations du lot écrites.
 */
export function autoFund(db: Db, transactionId: number): Funding | null {
  const source = getTransaction(db, transactionId);
  if (source.kind !== 'income' || source.status !== 'confirmed' || source.recurringRuleId == null) return null;
  const rule = getRule(db, source.recurringRuleId);
  if (!rule.triggersFunding || findFundingBySource(db, source.id)) return null;

  const date = rule.fundsNextMonth ? addMonths(startOfMonth(source.date), 1) : source.date;
  const state = loadState(db);
  const { toAllocate } = computeBalances(state, date);
  const plan = planAutoFunding(state.envelopes, monthActivity(state.transactions, date).allocated, toAllocate);
  if (plan.items.length === 0) return null;

  const month = monthKey(date);
  const funding = createFunding(db, { sourceTransactionId: source.id, month, shortfallCount: plan.shortfallCount });
  const label = `Budget ${formatMonth(month)}`;
  for (const item of plan.items) {
    createTransaction(db, { kind: 'allocation', date, amount: item.amount, label, envelopeId: item.envelopeId, fundingId: funding.id });
  }
  return funding;
}
