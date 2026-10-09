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
  }
  return { allocated, spent };
}

/**
 * Une règle est une charge de son enveloppe : dépense active, rattachée à une enveloppe,
 * et pas terminée avant le mois de `today`.
 */
export function isEnvelopeCharge(rule: Pick<RecurringRule, 'kind' | 'active' | 'envelopeId' | 'endDate'>, today: ISODate): boolean {
  return rule.kind === 'expense' && rule.active && rule.envelopeId != null && (rule.endDate == null || rule.endDate >= startOfMonth(today));
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
