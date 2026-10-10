import { Hono } from 'hono';
import { z } from 'zod';
import { monthKeySchema, reviewApplySchema } from '@shared/schemas';
import type { AppEnv } from '../app';
import { applyReview, buildReview, cancelReview } from '../services/review';
import { validate } from '../validate';

const monthParam = z.object({ month: monthKeySchema });

export const reviewRoutes = new Hono<AppEnv>()
  .get('/:month', validate('param', monthParam), (c) => {
    return c.json(buildReview(c.get('db'), c.req.valid('param').month, c.get('today')));
  })
  .post('/:month', validate('param', monthParam), validate('json', reviewApplySchema), (c) => {
    return c.json(applyReview(c.get('db'), c.req.valid('param').month, c.get('today'), c.req.valid('json')));
  })
  .delete('/:month', validate('param', monthParam), (c) => {
    return c.json(cancelReview(c.get('db'), c.req.valid('param').month));
  });
