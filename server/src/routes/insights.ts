import { Hono } from 'hono';
import { z } from 'zod';
import { endOfMonth, startOfMonth } from '@shared/dates';
import { isoDateSchema } from '@shared/schemas';
import type { AppEnv } from '../app';
import { exportCsv, exportJson } from '../services/export';
import { buildForecast } from '../services/forecast';
import { buildOverview } from '../services/overview';
import { monthlyReport, netWorthReport, spendingReport } from '../services/reports';
import { validate } from '../validate';

const forecastQuery = z.object({ horizon: z.coerce.number().int().min(7).max(730).optional() });
const spendingQuery = z.object({ from: isoDateSchema.optional(), to: isoDateSchema.optional() });
const monthlyQuery = z.object({ months: z.coerce.number().int().min(1).max(60).default(12) });
const netWorthQuery = z.object({
  months: z.coerce.number().int().min(1).max(120).default(12),
  horizon: z.coerce.number().int().min(0).max(730).default(90),
});

export const overviewRoutes = new Hono<AppEnv>().get('/', (c) => c.json(buildOverview(c.get('db'), c.get('today'))));

export const forecastRoutes = new Hono<AppEnv>().get('/', validate('query', forecastQuery), (c) =>
  c.json(buildForecast(c.get('db'), c.get('today'), c.req.valid('query').horizon)),
);

export const reportRoutes = new Hono<AppEnv>()
  .get('/spending', validate('query', spendingQuery), (c) => {
    const today = c.get('today');
    const { from = startOfMonth(today), to = endOfMonth(today) } = c.req.valid('query');
    return c.json(spendingReport(c.get('db'), today, from, to));
  })
  .get('/monthly', validate('query', monthlyQuery), (c) => {
    return c.json(monthlyReport(c.get('db'), c.get('today'), c.req.valid('query').months));
  })
  .get('/net-worth', validate('query', netWorthQuery), (c) => {
    const { months, horizon } = c.req.valid('query');
    return c.json(netWorthReport(c.get('db'), c.get('today'), months, horizon));
  });

export const exportRoutes = new Hono<AppEnv>()
  .get('/export.json', (c) => {
    c.header('Content-Disposition', `attachment; filename="runway-${c.get('today')}.json"`);
    return c.json(exportJson(c.get('db')));
  })
  .get('/export.csv', (c) => {
    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="runway-operations-${c.get('today')}.csv"`);
    return c.body(exportCsv(c.get('db')));
  });
