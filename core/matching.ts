import { daysBetween, type ISODate } from '@shared/dates';
import type { RecurringRule, Transaction } from '@shared/schemas';

export type ImportedRow = { index: number; date: ISODate; signedAmount: number };

/** Montant signé d'une opération prévue, vu depuis le compte importé (`accountId`). */
function plannedSignedAmount(t: Transaction): number {
  switch (t.kind) {
    case 'expense':
    case 'transfer':
      return -t.amount;
    case 'income':
      return t.amount;
    case 'allocation':
      return 0;
  }
}

/**
 * Associe des lignes importées à des opérations prévues du même compte :
 * même montant signé, date à ±tolerance jours, la plus proche gagne, chaque prévue au plus une fois.
 * Renvoie `index de ligne -> id de prévue`.
 */
/** Écart maximal, en jours, entre une opération prévue et celle du relevé qui la confirme. */
export const MATCH_TOLERANCE_DAYS = 5;

export function matchPlanned(rows: ImportedRow[], planned: Transaction[], toleranceDays = MATCH_TOLERANCE_DAYS): Map<number, number> {
  const candidates: { index: number; plannedId: number; distance: number }[] = [];
  for (const row of rows) {
    for (const p of planned) {
      if (p.status !== 'planned' || plannedSignedAmount(p) !== row.signedAmount) continue;
      const distance = Math.abs(daysBetween(p.date, row.date));
      if (distance <= toleranceDays) candidates.push({ index: row.index, plannedId: p.id, distance });
    }
  }
  candidates.sort((a, b) => a.distance - b.distance || a.index - b.index);

  const result = new Map<number, number>();
  const used = new Set<number>();
  for (const c of candidates) {
    if (result.has(c.index) || used.has(c.plannedId)) continue;
    result.set(c.index, c.plannedId);
    used.add(c.plannedId);
  }
  return result;
}

export type RuleOccurrence = { rule: RecurringRule; date: ISODate };

export function occurrenceKey(ruleId: number, date: ISODate): string {
  return `${ruleId}|${date}`;
}

/** Demi-période d'une règle, en jours : jusqu'où, avant la date prévue, un paiement réel peut la régler. */
function halfPeriodDays(rule: RecurringRule): number {
  const step = Math.max(1, rule.interval);
  const days = { daily: 1, weekly: 7, monthly: 30, yearly: 365 }[rule.frequency];
  return Math.floor((days * step) / 2);
}

/**
 * Occurrences de règles déjà réglées en avance : le relevé apporte l'opération réelle avant la date prévue
 * (un prélèvement le 14 pour une règle calée sur le 26), quand l'occurrence n'existe pas encore en base
 * et qu'aucune prévue ne pouvait donc la rapprocher.
 * Une opération confirmée, sans règle, de même nature, montant, comptes et enveloppe que la règle, datée
 * entre le début de la règle et l'occurrence, au plus une demi-période avant, règle cette occurrence.
 * La plus proche gagne, chaque opération au plus une fois.
 * Renvoie `occurrenceKey(règle, date) -> id de l'opération`.
 */
export function settledEarly(occurrences: RuleOccurrence[], transactions: Transaction[]): Map<string, number> {
  const candidates: { key: string; transactionId: number; distance: number }[] = [];
  for (const { rule, date } of occurrences) {
    const window = halfPeriodDays(rule);
    for (const t of transactions) {
      if (t.status !== 'confirmed' || t.recurringRuleId !== null) continue;
      if (t.kind !== rule.kind || t.amount !== rule.amount) continue;
      if (t.accountId !== (rule.accountId ?? null) || t.toAccountId !== (rule.toAccountId ?? null)) continue;
      if (t.envelopeId !== (rule.envelopeId ?? null) || t.fromEnvelopeId !== (rule.fromEnvelopeId ?? null)) continue;
      if (t.date < rule.startDate || t.date > date) continue;
      const distance = daysBetween(t.date, date);
      if (distance <= window) candidates.push({ key: occurrenceKey(rule.id, date), transactionId: t.id, distance });
    }
  }
  candidates.sort((a, b) => a.distance - b.distance);

  const result = new Map<string, number>();
  const used = new Set<number>();
  for (const c of candidates) {
    if (result.has(c.key) || used.has(c.transactionId)) continue;
    result.set(c.key, c.transactionId);
    used.add(c.transactionId);
  }
  return result;
}
