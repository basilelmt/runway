import type { ForecastAlert, ForecastDay, ForecastEvent, ForecastResult } from '@shared/api-types';
import { addDays, addMonths, daysBetween, startOfMonth, type ISODate } from '@shared/dates';
import type { RecurringRule } from '@shared/schemas';
import { applyOperation, computeBalances, rolloverEnvelopes, type AccountMap, type EnvelopeMap } from './balances';
import { monthActivity, remainingToFund, withBudgets } from './budget';
import { occurrenceKey, settledEarly, type RuleOccurrence } from './matching';
import { expandRule } from './recurrence';
import type { State } from './types';

/**
 * Projette les soldes jour par jour sur `horizonDays` à partir de `today`.
 * Point de départ : soldes confirmés, plus les prévues antérieures à aujourd'hui (non rapprochées, elles sont dues).
 * Entrées futures : prévues datées d'aujourd'hui ou après, occurrences de règles non encore matérialisées,
 * et budget mensuel des enveloppes (charges fixes + complément), recalculé à partir des règles pour chaque mois
 * (y compris le mois en cours, sans dépendre d'un `monthlyBudget` déjà posé par l'appelant) : le reste à répartir
 * ce mois-ci aujourd'hui, puis le budget complet chaque 1er du mois (une charge terminée ne compte plus).
 * Chaque 1er du mois, les enveloppes dépassées repartent de zéro avant les opérations du jour, comme dans `computeBalances`.
 */
export function forecast(state: State, rules: RecurringRule[], today: ISODate, horizonDays: number): ForecastResult {
  const end = addDays(today, horizonDays);
  const events = collectEvents(state, rules, today, end);

  const start = computeBalances(state, today);
  const accounts: AccountMap = { ...start.accounts };
  const envelopes: EnvelopeMap = { ...start.envelopes };

  // Les prévues passées non rapprochées sont considérées comme dues aujourd'hui.
  for (const t of state.transactions) {
    if (t.status === 'planned' && t.date < today) applyOperation(t, accounts, envelopes);
  }

  const byDate = new Map<ISODate, ForecastEvent[]>();
  for (const e of events) {
    const list = byDate.get(e.date) ?? [];
    list.push(e);
    byDate.set(e.date, list);
  }

  const days: ForecastDay[] = [];
  for (let date = today; date <= end; date = addDays(date, 1)) {
    if (date !== today && date === startOfMonth(date)) rolloverEnvelopes(envelopes);
    for (const e of byDate.get(date) ?? []) applyOperation(e, accounts, envelopes);
    days.push({ date, accounts: { ...accounts }, envelopes: { ...envelopes } });
  }

  const alerts: ForecastAlert[] = [];
  for (const acc of state.accounts) {
    if (acc.archived) continue;
    const alert = findAlert('account', acc.id, acc.name, days.map((d) => [d.date, d.accounts[acc.id] ?? 0]), today);
    if (alert) alerts.push(alert);
  }
  for (const env of state.envelopes) {
    if (env.archived) continue;
    const alert = findAlert('envelope', env.id, env.name, days.map((d) => [d.date, d.envelopes[env.id] ?? 0]), today);
    if (alert) alerts.push(alert);
  }
  alerts.sort((a, b) => (a.firstNegativeDate < b.firstNegativeDate ? -1 : a.firstNegativeDate > b.firstNegativeDate ? 1 : a.minBalance - b.minBalance));

  return { today, horizonDays, days, alerts, events };
}

function findAlert(
  kind: ForecastAlert['kind'],
  id: number,
  name: string,
  series: [ISODate, number][],
  today: ISODate,
): ForecastAlert | null {
  let firstNegativeDate: ISODate | null = null;
  let minBalance = Number.POSITIVE_INFINITY;
  let minBalanceDate: ISODate = today;
  for (const [date, value] of series) {
    if (value < 0 && firstNegativeDate === null) firstNegativeDate = date;
    if (value < minBalance) {
      minBalance = value;
      minBalanceDate = date;
    }
  }
  if (firstNegativeDate === null) return null;
  return { kind, id, name, firstNegativeDate, daysUntil: daysBetween(today, firstNegativeDate), minBalance, minBalanceDate };
}

