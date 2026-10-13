import type { BudgetedEnvelope, WatchedEnvelope } from '@shared/api-types';
import { addDays, daysBetween, endOfMonth, startOfMonth, type ISODate } from '@shared/dates';
import type { Cents } from '@shared/money';
import type { Account, Envelope, RecurringRule, Transaction } from '@shared/schemas';
import { expandRule, monthlyEquivalent } from './recurrence';

export type MonthActivity = {
  /** Argent réparti dans chaque enveloppe sur le mois, net des déplacements sortants. */
  allocated: Map<number, number>;
  /** Dépenses confirmées de chaque enveloppe sur le mois. */
  spent: Map<number, number>;
};

/** Répartitions et dépenses confirmées du mois de `date`, par enveloppe. */
export function monthActivity(transactions: Transaction[], date: ISODate): MonthActivity {
  const from = startOfMonth(date);
  const to = endOfMonth(date);
  const allocated = new Map<number, number>();
  const spent = new Map<number, number>();
  const add = (map: Map<number, number>, id: number, amount: number) => map.set(id, (map.get(id) ?? 0) + amount);
  for (const t of transactions) {
    if (t.status !== 'confirmed' || t.date < from || t.date > to) continue;
    if (t.kind === 'allocation' && t.envelopeId != null) {
      add(allocated, t.envelopeId, t.amount);
      if (t.fromEnvelopeId != null) add(allocated, t.fromEnvelopeId, -t.amount);
    }
    if (t.kind === 'expense' && t.envelopeId != null) add(spent, t.envelopeId, t.amount);
    // Un remboursement rangé dans une enveloppe vient en déduction de ses dépenses du mois.
    if (t.kind === 'income' && t.envelopeId != null) add(spent, t.envelopeId, -t.amount);
  }
  // Jamais négatif : un remboursement qui dépasse les dépenses du mois ramène juste le dépensé à zéro.
  for (const [id, amount] of spent) if (amount < 0) spent.set(id, 0);
  return { allocated, spent };
}

/**
 * Une règle est une charge de son enveloppe : dépense active, rattachée à une enveloppe,
 * déjà commencée et pas terminée avant le mois de `today`.
 */
export function isEnvelopeCharge(rule: Pick<RecurringRule, 'kind' | 'active' | 'envelopeId' | 'startDate' | 'endDate'>, today: ISODate): boolean {
  return (
    rule.kind === 'expense' &&
    rule.active &&
    rule.envelopeId != null &&
    rule.startDate <= endOfMonth(today) &&
    (rule.endDate == null || rule.endDate >= startOfMonth(today))
  );
}

/**
 * Budget du mois de chaque enveloppe : ses charges fixes ramenées au mois, plus son complément.
 * Une charge trimestrielle de 10,80 € compte 3,60 € par mois : l'enveloppe accumule de quoi la payer.
 */
export function withBudgets(envelopes: Envelope[], rules: RecurringRule[], today: ISODate): BudgetedEnvelope[] {
  const charges = new Map<number, number>();
  for (const rule of rules) {
    const id = rule.envelopeId;
    if (id == null || !isEnvelopeCharge(rule, today)) continue;
    charges.set(id, (charges.get(id) ?? 0) + monthlyEquivalent(rule));
  }
  return envelopes.map((e) => {
    const monthlyCharges = charges.get(e.id) ?? 0;
    return { ...e, monthlyCharges, monthlyBudget: monthlyCharges + (e.monthlyExtra ?? 0) };
  });
}

/** Ce qu'il manque à une enveloppe pour atteindre son budget du mois (0 si atteint ou sans budget). */
export function remainingToFund(envelope: Pick<BudgetedEnvelope, 'monthlyBudget'>, allocatedThisMonth: number): number {
  return Math.max(0, envelope.monthlyBudget - allocatedThisMonth);
}

export type FundingPlan = { items: { envelopeId: number; amount: number }[]; shortfallCount: number };

/**
 * Répartition automatique : chaque enveloppe active qui a un budget reçoit ce qui lui manque pour le mois,
 * dans l'ordre de la page Budget, tant qu'il reste de l'argent. Le surplus reste à répartir.
 */
