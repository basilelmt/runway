import { computeBalances } from '@core/balances';
import { envelopesToWatch, monthActivity, remainingToFund, savedInMonth } from '@core/budget';
import { forecast } from '@core/forecast';
import { MATCH_TOLERANCE_DAYS } from '@core/matching';
import { monthlyEquivalent } from '@core/recurrence';
import { monthReview } from '@core/review';
import type { Overview, PendingReview } from '@shared/api-types';
import { addDays, addMonths, endOfMonth, monthKey, startOfMonth, type ISODate } from '@shared/dates';
import type { Db } from '../db/client';
import { latestFundingView } from '../repos/fundings';
import { lastImportForAccount } from '../repos/imports';
import { getReview } from '../repos/reviews';
import { getSettings } from '../repos/settings';
import { countUnsorted } from '../repos/transactions';
import { loadState } from './state';

/** Bilan du mois précédent restant à faire, pour la carte d'Accueil. */
function buildPendingReview(state: ReturnType<typeof loadState>, db: Db, today: ISODate): PendingReview | null {
  const month = monthKey(addMonths(startOfMonth(today), -1));
  if (getReview(db, month)) return null;
  const review = monthReview({ ...state, reviews: [] }, state.rules, month, today);
  return { month, spent: review.figures.spent, overspentCount: review.envelopes.filter((e) => e.gap > 0).length };
}

export function buildOverview(db: Db, today: ISODate): Overview {
  const state = loadState(db, today);
  const balances = computeBalances(state, today);
  const horizon = getSettings(db).forecastHorizonDays;
  const { alerts } = forecast(state, state.rules, today, horizon);

  const { allocated, spent } = monthActivity(state.transactions, today);
  const envelopes = state.envelopes
    .filter((e) => !e.archived)
    .map((e) => ({
      ...e,
      balance: balances.envelopes[e.id] ?? 0,
      allocatedThisMonth: allocated.get(e.id) ?? 0,
      spentThisMonth: spent.get(e.id) ?? 0,
      toFundThisMonth: remainingToFund(e, allocated.get(e.id) ?? 0),
    }));

  // Consommation du mois : toutes les dépenses confirmées (même à trier), hors enveloppes d'épargne.
  // Dépenses courantes : les mêmes, sauf celles générées par une charge fixe (loyer, Navigo...).
  // Un ticket de métro rangé dans Transports compte donc, le Navigo non.
  const savings = new Set(state.envelopes.filter((e) => e.isSavings).map((e) => e.id));
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  let monthSpent = 0;
  let variableSpent = 0;
  for (const t of state.transactions) {
    if (t.kind !== 'expense' || t.status !== 'confirmed' || t.date < monthStart || t.date > monthEnd) continue;
    if (t.envelopeId != null && savings.has(t.envelopeId)) continue;
    monthSpent += t.amount;
    if (t.recurringRuleId == null) variableSpent += t.amount;
  }
  const spending = envelopes.filter((e) => !e.isSavings);
  // Revenu attendu : revenus récurrents actifs et pas encore terminés, ramenés au mois.
  const income = state.rules
    .filter((r) => r.active && r.kind === 'income' && (r.endDate == null || r.endDate >= monthStart))
    .reduce((sum, r) => sum + monthlyEquivalent(r), 0);

  return {
    today,
    toAllocate: balances.toAllocate,
    netWorth: balances.netWorth,
    accounts: state.accounts
      .filter((a) => !a.archived)
      .map((a) => ({ ...a, balance: balances.accounts[a.id] ?? 0, lastImport: lastImportForAccount(db, a.id) })),
    envelopes,
    month: {
      start: monthStart,
      end: monthEnd,
      spent: monthSpent,
      budget: spending.reduce((sum, e) => sum + e.monthlyBudget, 0),
      variable: {
        spent: variableSpent,
        // Le budget courant est la part saisie à la main : les charges fixes ont leurs propres opérations.
        budget: spending.reduce((sum, e) => sum + (e.monthlyExtra ?? 0), 0),
      },
      saved: savedInMonth(state.accounts, state.envelopes, state.transactions, today),
      toFund: envelopes.reduce((sum, e) => sum + e.toFundThisMonth, 0),
      income,
      planned: envelopes.reduce((sum, e) => sum + e.monthlyBudget, 0),
    },
    alerts,
    unsortedCount: countUnsorted(db),
    // Une prévue n'est « en retard » qu'une fois sortie de la fenêtre de rapprochement : le relevé ne la confirmera plus.
    latePlanned: state.transactions
      .filter((t) => t.status === 'planned' && t.date < addDays(today, -MATCH_TOLERANCE_DAYS))
      .sort((a, b) => (a.date < b.date ? -1 : 1)),
    latestFunding: latestFundingView(db),
    watch: envelopesToWatch(state.envelopes, balances.envelopes, state.rules, state.transactions, today),
    pendingReview: buildPendingReview(state, db, today),
  };
}
