import { Hono } from 'hono';
import { z } from 'zod';
import { transactionFilterSchema, transactionInputSchema } from '@shared/schemas';
import type { AppEnv } from '../app';
import type { Db } from '../db/client';
import { createTransaction, deleteTransaction, getTransaction, listTransactions, updateTransaction } from '../repos/transactions';
import { autoFund } from '../services/auto-funding';
import { validate } from '../validate';

const idParam = z.object({ id: z.coerce.number().int().positive() });

export const transactionRoutes = new Hono<AppEnv>()
  .get('/', validate('query', transactionFilterSchema), (c) => {
    return c.json(listTransactions(c.get('db'), c.req.valid('query')));
  })
  .post('/', validate('json', transactionInputSchema), (c) => {
    return c.json(createTransaction(c.get('db'), c.req.valid('json')), 201);
  })
  .get('/:id', validate('param', idParam), (c) => {
    return c.json(getTransaction(c.get('db'), c.req.valid('param').id));
  })
  .put('/:id', validate('param', idParam), validate('json', transactionInputSchema), (c) => {
    return c.json(updateTransaction(c.get('db'), c.req.valid('param').id, c.req.valid('json')));
  })
  .post('/:id/confirm', validate('param', idParam), (c) => {
    const db = c.get('db');
    const { id } = c.req.valid('param');
    getTransaction(db, id);
    return c.json(
      db.transaction((tx) => {
        const t = tx as unknown as Db;
        const confirmed = updateTransaction(t, id, { status: 'confirmed' });
        autoFund(t, id);
        return confirmed;
      }),
    );
  })
  .delete('/:id', validate('param', idParam), (c) => {
    deleteTransaction(c.get('db'), c.req.valid('param').id);
    return c.body(null, 204);
  });
