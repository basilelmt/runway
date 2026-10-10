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

/**
 * Dépenses confirmées hors épargne, à trier comprises, du mois de `month` (`AAAA-MM`), remboursements
 * déduits enveloppe par enveloppe (jamais sous zéro, comme `monthActivity`) : un avoir rangé dans une
 * enveloppe doit réduire le dépensé du bilan comme il réduit celui du Budget et de l'Analyse.
 */
function totalSpentInMonth(envelopes: State['envelopes'], transactions: State['transactions'], month: string): Cents {
  const from = startOfMonth(`${month}-01`);
  const to = endOfMonth(`${month}-01`);
  const { spent: spentMap } = monthActivity(transactions, `${month}-01`);
  let total = 0;
  for (const e of envelopes) {
    if (e.isSavings) continue;
    total += spentMap.get(e.id) ?? 0;
  }
  for (const t of transactions) {
    if (t.kind !== 'expense' || t.status !== 'confirmed' || t.date < from || t.date > to || t.envelopeId != null) continue;
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

/** `month` et les deux mois précédents, du plus ancien au plus récent. */
function lastThreeMonths(month: string): string[] {
  const start = `${month}-01`;
  return [monthKey(addMonths(start, -2)), monthKey(addMonths(start, -1)), month];
}

/**
 * Reste de `month` réellement versable, pour chaque enveloppe : ce qui en restait à la fin de ce mois-là
 * (après le report de fin de mois, qui annule un éventuel négatif), et qui y est encore aujourd'hui.
 * Le minimum des deux soldes : le solde d'aujourd'hui seul contient aussi ce qui a été reversé depuis
 * (budget du mois courant, provisions pour des charges à venir), que verser viderait à tort.
 */
export function versableRemainders(state: Pick<State, 'accounts' | 'envelopes' | 'transactions'>, month: string, today: ISODate): Map<number, Cents> {
  const cutoff = endOfMonth(`${month}-01`);
  const untilCutoff = state.transactions.filter((t) => t.date <= cutoff);
  // `asOf` au 1er du mois suivant, pas à `cutoff` lui-même : sans ça, le report de fin de mois (qui n'a
  // lieu qu'en entrant dans le mois suivant) ne s'applique pas, et une enveloppe dépassée reste négative.
  const nextMonthStart = startOfMonth(addMonths(cutoff, 1));
  const endOfMonthBalances = computeBalances({ ...state, transactions: untilCutoff }, nextMonthStart).envelopes;
  const todayBalances = computeBalances(state, today).envelopes;
  const result = new Map<number, Cents>();
  for (const e of state.envelopes) {
    result.set(e.id, Math.max(0, Math.min(endOfMonthBalances[e.id] ?? 0, todayBalances[e.id] ?? 0)));
  }
  return result;
}

/**
 * Bilan du mois passé en revue : chiffres, enveloppes, propositions de complément, contrôle d'ensemble,
 * restes à verser et statut de validation. Fonction pure.
 *
 * Faute d'historique des budgets, le budget d'une enveloppe (section Enveloppes et Contrôle d'ensemble)
 * est toujours celui d'aujourd'hui (`today`) : ses charges fixes actuelles, sans tenir compte de leur
 * date de départ, plus son complément actuel. Une charge créée après coup (reprise d'un historique importé)
 * compte donc aussi pour les mois déjà passés, au lieu d'un budget à zéro qu'elle n'aurait pas eu sur le moment.
 * Les dépenses courantes utilisées pour les propositions suivent la même idée : dépensé du mois moins
 * ces mêmes charges actuelles ramenées au mois, plutôt qu'un filtre sur l'origine de chaque opération.
 */
export function monthReview(state: ReviewState, rules: RecurringRule[], month: string, today: ISODate): MonthReview {
  const { accounts, envelopes, transactions, reviews } = state;

  const figures: ReviewMonthFigures = {
    income: totalIncomeInMonth(transactions, month),
    spent: totalSpentInMonth(envelopes, transactions, month),
    saved: savedInMonth(accounts, envelopes, transactions, `${month}-01`),
  };

  // Budget actuel de chaque enveloppe : partagé par les Enveloppes et le Contrôle d'ensemble.
  const budgetedToday = withBudgets(envelopes, rules, today).filter((e) => !e.archived);
  const budgetById = new Map(budgetedToday.map((e) => [e.id, e]));

  // Hors épargne : une dépense qui y entre est de l'argent mis de côté, pas un budget qu'on dépasse ou sous lequel on respire.
  const { spent: spentMap } = monthActivity(transactions, `${month}-01`);
  const envelopeLines: ReviewEnvelopeLine[] = budgetedToday
    .filter((e) => !e.isSavings)
    .map((e) => {
      const spent = spentMap.get(e.id) ?? 0;
      return { envelopeId: e.id, name: e.name, color: e.color, budget: e.monthlyBudget, spent, gap: spent - e.monthlyBudget };
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
  const spentByMonth = new Map(validMonths.map((m) => [m, monthActivity(transactions, `${m}-01`).spent]));
  const proposals: ReviewProposal[] = [];
  if (validMonths.length >= 2) {
    for (const e of envelopes) {
      if (e.archived || e.isSavings) continue;
      const charges = budgetById.get(e.id)?.monthlyCharges ?? 0;
      const monthsSpent = validMonths.map((m) => Math.max(0, (spentByMonth.get(m)!.get(e.id) ?? 0) - charges));
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
  const control: ReviewControl = {
    envelopes: budgetedToday.map((e) => ({ envelopeId: e.id, monthlyCharges: e.monthlyCharges, monthlyBudget: e.monthlyBudget })),
    medianIncome: median(validMonths.length > 0 ? validMonths.map((m) => totalIncomeInMonth(transactions, m)) : [0]),
  };

  // Restes : seulement pour le bilan non encore validé du mois qui précède directement aujourd'hui.
  const record = reviews.find((r) => r.month === month);
  const previousMonth = monthKey(addMonths(`${monthKey(today)}-01`, -1));
  let remainders: ReviewRemainder[] | null = null;
  if (!record && month === previousMonth) {
    const ceilings = versableRemainders(state, month, today);
    remainders = envelopes
      .filter((e) => !e.archived && !e.isSavings)
      .map((e) => ({ envelopeId: e.id, name: e.name, color: e.color, amount: ceilings.get(e.id) ?? 0 }))
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
