import { Hono } from 'hono';
import { z } from 'zod';
import { envelopeInputSchema, idListSchema } from '@shared/schemas';
import type { AppEnv } from '../app';
import { createEnvelope, getEnvelope, listEnvelopes, reorderEnvelopes, updateEnvelope } from '../repos/envelopes';
import { validate } from '../validate';

const idParam = z.object({ id: z.coerce.number().int().positive() });
const listQuery = z.object({ archived: z.coerce.boolean().optional() });
const patchSchema = envelopeInputSchema.partial().extend({ archived: z.boolean().optional() });

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
  .get('/:id', validate('param', idParam), (c) => {
    return c.json(getEnvelope(c.get('db'), c.req.valid('param').id));
  })
  .patch('/:id', validate('param', idParam), validate('json', patchSchema), (c) => {
    return c.json(updateEnvelope(c.get('db'), c.req.valid('param').id, c.req.valid('json')));
  });
