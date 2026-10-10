import type { SignalPayloadByKind } from '@shared/api-types';
import { addDays, compareISODate, daysBetween, monthKey, type ISODate } from '@shared/dates';
import type { RecurringRule, SignalKind, Transaction } from '@shared/schemas';
import { merchantKeyFor } from './merchants';

export type DetectedSignal = { [K in SignalKind]: { kind: K; key: string; payload: SignalPayloadByKind[K] } }[SignalKind];

/** Seules les opérations des 45 derniers jours peuvent déclencher un signal : un premier passage sur tout l'historique ne noie pas l'Accueil. */
export const SIGNAL_WINDOW_DAYS = 45;

export const UNUSUAL_MIN_AMOUNT = 100_00;
export const UNUSUAL_NEW_MERCHANT_MIN_AMOUNT = 150_00;
export const UNUSUAL_RATIO = 2.5;
export const UNUSUAL_MIN_HISTORY = 3;

export const NEW_RECURRING_MIN_GAP_DAYS = 25;
export const NEW_RECURRING_MAX_GAP_DAYS = 35;
export const NEW_RECURRING_AMOUNT_TOLERANCE = 0.1;

export const PRICE_CHANGE_MIN_ABS = 1_00;
export const PRICE_CHANGE_MIN_RATIO = 0.03;

export const MISSING_CHARGE_GRACE_DAYS = 5;

export const CONSENT_WARNING_DAYS = 14;

export const SYNC_ERROR_MIN_FAILURES = 2;
export const SYNC_ERROR_MAX_HOURS_WITHOUT_SUCCESS = 24;

function inWindow(date: ISODate, today: ISODate): boolean {
  return compareISODate(date, addDays(today, -SIGNAL_WINDOW_DAYS)) >= 0 && compareISODate(date, today) <= 0;
}

