import { forecast } from '@core/forecast';
import type { ForecastResponse } from '@shared/api-types';
import type { ISODate } from '@shared/dates';
import type { Db } from '../db/client';
import { getSettings } from '../repos/settings';
import { loadState } from './state';

export function buildForecast(db: Db, today: ISODate, horizonDays?: number): ForecastResponse {
  const state = loadState(db, today);
  const horizon = horizonDays ?? getSettings(db).forecastHorizonDays;
  const result = forecast(state, state.rules, today, horizon);
  return {
    ...result,
    accounts: state.accounts.filter((a) => !a.archived).map(({ id, name, onBudget }) => ({ id, name, onBudget })),
    envelopes: state.envelopes.filter((e) => !e.archived).map(({ id, name, color }) => ({ id, name, color })),
  };
}
