import { Hono } from 'hono';
import { z } from 'zod';
import { accountInputSchema, accountPatchSchema } from '@shared/schemas';
import type { AppEnv } from '../app';
import { createAccount, getAccount, listAccounts, updateAccount } from '../repos/accounts';
import { validate } from '../validate';

const idParam = z.object({ id: z.coerce.number().int().positive() });
const listQuery = z.object({ archived: z.coerce.boolean().optional() });

export const accountRoutes = new Hono<AppEnv>()
  .get('/', validate('query', listQuery), (c) => {
    const { archived } = c.req.valid('query');
    return c.json(listAccounts(c.get('db'), { includeArchived: archived ?? false }));
  })
  .post('/', validate('json', accountInputSchema), (c) => {
    return c.json(createAccount(c.get('db'), c.req.valid('json')), 201);
  })
  .get('/:id', validate('param', idParam), (c) => {
    return c.json(getAccount(c.get('db'), c.req.valid('param').id));
  })
  .patch('/:id', validate('param', idParam), validate('json', accountPatchSchema), (c) => {
    return c.json(updateAccount(c.get('db'), c.req.valid('param').id, c.req.valid('json')));
  });
