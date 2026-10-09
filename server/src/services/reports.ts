import { applyOperation, summarize, type AccountMap, type EnvelopeMap } from '@core/balances';
import { savedInMonth } from '@core/budget';
import { forecast } from '@core/forecast';
import type { MonthlyReport, NetWorthReport, SpendingReport } from '@shared/api-types';
import { addMonths, endOfMonth, monthKey, startOfMonth, type ISODate } from '@shared/dates';
import type { Db } from '../db/client';
import { loadState } from './state';

/** Dépenses de [from, to] par enveloppe ; les budgets sont ceux du mois de `today`. */
export function spendingReport(db: Db, today: ISODate, from: ISODate, to: ISODate): SpendingReport {
  const state = loadState(db, today);
  const totals = new Map<number | null, number>();
  for (const t of state.transactions) {
    if (t.kind !== 'expense' || t.status !== 'confirmed' || t.date < from || t.date > to) continue;
    totals.set(t.envelopeId, (totals.get(t.envelopeId) ?? 0) + t.amount);
  }
  const byEnvelope: SpendingReport['byEnvelope'] = [];
  for (const env of state.envelopes) {
    if (env.isSavings) continue;
    const amount = totals.get(env.id) ?? 0;
    if (amount > 0) byEnvelope.push({ envelopeId: env.id, name: env.name, color: env.color, amount, monthlyBudget: env.monthlyBudget });
  }
  const unsorted = totals.get(null) ?? 0;
  if (unsorted > 0) byEnvelope.push({ envelopeId: null, name: 'À ranger', color: '#9a9a9a', amount: unsorted, monthlyBudget: 0 });
  byEnvelope.sort((a, b) => b.amount - a.amount);
  const total = byEnvelope.reduce((s, e) => s + e.amount, 0);
  const monthlyBudget = state.envelopes.filter((e) => !e.archived && !e.isSavings).reduce((s, e) => s + e.monthlyBudget, 0);
  return { from, to, total, monthlyBudget, byEnvelope };
}

export function monthlyReport(db: Db, today: ISODate, months: number): MonthlyReport {
  const state = loadState(db, today);
  const savings = new Set(state.envelopes.filter((e) => e.isSavings).map((e) => e.id));
  const buckets = new Map<string, { income: number; expense: number }>();
  const first = startOfMonth(addMonths(today, -(months - 1)));
  for (let i = 0; i < months; i++) buckets.set(monthKey(addMonths(first, i)), { income: 0, expense: 0 });
  for (const t of state.transactions) {
    if (t.status !== 'confirmed' || t.date < first) continue;
    const bucket = buckets.get(monthKey(t.date));
    if (!bucket) continue;
    if (t.kind === 'income') bucket.income += t.amount;
    if (t.kind === 'expense' && !(t.envelopeId != null && savings.has(t.envelopeId))) bucket.expense += t.amount;
  }
  return [...buckets.entries()].map(([month, v]) => ({
    month,
    ...v,
    saved: savedInMonth(state.accounts, state.envelopes, state.transactions, `${month}-01`),
  }));
}

/** Valeur nette à chaque fin de mois sur `months` mois, puis projection quotidienne sur `horizonDays`. */
export function netWorthReport(db: Db, today: ISODate, months: number, horizonDays: number): NetWorthReport {
  const state = loadState(db, today);
  const live = state.accounts.filter((a) => !a.archived);

  const accounts: AccountMap = {};
  const envelopes: EnvelopeMap = {};
  for (const a of state.accounts) accounts[a.id] = a.initialBalance;
  const confirmed = state.transactions.filter((t) => t.status === 'confirmed');

  const checkpoints: ISODate[] = [];
  const first = startOfMonth(addMonths(today, -(months - 1)));
  for (let i = 0; i < months; i++) {
    const end = endOfMonth(addMonths(first, i));
    checkpoints.push(end < today ? end : today);
  }

  const history: NetWorthReport['history'] = [];
  let cursor = 0;
  for (const date of checkpoints) {
    while (cursor < confirmed.length && confirmed[cursor]!.date <= date) {
      applyOperation(confirmed[cursor]!, accounts, envelopes);
      cursor++;
    }
    history.push({ date, value: summarize({ accounts: live, envelopes: [] }, accounts, envelopes).netWorth });
  }

  const projected = forecast(state, state.rules, today, horizonDays);
  const projection = projected.days.map((d) => ({
    date: d.date,
    value: live.reduce((s, a) => s + (d.accounts[a.id] ?? 0), 0),
  }));

  return { history, projection };
}
