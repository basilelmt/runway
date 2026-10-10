import { Hono } from 'hono';
import { z } from 'zod';
import { advancesSettleSchema } from '@shared/schemas';
import type { AppEnv } from '../app';
import { listAdvanceViews, listPersonSummaries, reopenAdvance, settleAdvances } from '../repos/advances';
import { buildAdvanceSuggestions } from '../services/advances';
import { validate } from '../validate';

const idParam = z.object({ id: z.coerce.number().int().positive() });
const listQuery = z.object({ status: z.enum(['open', 'all']).default('open'), expenseId: z.coerce.number().int().positive().optional() });

export const advanceRoutes = new Hono<AppEnv>()
  .get('/', validate('query', listQuery), (c) => {
    const { status, expenseId } = c.req.valid('query');
    return c.json(listAdvanceViews(c.get('db'), status, expenseId));
  })
  .get('/people', (c) => c.json(listPersonSummaries(c.get('db'))))
  .get('/suggestions', (c) => c.json(buildAdvanceSuggestions(c.get('db'), c.get('today'))))
  .post('/settle', validate('json', advancesSettleSchema), (c) => {
    const { advanceIds, refundId } = c.req.valid('json');
    return c.json(settleAdvances(c.get('db'), advanceIds, refundId));
  })
  .post('/:id/reopen', validate('param', idParam), (c) => c.json(reopenAdvance(c.get('db'), c.req.valid('param').id)));