/** Événements futurs datés dans [today, end], triés par date. */
export function collectEvents(state: State, rules: RecurringRule[], today: ISODate, end: ISODate): ForecastEvent[] {
  const events: ForecastEvent[] = [];
  // Une charge fixe se lit par le nom de sa règle (« Assurance auto ») ; son libellé de relevé ne sert qu'au rapprochement.
  const ruleNames = new Map(rules.map((r) => [r.id, r.name]));

  for (const t of state.transactions) {
    if (t.status !== 'planned' || t.date < today || t.date > end) continue;
    events.push({
      date: t.date,
      label: (t.recurringRuleId !== null ? ruleNames.get(t.recurringRuleId) : undefined) ?? t.label,
      kind: t.kind,
      amount: t.amount,
      accountId: t.accountId,
      toAccountId: t.toAccountId,
      envelopeId: t.envelopeId,
      fromEnvelopeId: t.fromEnvelopeId,
      source: 'planned',
      sourceId: t.id,
    });
  }

  const occurrences: RuleOccurrence[] = [];
  for (const rule of rules) {
    // Tout ce qui est antérieur ou égal à lastGeneratedDate existe déjà en base (confirmé ou prévu).
    const from = rule.lastGeneratedDate ? addDays(rule.lastGeneratedDate, 1) : today;
    const start = from > today ? from : today;
    for (const date of expandRule(rule, start, end)) occurrences.push({ rule, date });
  }
  // Une occurrence déjà payée en avance (prélèvement arrivé avant la date de la règle) n'est pas comptée deux fois.
  const settled = settledEarly(occurrences, state.transactions);
  for (const { rule, date } of occurrences) {
    if (settled.has(occurrenceKey(rule.id, date))) continue;
    events.push({
      date,
      label: rule.name,
      kind: rule.kind,
      amount: rule.amount,
      accountId: rule.accountId ?? null,
      toAccountId: rule.toAccountId ?? null,
      envelopeId: rule.envelopeId ?? null,
      fromEnvelopeId: rule.fromEnvelopeId ?? null,
      source: 'rule',
      sourceId: rule.id,
    });
  }

  events.push(...budgetEvents(state, rules, today, end));

  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return events;
}

/**
 * Répartitions attendues d'après le budget mensuel de chaque enveloppe, sur [today, end].
 * Le budget de chaque mois (y compris le mois en cours) est recalculé avec `withBudgets` pour ne jamais
 * dépendre d'un `monthlyBudget` déjà posé par l'appelant, et pour qu'une charge terminée ne compte plus.
 */
function budgetEvents(state: State, rules: RecurringRule[], today: ISODate, end: ISODate): ForecastEvent[] {
  const events: ForecastEvent[] = [];
  const event = (date: ISODate, envelopeId: number, label: string, amount: number): ForecastEvent => ({
    date,
    label,
    kind: 'allocation',
    amount,
    accountId: null,
    toAccountId: null,
    envelopeId,
    fromEnvelopeId: null,
    source: 'budget',
    sourceId: envelopeId,
  });
  const currentMonth = startOfMonth(today);
  for (let month = currentMonth; month <= end; month = addMonths(month, 1)) {
    const date = month === currentMonth ? today : month;
    // Allocations déjà datées de ce mois (salaire de fin de mois réparti d'avance, par exemple).
    const already = monthActivity(state.transactions, month).allocated;
    for (const env of withBudgets(state.envelopes, rules, month)) {
      if (env.archived || env.monthlyBudget <= 0) continue;
      const label = `Budget ${env.name}`;
      const amount = remainingToFund(env, already.get(env.id) ?? 0);
      if (amount > 0) events.push(event(date, env.id, label, amount));
    }
  }
  return events;
}
