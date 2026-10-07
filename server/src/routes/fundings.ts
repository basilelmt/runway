import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../app';
import { dismissFunding, undoFunding } from '../repos/fundings';
import { validate } from '../validate';

const idParam = z.object({ id: z.coerce.number().int().positive() });

export const fundingRoutes = new Hono<AppEnv>()
  .post('/:id/undo', validate('param', idParam), (c) => {
    undoFunding(c.get('db'), c.req.valid('param').id);
    return c.body(null, 204);
  })
  .post('/:id/dismiss', validate('param', idParam), (c) => {
    dismissFunding(c.get('db'), c.req.valid('param').id);
    return c.body(null, 204);
  });
