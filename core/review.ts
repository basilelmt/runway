import type {
  MonthReview,
  ReviewControl,
  ReviewEnvelopeLine,
  ReviewMonthFigures,
  ReviewProposal,
  ReviewRemainder,
} from '@shared/api-types';
import { addMonths, endOfMonth, monthKey, startOfMonth, type ISODate } from '@shared/dates';
import type { Cents } from '@shared/money';
import type { AppliedReview, RecurringRule } from '@shared/schemas';
import { computeBalances } from './balances';
import { monthActivity, savedInMonth, withBudgets } from './budget';
import type { State } from './types';

/** Seuils en-dessous desquels une proposition de complément n'a pas lieu d'être. */
const PROPOSAL_MIN_DIFF = 20_00;
const PROPOSAL_MIN_SHARE = 0.15;

/** Bilan déjà validé, tel que lu en base (table `month_reviews`), pour savoir si `month` en fait partie. */
export type ReviewRecord = { month: string; reviewedAt: string; applied: AppliedReview };

/** État nécessaire au bilan : celui du moteur, plus les bilans déjà validés. */
export type ReviewState = Pick<State, 'accounts' | 'envelopes' | 'transactions'> & { reviews: ReviewRecord[] };

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2) : sorted[mid]!;
}

/** Arrondi à la dizaine d'euros supérieure. */
function roundUpToTens(cents: Cents): Cents {
  return Math.ceil(cents / 1000) * 1000;
}

/** Plus ancienne date de toutes les opérations de la base, ou `null` si elle est vide. */
function firstOperationDate(transactions: State['transactions']): ISODate | null {
  return transactions.reduce<ISODate | null>((min, t) => (min === null || t.date < min ? t.date : min), null);
}

/** Dépenses confirmées hors épargne, à trier comprises, du mois de `month` (`AAAA-MM`). */
function totalSpentInMonth(envelopes: State['envelopes'], transactions: State['transactions'], month: string): Cents {
  const savings = new Set(envelopes.filter((e) => e.isSavings).map((e) => e.id));
  const from = startOfMonth(`${month}-01`);
  const to = endOfMonth(`${month}-01`);
  let total = 0;
  for (const t of transactions) {
    if (t.kind !== 'expense' || t.status !== 'confirmed' || t.date < from || t.date > to) continue;
    if (t.envelopeId != null && savings.has(t.envelopeId)) continue;
    total += t.amount;
  }
  return total;
}

function totalIncomeInMonth(transactions: State['transactions'], month: string): Cents {
  const from = startOfMonth(`${month}-01`);
  const to = endOfMonth(`${month}-01`);
  let total = 0;
  for (const t of transactions) {
    if (t.kind !== 'income' || t.status !== 'confirmed' || t.date < from || t.date > to) continue;
    total += t.amount;
  }
  return total;
}

/** Dépenses courantes (hors charge fixe) d'une enveloppe sur le mois de `month`. */
function currentSpendInMonth(transactions: State['transactions'], envelopeId: number, month: string): Cents {
  const from = startOfMonth(`${month}-01`);
  const to = endOfMonth(`${month}-01`);
  let total = 0;
  for (const t of transactions) {
    if (t.kind !== 'expense' || t.status !== 'confirmed' || t.envelopeId !== envelopeId || t.recurringRuleId != null) continue;
    if (t.date < from || t.date > to) continue;
    total += t.amount;
  }
  return total;
}

/** `month` et les deux mois précédents, du plus ancien au plus récent. */
function lastThreeMonths(month: string): string[] {
  const start = `${month}-01`;
  return [monthKey(addMonths(start, -2)), monthKey(addMonths(start, -1)), month];
}

/**
 * Bilan du mois passé en revue : chiffres, enveloppes, propositions de complément, contrôle d'ensemble,
 * restes à verser et statut de validation. Fonction pure : `today` sert à calculer le budget courant
 * (section « Contrôle d'ensemble », un complément modifié vaut à partir d'aujourd'hui) et les restes.
 */
