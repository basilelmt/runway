import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../app';
import type { BackupService } from '../services/backup';
import { validate } from '../validate';

/** Pas de chemin arbitraire : un simple nom de fichier, vérifié ensuite contre la liste réelle du dossier. */
const nameParam = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(260)
    .refine((s) => !s.includes('/') && !s.includes('\\'), 'Nom de sauvegarde invalide'),
});

export const backupRoutes = (service: BackupService) =>
  new Hono<AppEnv>()
    .get('/', async (c) => c.json(await service.state()))
    .post('/', async (c) => c.json(await service.runNow('manuelle'), 201))
    .post('/:name/restore', validate('param', nameParam), async (c) => {
      await service.restore(c.req.valid('param').name);
      return c.body(null, 204);
    });
