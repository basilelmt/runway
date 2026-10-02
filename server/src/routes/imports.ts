import { Hono } from 'hono';
import { z } from 'zod';
import { isoDateSchema } from '@shared/schemas';
import type { AppEnv } from '../app';
import { BadRequestError } from '../errors';
import { listImports } from '../repos/imports';
import { commitImport, previewImport } from '../services/import';
import { validate } from '../validate';

const MAX_SIZE = 5 * 1024 * 1024;

const commitSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  accountId: z.number().int().positive(),
  bankAccountNumber: z.string().trim().max(40).nullable().optional(),
  duplicateCount: z.number().int().min(0).default(0),
  rows: z
    .array(
      z.object({
        index: z.number().int().min(0),
        date: isoDateSchema,
        label: z.string().trim().min(1).max(200),
        signedAmount: z.number().int().refine((n) => n !== 0, 'Montant nul'),
        fingerprint: z.string().length(40),
        plannedId: z.number().int().positive().nullable(),
        envelopeId: z.number().int().positive().nullable(),
      }),
    )
    .min(1, 'Aucune opération à importer'),
});

export const importRoutes = new Hono<AppEnv>()
  .get('/', (c) => c.json(listImports(c.get('db'))))
  .post('/preview', async (c) => {
    const body = await c.req.parseBody();
    const file = body['file'];
    if (!(file instanceof File)) throw new BadRequestError('Fichier manquant (champ `file`)');
    if (file.size > MAX_SIZE) throw new BadRequestError('Fichier trop volumineux (5 Mo max)');
    const rawAccount = body['accountId'];
    const accountId = typeof rawAccount === 'string' && rawAccount ? Number(rawAccount) : null;
    if (accountId !== null && !Number.isInteger(accountId)) throw new BadRequestError('accountId invalide');
    const buffer = Buffer.from(await file.arrayBuffer());
    return c.json({ ...previewImport(c.get('db'), { buffer, accountId }), fileName: file.name });
  })
  .post('/commit', validate('json', commitSchema), (c) => {
    return c.json(commitImport(c.get('db'), c.req.valid('json')), 201);
  });