function byDateThenId(a: Transaction, b: Transaction): number {
  return compareISODate(a.date, b.date) || a.id - b.id;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function monthIndex(mk: string): number {
  const [year, month] = mk.split('-').map(Number);
  return year! * 12 + (month! - 1);
}

/** Vrai si les trois dates tombent dans trois mois civils qui se suivent. */
function threeConsecutiveMonths(dates: ISODate[]): boolean {
  const idx = dates.map((d) => monthIndex(monthKey(d)));
  return new Set(idx).size === 3 && idx[1] === idx[0]! + 1 && idx[2] === idx[1]! + 1;
}

/** Valeur la plus fréquente d'une liste (la première rencontrée gagne les égalités), ou null si vide. */
function mostFrequent<T>(values: T[]): T | null {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T | null = null;
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

/**
 * Dépense confirmée très au-dessus de l'habitude du marchand : au moins 100 € et 2,5 fois la médiane de ses
 * 3 dépenses passées ou plus, ou au moins 150 € chez un marchand jamais vu (aucune dépense passée).
 */
export function detectUnusualExpenses(transactions: Transaction[], today: ISODate): DetectedSignal[] {
  const history = new Map<string, number[]>();
  const out: DetectedSignal[] = [];
  const expenses = transactions.filter((t) => t.kind === 'expense' && t.status === 'confirmed' && t.merchantKey !== null).sort(byDateThenId);

  for (const t of expenses) {
    const key = t.merchantKey!;
    const prior = history.get(key) ?? [];
    if (inWindow(t.date, today)) {
      if (prior.length === 0) {
        if (t.amount >= UNUSUAL_NEW_MERCHANT_MIN_AMOUNT) {
          out.push({ kind: 'unusual_expense', key: `unusual:${t.id}`, payload: { transactionId: t.id, merchantName: t.merchantName ?? key, amount: t.amount, median: null, date: t.date } });
        }
      } else if (prior.length >= UNUSUAL_MIN_HISTORY) {
        const med = median(prior);
        if (med > 0 && t.amount >= UNUSUAL_MIN_AMOUNT && t.amount / med >= UNUSUAL_RATIO) {
          out.push({ kind: 'unusual_expense', key: `unusual:${t.id}`, payload: { transactionId: t.id, merchantName: t.merchantName ?? key, amount: t.amount, median: med, date: t.date } });
        }
      }
    }
    prior.push(t.amount);
    history.set(key, prior);
  }
  return out;
}

/**
 * Marchand dont les 3 dernières dépenses confirmées forment une régularité (mensuelle, montants proches)
 * sans être couvert par une charge fixe active. Un marchand déjà couvert ne redéclenche jamais le signal,
 * même si ses anciennes opérations n'ont pas de `recurringRuleId` (la règle n'existait pas encore).
 */
export function detectNewRecurring(transactions: Transaction[], rules: RecurringRule[], today: ISODate): DetectedSignal[] {
  const coveredKeys = new Set(rules.filter((r) => r.active && r.kind === 'expense').map((r) => merchantKeyFor('expense', r.label)).filter((k): k is string => k !== null));
  const groups = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (t.kind !== 'expense' || t.status !== 'confirmed' || t.merchantKey === null) continue;
    const list = groups.get(t.merchantKey) ?? [];
    list.push(t);
    groups.set(t.merchantKey, list);
  }

  const out: DetectedSignal[] = [];
  for (const [key, list] of groups) {
    if (coveredKeys.has(key)) continue;
    const sorted = [...list].sort(byDateThenId);
    if (sorted.length < 3) continue;
    const last3 = sorted.slice(-3);
    if (last3.some((t) => t.recurringRuleId !== null)) continue;
    if (!inWindow(last3[2]!.date, today)) continue;

    const gap1 = daysBetween(last3[0]!.date, last3[1]!.date);
    const gap2 = daysBetween(last3[1]!.date, last3[2]!.date);
    if (gap1 < NEW_RECURRING_MIN_GAP_DAYS || gap1 > NEW_RECURRING_MAX_GAP_DAYS) continue;
    if (gap2 < NEW_RECURRING_MIN_GAP_DAYS || gap2 > NEW_RECURRING_MAX_GAP_DAYS) continue;
    if (!threeConsecutiveMonths(last3.map((t) => t.date))) continue;

    const amounts = last3.map((t) => t.amount);
    const med = median(amounts);
    if (amounts.some((a) => Math.abs(a - med) / med > NEW_RECURRING_AMOUNT_TOLERANCE)) continue;

    const envelopeId = mostFrequent(last3.map((t) => t.envelopeId));
    const dayOfMonth = Number(last3[2]!.date.slice(8, 10));
    out.push({
      kind: 'new_recurring',
      key: `recurring:${key}`,
      payload: { merchantKey: key, merchantName: last3[2]!.merchantName ?? key, amount: med, envelopeId, dayOfMonth },
    });
  }
  return out;
}

/** Opération confirmée rapprochée d'une charge fixe dont le montant a bougé d'au moins 1 € et 3 %. */
export function detectPriceChanges(transactions: Transaction[], rules: RecurringRule[], today: ISODate): DetectedSignal[] {
  const ruleById = new Map(rules.map((r) => [r.id, r]));
  const out: DetectedSignal[] = [];
  for (const t of transactions) {
    if (t.status !== 'confirmed' || t.recurringRuleId === null) continue;
    if (!inWindow(t.date, today)) continue;
    const rule = ruleById.get(t.recurringRuleId);
    if (!rule) continue;
    const diff = Math.abs(t.amount - rule.amount);
    if (diff < PRICE_CHANGE_MIN_ABS) continue;
    if (rule.amount === 0 || diff / rule.amount < PRICE_CHANGE_MIN_RATIO) continue;
    out.push({
      kind: 'price_change',
      key: `price:${rule.id}:${t.amount}`,
      payload: { ruleId: rule.id, ruleName: rule.name, oldAmount: rule.amount, newAmount: t.amount, transactionId: t.id, rule },
    });
  }
  return out;
}

/** Occurrence prévue d'une charge (dépense ou revenu) dont la date est dépassée de plus de 5 jours. */
export function detectMissingCharges(transactions: Transaction[], today: ISODate): DetectedSignal[] {
  const out: DetectedSignal[] = [];
  for (const t of transactions) {
    if (t.status !== 'planned' || t.recurringRuleId === null) continue;
    if (t.kind !== 'expense' && t.kind !== 'income') continue;
    if (!inWindow(t.date, today)) continue;
    if (daysBetween(t.date, today) <= MISSING_CHARGE_GRACE_DAYS) continue;
    out.push({ kind: 'missing_charge', key: `missing:${t.id}`, payload: { transactionId: t.id, label: t.label, amount: t.amount, date: t.date, txKind: t.kind } });
  }
  return out;
}

export type ConnectionInfo = { id: number; aspspName: string; status: string; validUntil: string | null };

/** Consentement bancaire actif ou expiré dont la date limite tombe à moins de 14 jours. */
export function detectConsentExpiring(connections: ConnectionInfo[], today: ISODate): DetectedSignal[] {
  const out: DetectedSignal[] = [];
  for (const c of connections) {
    if (c.status !== 'active' && c.status !== 'expired') continue;
    if (!c.validUntil) continue;
    const validUntilDate = c.validUntil.slice(0, 10);
    if (daysBetween(today, validUntilDate) >= CONSENT_WARNING_DAYS) continue;
    out.push({ kind: 'consent_expiring', key: `consent:${c.id}:${c.validUntil}`, payload: { connectionId: c.id, aspspName: c.aspspName, validUntil: c.validUntil } });
  }
  return out;
}

export type SyncErrorConnectionInfo = {
  id: number;
  aspspName: string;
  status: string;
  lastError: string | null;
  consecutiveFailures: number;
  lastSuccessAt: string | null;
  firstFailureAt: string | null;
  createdAt: string;
};

/** Connexion active dont la dernière synchro échoue depuis 2 tentatives ou 24 h sans succès. */
export function detectSyncErrors(connections: SyncErrorConnectionInfo[], now: Date): DetectedSignal[] {
  const out: DetectedSignal[] = [];
  for (const c of connections) {
    if (c.status !== 'active' || c.lastError === null) continue;
    const since = c.lastSuccessAt ?? c.createdAt;
    const hoursSinceSuccess = (now.getTime() - new Date(since).getTime()) / 3_600_000;
    if (c.consecutiveFailures < SYNC_ERROR_MIN_FAILURES && hoursSinceSuccess <= SYNC_ERROR_MAX_HOURS_WITHOUT_SUCCESS) continue;
    const firstFailureAt = c.firstFailureAt ?? now.toISOString();
    out.push({ kind: 'sync_error', key: `sync:${c.id}:${firstFailureAt}`, payload: { connectionId: c.id, aspspName: c.aspspName, lastError: c.lastError } });
  }
  return out;
}
