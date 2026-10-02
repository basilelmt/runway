import { Hono } from 'hono';
import { z } from 'zod';
import { applySortingRules } from '@core/sorting';
import { idListSchema, sortingRuleInputSchema } from '@shared/schemas';
import type { AppEnv } from '../app';
import { createSortingRule, deleteSortingRule, listSortingRules, reorderSortingRules, updateSortingRule } from '../repos/sorting-rules';
import { listTransactions, updateTransaction } from '../repos/transactions';
import type { Db } from '../db/client';
import { validate } from '../validate';

const idParam = z.object({ id: z.coerce.number().int().positive() });
const testSchema = z.object({ label: z.string().trim().min(1) });

export const sortingRuleRoutes = new Hono<AppEnv>()
  .get('/', (c) => c.json(listSortingRules(c.get('db'))))
  .post('/', validate('json', sortingRuleInputSchema), (c) => {
    return c.json(createSortingRule(c.get('db'), c.req.valid('json')), 201);
  })
  .put('/reorder', validate('json', idListSchema), (c) => {
    return c.json(reorderSortingRules(c.get('db'), c.req.valid('json').ids));
  })
  /** Range les opérations encore à trier selon les règles actuelles (utile après avoir créé une règle). */
  .post('/apply', (c) => {
    const db = c.get('db');
    const rules = listSortingRules(db);
    const unsorted = listTransactions(db, { unsorted: true, limit: 1000 });
    const assigned = db.transaction((tx) => {
      const t = tx as unknown as Db;
      let n = 0;
      for (const op of unsorted) {
        const envelopeId = applySortingRules(op.label, rules);
        if (envelopeId === null) continue;
        updateTransaction(t, op.id, { envelopeId });
        n++;
      }
      return n;
    });
    return c.json({ assigned });
  })
  .post('/test', validate('json', testSchema), (c) => {
    const envelopeId = applySortingRules(c.req.valid('json').label, listSortingRules(c.get('db')));
    return c.json({ envelopeId });
  })
  .put('/:id', validate('param', idParam), validate('json', sortingRuleInputSchema), (c) => {
    return c.json(updateSortingRule(c.get('db'), c.req.valid('param').id, c.req.valid('json')));
  })
  .delete('/:id', validate('param', idParam), (c) => {
    deleteSortingRule(c.get('db'), c.req.valid('param').id);
    return c.body(null, 204);
  });