export function planAutoFunding(envelopes: BudgetedEnvelope[], allocated: Map<number, number>, available: number): FundingPlan {
  const ordered = envelopes.filter((e) => !e.archived && e.monthlyBudget > 0).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const items: FundingPlan['items'] = [];
  let left = Math.max(0, available);
  let shortfallCount = 0;
  for (const env of ordered) {
    const missing = remainingToFund(env, allocated.get(env.id) ?? 0);
    if (missing === 0) continue;
    const amount = Math.min(missing, left);
    if (amount < missing) shortfallCount++;
    if (amount === 0) continue;
    items.push({ envelopeId: env.id, amount });
    left -= amount;
  }
  return { items, shortfallCount };
}

/**
 * Argent mis de côté sur le mois de `date` : virements nets des comptes budget vers les comptes d'épargne,
 * plus les dépenses rangées dans une enveloppe d'épargne (versement vers un courtier, par exemple).
 */
export function savedInMonth(accounts: Account[], envelopes: Envelope[], transactions: Transaction[], date: ISODate): number {
  const from = startOfMonth(date);
  const to = endOfMonth(date);
  const onBudget = new Map(accounts.map((a) => [a.id, a.onBudget]));
  const savings = new Set(envelopes.filter((e) => e.isSavings).map((e) => e.id));
  let saved = 0;
  for (const t of transactions) {
    if (t.status !== 'confirmed' || t.date < from || t.date > to) continue;
    if (t.kind === 'transfer' && t.accountId != null && t.toAccountId != null) {
      const fromBudget = onBudget.get(t.accountId) ?? false;
      const toBudget = onBudget.get(t.toAccountId) ?? false;
      if (fromBudget && !toBudget) saved += t.amount;
      if (!fromBudget && toBudget) saved -= t.amount;
    }
    if (t.kind === 'expense' && t.envelopeId != null && savings.has(t.envelopeId)) saved += t.amount;
  }
  return saved;
}

export type MonthSpending = {
  /** Dépenses confirmées du mois, à trier comprises, hors enveloppes d'épargne, remboursements déduits. */
  spent: Cents;
  /** Les mêmes, sans celles générées par une charge fixe. */
  variableSpent: Cents;
  /** Cumul des dépenses courantes à la fin de chaque jour, du 1er à `today` inclus ; le dernier vaut `variableSpent`. */
  variableDaily: Cents[];
};

/**
 * Consommation du mois de `today` : toutes les dépenses confirmées (même à trier), hors enveloppes d'épargne, remboursements déduits.
 * Dépenses courantes : les mêmes, sauf celles générées par une charge fixe (loyer, Navigo...).
 * Un ticket de métro rangé dans Transports compte donc, le Navigo non.
 * Un remboursement vient d'abord en déduction des dépenses courantes de son enveloppe, puis de ses charges fixes :
 * c'est le quotidien (restos, sorties...) qui se rembourse, rarement un loyer.
 */
export function monthSpending(envelopes: Envelope[], transactions: Transaction[], today: ISODate): MonthSpending {
  const savings = new Set(envelopes.filter((e) => e.isSavings).map((e) => e.id));
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  // Par date : une seule passe, avec des cumuls par enveloppe arrêtés à la fin de chaque jour.
  const month = transactions
    .filter((t) => t.status === 'confirmed' && t.date >= monthStart && t.date <= monthEnd)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const fixedByEnvelope = new Map<number, number>();
  const variableByEnvelope = new Map<number, number>();
  const reimbursedByEnvelope = new Map<number, number>();
  const add = (map: Map<number, number>, id: number, amount: number) => map.set(id, (map.get(id) ?? 0) + amount);
  let unsortedSpent = 0;
  const totals = () => {
    let spent = unsortedSpent;
    let variableSpent = unsortedSpent;
    for (const e of envelopes) {
      if (e.isSavings) continue;
      const variable = variableByEnvelope.get(e.id) ?? 0;
      const fixed = fixedByEnvelope.get(e.id) ?? 0;
      const reimbursed = reimbursedByEnvelope.get(e.id) ?? 0;
      const netVariable = Math.max(0, variable - reimbursed);
      const netFixed = Math.max(0, fixed - Math.max(0, reimbursed - variable));
      spent += netVariable + netFixed;
      variableSpent += netVariable;
    }
    return { spent, variableSpent };
  };

  // Le cumul d'un jour applique la règle des remboursements à tout ce qui précède : un remboursement peut faire redescendre la courbe.
  // Aujourd'hui compte jusqu'à la fin du mois, comme le total : une opération confirmée datée plus tard n'est pas perdue.
  const variableDaily: Cents[] = [];
  let i = 0;
  for (let day = monthStart; ; day = addDays(day, 1)) {
    const until = day < today ? day : monthEnd;
    for (; i < month.length && month[i]!.date <= until; i++) {
      const t = month[i]!;
      if (t.kind === 'expense') {
        if (t.envelopeId != null && savings.has(t.envelopeId)) continue;
        if (t.envelopeId == null) unsortedSpent += t.amount;
        else add(t.recurringRuleId == null ? variableByEnvelope : fixedByEnvelope, t.envelopeId, t.amount);
      } else if (t.kind === 'income' && t.envelopeId != null) {
        add(reimbursedByEnvelope, t.envelopeId, t.amount);
      }
    }
    if (day >= today) {
      const total = totals();
      variableDaily.push(total.variableSpent);
      return { ...total, variableDaily };
    }
    variableDaily.push(totals().variableSpent);
  }
}

