import { computeBalances } from '@core/balances';
import { forecast } from '@core/forecast';
import type { Overview } from '@shared/api-types';
import { endOfMonth, startOfMonth, type ISODate } from '@shared/dates';
import type { Db } from '../db/client';
import { lastImportForAccount } from '../repos/imports';
import { getSettings } from '../repos/settings';
import { countPlanned, countUnsorted } from '../repos/transactions';
import { netWorthReport } from './reports';
import { loadState } from './state';

export function buildOverview(db: Db, today: ISODate): Overview {
  const state = loadState(db);
  const balances = computeBalances(state);
  const horizon = getSettings(db).forecastHorizonDays;
  const { alerts } = forecast(state, state.rules, today, horizon);

  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  const allocated = new Map<number, number>();
  const spent = new Map<number, number>();
  for (const t of state.transactions) {
    if (t.status !== 'confirmed' || t.date < monthStart || t.date > monthEnd) continue;
    if (t.kind === 'allocation' && t.envelopeId != null) {
      allocated.set(t.envelopeId, (allocated.get(t.envelopeId) ?? 0) + t.amount);
      if (t.fromEnvelopeId != null) allocated.set(t.fromEnvelopeId, (allocated.get(t.fromEnvelopeId) ?? 0) - t.amount);
    }
    if (t.kind === 'expense' && t.envelopeId != null) spent.set(t.envelopeId, (spent.get(t.envelopeId) ?? 0) + t.amount);
  }

  return {
    today,
    toAllocate: balances.toAllocate,
    netWorth: balances.netWorth,
    accounts: state.accounts
      .filter((a) => !a.archived)
      .map((a) => ({ ...a, balance: balances.accounts[a.id] ?? 0, lastImport: lastImportForAccount(db, a.id) })),
    envelopes: state.envelopes
      .filter((e) => !e.archived)
      .map((e) => ({
        ...e,
        balance: balances.envelopes[e.id] ?? 0,
        allocatedThisMonth: allocated.get(e.id) ?? 0,
        spentThisMonth: spent.get(e.id) ?? 0,
      })),
    alerts,
    unsortedCount: countUnsorted(db),
    plannedCount: countPlanned(db),
    netWorthSparkline: netWorthReport(db, today, 6, 0).history,
  };
}
