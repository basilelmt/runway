import { endOfMonth, startOfMonth, type ISODate } from '@shared/dates';
import type { Account, Envelope, Transaction } from '@shared/schemas';

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

/** Ce qu'il manque à une enveloppe pour atteindre son budget du mois (0 si atteint ou sans budget). */
export function remainingToFund(envelope: Pick<Envelope, 'monthlyTarget'>, allocatedThisMonth: number): number {
  return envelope.monthlyTarget ? Math.max(0, envelope.monthlyTarget - allocatedThisMonth) : 0;
}

export type FundingPlan = { items: { envelopeId: number; amount: number }[]; shortfallCount: number };

/**
 * Répartition automatique : chaque enveloppe active qui a un budget reçoit ce qui lui manque pour le mois,
 * dans l'ordre de la page Budget, tant qu'il reste de l'argent. Le surplus reste à répartir.
 */
export function planAutoFunding(envelopes: Envelope[], allocated: Map<number, number>, available: number): FundingPlan {
  const ordered = envelopes.filter((e) => !e.archived && e.monthlyTarget).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
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
