import { Hono } from 'hono';
import { z } from 'zod';
import { formatMonth, monthKey } from '@shared/dates';
import { envelopeFundSchema, envelopeInputSchema, envelopePatchSchema, idListSchema } from '@shared/schemas';
import type { AppEnv } from '../app';
import { BadRequestError } from '../errors';
import { createEnvelope, getEnvelope, listEnvelopes, reorderEnvelopes, updateEnvelope } from '../repos/envelopes';
import { bulkCreateTransactions } from '../repos/transactions';
import { validate } from '../validate';

const idParam = z.object({ id: z.coerce.number().int().positive() });
const listQuery = z.object({ archived: z.coerce.boolean().optional() });

export const envelopeRoutes = new Hono<AppEnv>()
  .get('/', validate('query', listQuery), (c) => {
    const { archived } = c.req.valid('query');
    return c.json(listEnvelopes(c.get('db'), { includeArchived: archived ?? false }));
  })
  .post('/', validate('json', envelopeInputSchema), (c) => {
    return c.json(createEnvelope(c.get('db'), c.req.valid('json')), 201);
  })
  .put('/reorder', validate('json', idListSchema), (c) => {
    return c.json(reorderEnvelopes(c.get('db'), c.req.valid('json').ids));
  })
  // Répartit en une fois : une allocation datée d'aujourd'hui par enveloppe, toutes ou aucune.
  .post('/fund', validate('json', envelopeFundSchema), (c) => {
    const db = c.get('db');
    const today = c.get('today');
    const label = `Budget ${formatMonth(monthKey(today))}`;
    const items = c.req.valid('json').items;
    for (const item of items) {
      if (getEnvelope(db, item.envelopeId).archived) throw new BadRequestError('Enveloppe archivée');
    }
    const created = bulkCreateTransactions(
      db,
      items.map((item) => ({ kind: 'allocation' as const, date: today, amount: item.amount, label, envelopeId: item.envelopeId })),
    );
    return c.json(created, 201);
  })
  .get('/:id', validate('param', idParam), (c) => {
    return c.json(getEnvelope(c.get('db'), c.req.valid('param').id));
  })
  .patch('/:id', validate('param', idParam), validate('json', envelopePatchSchema), (c) => {
    return c.json(updateEnvelope(c.get('db'), c.req.valid('param').id, c.req.valid('json')));
  });