export function monthReview(state: ReviewState, rules: RecurringRule[], month: string, today: ISODate): MonthReview {
  const { accounts, envelopes, transactions, reviews } = state;

  const figures: ReviewMonthFigures = {
    income: totalIncomeInMonth(transactions, month),
    spent: totalSpentInMonth(envelopes, transactions, month),
    saved: savedInMonth(accounts, envelopes, transactions, `${month}-01`),
  };

  // Enveloppes : budget du mois passé en revue (charges de l'époque, complément actuel faute d'historique).
  const budgetedThen = withBudgets(envelopes, rules, `${month}-01`);
  const { spent: spentMap } = monthActivity(transactions, `${month}-01`);
  const envelopeLines: ReviewEnvelopeLine[] = budgetedThen
    .filter((e) => !e.archived)
    .map((e) => {
      const spent = spentMap.get(e.id) ?? 0;
      return { envelopeId: e.id, name: e.name, color: e.color, isSavings: e.isSavings, budget: e.monthlyBudget, spent, gap: spent - e.monthlyBudget };
    })
    .filter((l) => l.budget > 0 || l.spent > 0)
    .sort((a, b) => {
      const aOver = a.gap > 0;
      const bOver = b.gap > 0;
      if (aOver !== bOver) return aOver ? -1 : 1;
      if (aOver) return b.gap - a.gap;
      return 0;
    });

  // Propositions : médiane des dépenses courantes des mois dont la base a déjà des opérations.
  const months = lastThreeMonths(month);
  const firstDate = firstOperationDate(transactions);
  const validMonths = firstDate === null ? months : months.filter((m) => m >= monthKey(firstDate));
  const proposals: ReviewProposal[] = [];
  if (validMonths.length >= 2) {
    for (const e of envelopes) {
      if (e.archived || e.isSavings) continue;
      const monthsSpent = validMonths.map((m) => currentSpendInMonth(transactions, e.id, m));
      const proposedExtra = roundUpToTens(median(monthsSpent));
      const current = e.monthlyExtra ?? 0;
      const diff = Math.abs(proposedExtra - current);
      const share15 = current > 0 ? current * PROPOSAL_MIN_SHARE : 0;
      if (diff > PROPOSAL_MIN_DIFF && diff > share15) {
        proposals.push({ envelopeId: e.id, name: e.name, currentExtra: e.monthlyExtra, proposedExtra, monthsSpent });
      }
    }
  }

  // Contrôle d'ensemble : budget du mois courant (aujourd'hui), face au revenu médian des mêmes 3 mois.
  const budgetedToday = withBudgets(envelopes, rules, today).filter((e) => !e.archived);
  const control: ReviewControl = {
    envelopes: budgetedToday.map((e) => ({ envelopeId: e.id, monthlyCharges: e.monthlyCharges, monthlyBudget: e.monthlyBudget })),
    medianIncome: median(validMonths.length > 0 ? validMonths.map((m) => totalIncomeInMonth(transactions, m)) : [0]),
  };

  // Restes : seulement pour le bilan non encore validé du mois qui précède directement aujourd'hui.
  const record = reviews.find((r) => r.month === month);
  const previousMonth = monthKey(addMonths(`${monthKey(today)}-01`, -1));
  let remainders: ReviewRemainder[] | null = null;
  if (!record && month === previousMonth) {
    const balances = computeBalances(state, today);
    remainders = envelopes
      .filter((e) => !e.archived && !e.isSavings)
      .map((e) => ({ envelopeId: e.id, name: e.name, color: e.color, amount: balances.envelopes[e.id] ?? 0 }))
      .filter((r) => r.amount > 0);
  }

  return {
    month,
    figures,
    envelopes: envelopeLines,
    proposals,
    control,
    remainders,
    status: record ? { validated: true, reviewedAt: record.reviewedAt, applied: record.applied } : { validated: false, reviewedAt: null, applied: null },
  };
}
