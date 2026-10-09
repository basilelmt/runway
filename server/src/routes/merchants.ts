import { Hono } from 'hono';
import { z } from 'zod';
import { merchantRenameSchema } from '@shared/schemas';
import type { AppEnv } from '../app';
import { getMerchant, renameMerchant } from '../repos/merchants';
import type { MerchantNamer } from '../services/merchants';
import { validate } from '../validate';

const keyParam = z.object({ key: z.string().min(1).max(200) });

export const merchantRoutes = (namer: MerchantNamer) =>
  new Hono<AppEnv>()
    .get('/status', (c) => c.json(namer.status()))
    .post('/name', (c) => {
      namer.request();
      return c.json(namer.status());
    })
    .get('/:key', validate('param', keyParam), (c) => c.json(getMerchant(c.get('db'), c.req.valid('param').key)))
    .put('/:key', validate('param', keyParam), validate('json', merchantRenameSchema), (c) => {
      const { name } = c.req.valid('json');
      const merchant = renameMerchant(c.get('db'), c.req.valid('param').key, name);
      // Rendu à Claude : il le renomme sans attendre le prochain import.
      if (name === '') namer.request();
      return c.json(merchant);
    });
