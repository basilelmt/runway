import { Hono } from 'hono';
import { settingsSchema } from '@shared/schemas';
import type { AppEnv } from '../app';
import { getSettings, saveSettings } from '../repos/settings';
import { validate } from '../validate';

export const settingsRoutes = new Hono<AppEnv>()
  .get('/', (c) => c.json(getSettings(c.get('db'))))
  .put('/', validate('json', settingsSchema), (c) => c.json(saveSettings(c.get('db'), c.req.valid('json'))));