/** En dessous de 7 jours restants, une enveloppe presque vide n'est plus une surprise : le mois s'achève. */
const LOW_MIN_DAYS_LEFT = 7;

/**
 * Enveloppes à surveiller, hors épargne et archivées : dépassées (disponible négatif),
 * puis presque vides (disponible libre sous 10 % du complément, à plus de 7 jours de la fin du mois).
 * Disponible libre = disponible - charges encore attendues ce mois-ci : prévues non confirmées du mois,
 * et occurrences des règles de dépense entre demain et la fin du mois qui ne sont pas encore en base.
 * Une enveloppe sans complément n'est jamais presque vide : Logement à 0 € une fois le loyer payé est normal.
 */
export function envelopesToWatch(
  envelopes: Pick<Envelope, 'id' | 'name' | 'archived' | 'isSavings' | 'monthlyExtra'>[],
  balances: Record<number, Cents>,
  rules: RecurringRule[],
  transactions: Transaction[],
  today: ISODate,
): WatchedEnvelope[] {
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  const tomorrow = addDays(today, 1);
  const expected = new Map<number, Cents>();
  const add = (id: number, amount: Cents) => expected.set(id, (expected.get(id) ?? 0) + amount);

  for (const t of transactions) {
    if (t.status !== 'planned' || t.kind !== 'expense' || t.envelopeId == null || t.date < monthStart || t.date > monthEnd) continue;
    add(t.envelopeId, t.amount);
  }
  for (const r of rules) {
    if (r.kind !== 'expense' || r.envelopeId == null) continue;
    // Tout ce qui est antérieur ou égal à lastGeneratedDate existe déjà en base, compté plus haut s'il est encore prévu.
    const next = r.lastGeneratedDate ? addDays(r.lastGeneratedDate, 1) : tomorrow;
    const from = next > tomorrow ? next : tomorrow;
    add(r.envelopeId, r.amount * expandRule(r, from, monthEnd).length);
  }

  const lowAllowed = daysBetween(today, monthEnd) > LOW_MIN_DAYS_LEFT;
  const over: WatchedEnvelope[] = [];
  const low: WatchedEnvelope[] = [];
  for (const e of envelopes) {
    if (e.archived || e.isSavings) continue;
    const balance = balances[e.id] ?? 0;
    if (balance < 0) {
      over.push({ envelopeId: e.id, name: e.name, kind: 'over', amount: -balance });
      continue;
    }
    if (!lowAllowed || !e.monthlyExtra || e.monthlyExtra <= 0) continue;
    const free = balance - (expected.get(e.id) ?? 0);
    // free < 10 % du complément, en entiers pour éviter les arrondis.
    if (free * 10 < e.monthlyExtra) low.push({ envelopeId: e.id, name: e.name, kind: 'low', amount: Math.max(0, free) });
  }
  over.sort((a, b) => b.amount - a.amount);
  low.sort((a, b) => a.amount - b.amount);
  return [...over, ...low];
}
