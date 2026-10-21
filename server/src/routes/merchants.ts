import { Hono } from 'hono';
import { z } from 'zod';
import { merchantRenameSchema } from '@shared/schemas';
import type { AppEnv } from '../app';
import { getMerchant, renameMerchant } from '../repos/merchants';
import type { ClaudeTasks } from '../services/claude-tasks';
import type { Exec } from '../services/claude';
import { startMerchantWebSearch } from '../services/merchant-web';
import type { MerchantNamer } from '../services/merchants';
import { validate } from '../validate';

const keyParam = z.object({ key: z.string().min(1).max(200) });

export const merchantRoutes = (namer: MerchantNamer, tasks: ClaudeTasks, exec?: Exec) =>
  new Hono<AppEnv>()
    .get('/status', (c) => c.json(namer.status()))
    .post('/name', (c) => {
      namer.request();
      return c.json(namer.status());
    })
    .get('/:key', validate('param', keyParam), (c) => c.json(getMerchant(c.get('db'), c.req.valid('param').key, c.get('today'))))
    .put('/:key', validate('param', keyParam), validate('json', merchantRenameSchema), (c) => {
      const input = c.req.valid('json');
      const merchant = renameMerchant(c.get('db'), c.req.valid('param').key, input, c.get('today'));
      // Rendu à Claude : il le renomme ou le décrit sans attendre le prochain import.
      if (input.name === '' || input.description === '') namer.request();
      return c.json(merchant);
    })
    .post('/:key/describe', validate('param', keyParam), (c) =>
      c.json(startMerchantWebSearch(c.get('db'), c.req.valid('param').key, c.get('today'), tasks, { exec }), 202),
    );
