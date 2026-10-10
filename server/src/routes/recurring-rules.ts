import { Hono } from 'hono';
import { z } from 'zod';
import { monthlyEquivalent, nextOccurrence } from '@core/recurrence';
import { recurringRuleInputSchema, type RecurringRule } from '@shared/schemas';
import type { AppEnv } from '../app';
import { createRule, deleteRule, getRule, listRules, setRuleActive, updateRule } from '../repos/recurring-rules';
import { detectSignals } from '../services/signals';
import { validate } from '../validate';

const idParam = z.object({ id: z.coerce.number().int().positive() });
const activeSchema = z.object({ active: z.boolean() });

export type RecurringRuleView = RecurringRule & { nextDate: string | null; monthlyEquivalent: number };

function view(rule: RecurringRule, today: string): RecurringRuleView {
  return { ...rule, nextDate: nextOccurrence(rule, today), monthlyEquivalent: monthlyEquivalent(rule) };
}

export const recurringRuleRoutes = new Hono<AppEnv>()
  .get('/', (c) => {
    const today = c.get('today');
    return c.json(listRules(c.get('db')).map((r) => view(r, today)));
  })
  .post('/', validate('json', recurringRuleInputSchema), (c) => {
    const created = createRule(c.get('db'), c.req.valid('json'));
    // Une nouvelle charge fixe peut couvrir un marchand jusque-là signalé en « nouveau prélèvement ».
    detectSignals(c.get('db'), c.get('today'));
    return c.json(view(created, c.get('today')), 201);
  })
  .get('/:id', validate('param', idParam), (c) => {
    return c.json(view(getRule(c.get('db'), c.req.valid('param').id), c.get('today')));
  })
  .put('/:id', validate('param', idParam), validate('json', recurringRuleInputSchema), (c) => {
    const updated = updateRule(c.get('db'), c.req.valid('param').id, c.req.valid('json'));
    // Montant mis à jour : le signal de changement de prix qui le concerne se résout.
    detectSignals(c.get('db'), c.get('today'));
    return c.json(view(updated, c.get('today')));
  })
  .patch('/:id/active', validate('param', idParam), validate('json', activeSchema), (c) => {
    return c.json(view(setRuleActive(c.get('db'), c.req.valid('param').id, c.req.valid('json').active), c.get('today')));
  })
  .delete('/:id', validate('param', idParam), (c) => {
    deleteRule(c.get('db'), c.req.valid('param').id);
    return c.body(null, 204);
  });
