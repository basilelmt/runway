import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../app';
import { dismissSignal, listActiveSignals } from '../repos/signals';
import { validate } from '../validate';

const idParam = z.object({ id: z.coerce.number().int().positive() });

export const signalRoutes = new Hono<AppEnv>()
  .get('/', (c) => c.json(listActiveSignals(c.get('db'))))
  .post('/:id/dismiss', validate('param', idParam), (c) => {
    dismissSignal(c.get('db'), c.req.valid('param').id, new Date().toISOString());
    return c.body(null, 204);
  });
