import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { bankCompleteSchema, bankLinkSchema, bankRunSchema, bankStartSchema, type Settings } from '@shared/schemas';
import type { AppEnv } from '../app';
import type { PsuInfo } from '../bank/enable-banking';
import { BankProviderError, type BankProvider } from '../bank/provider';
import { AppError, BadRequestError } from '../errors';
import { getSettings } from '../repos/settings';
import { completeConnection, defaultBankProvider, disconnect, getState, isBankConfigured, linkAccounts, runSync, startConnection } from '../services/bank-sync';
import { detectSignals } from '../services/signals';
import { validate } from '../validate';

export type BankDeps = {
  /** Fabrique du fournisseur, injectable pour les tests. */
  provider?: (settings: Settings, psu: PsuInfo) => BankProvider;
  now?: () => Date;
  /** Appelé après une synchro qui a écrit des opérations (créées, ou rapprochées : leur libellé change). */
  onNewTransactions?: () => void;
};

const idParam = z.object({ id: z.coerce.number().int().positive() });

function psuInfo(c: Context<AppEnv>): PsuInfo {
  const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
  return { ip: forwarded || '127.0.0.1', userAgent: c.req.header('user-agent') ?? 'Runway' };
}

/**
 * Une erreur du fournisseur devient une réponse lisible plutôt qu'une 500 anonyme : son statut s'il
 * s'agit d'une erreur de la demande (4xx, par exemple une clé privée illisible), sinon une 502.
 */
async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof BankProviderError) throw new AppError(err.message, err.status >= 400 && err.status < 500 ? err.status : 502, 'bank_provider');
    if (err instanceof AppError) throw err;
    if (err instanceof Error) {
      // Erreur inattendue (bogue, base) : la trace reste dans la console du serveur.
      console.error('[bank-sync]', err);
      throw new AppError(err.message, 502, 'bank_provider');
    }
    throw err;
  }
}

export const bankSyncRoutes = (deps: BankDeps = {}) => {
  const makeProvider = deps.provider ?? defaultBankProvider;
  const now = deps.now ?? (() => new Date());

  function provider(c: Context<AppEnv>): BankProvider {
    const settings = getSettings(c.get('db'));
    if (!isBankConfigured(settings)) throw new BadRequestError('Identifiants Enable Banking manquants : renseigne-les dans Paramètres, section Banque');
    return makeProvider(settings, psuInfo(c));
  }

  return new Hono<AppEnv>()
    .get('/', (c) => c.json(getState(c.get('db'), isBankConfigured(getSettings(c.get('db'))), c.get('today'))))
    .post('/test', async (c) => c.json(await guard(() => provider(c).getApplication())))
    .post('/connections', validate('json', bankStartSchema), async (c) => {
      const { connectionId } = c.req.valid('json');
      const p = provider(c);
      return c.json(await guard(() => startConnection(c.get('db'), p, { connectionId: connectionId ?? undefined, now: now() })), 201);
    })
    .post('/connections/:id/complete', validate('param', idParam), validate('json', bankCompleteSchema), async (c) => {
      const p = provider(c);
      const { code, state } = c.req.valid('json');
      return c.json(await guard(() => completeConnection(c.get('db'), p, { connectionId: c.req.valid('param').id, code, state })));
    })
    .put('/connections/:id/accounts', validate('param', idParam), validate('json', bankLinkSchema), (c) => {
      return c.json(linkAccounts(c.get('db'), { connectionId: c.req.valid('param').id, links: c.req.valid('json').links, today: c.get('today') }));
    })
    .post('/run', validate('json', bankRunSchema), async (c) => {
      const settings = getSettings(c.get('db'));
      if (!isBankConfigured(settings)) return c.json({ reason: 'not_configured', connections: [] });
      const p = makeProvider(settings, psuInfo(c));
      const result = await runSync(c.get('db'), p, { today: c.get('today'), now: now(), onlyIfStaleMinutes: c.req.valid('json').onlyIfStaleMinutes });
      if (result.connections.some((r) => r.created > 0 || r.matched > 0)) deps.onNewTransactions?.();
      // Nouvelles opérations, erreur ou consentement qui approche : les signaux reflètent l'état après synchro.
      if (result.reason === 'ok') detectSignals(c.get('db'), c.get('today'), now());
      return c.json(result);
    })
    .delete('/connections/:id', validate('param', idParam), async (c) => {
      const settings = getSettings(c.get('db'));
      const p = isBankConfigured(settings) ? makeProvider(settings, psuInfo(c)) : null;
      await disconnect(c.get('db'), p, c.req.valid('param').id);
      return c.body(null, 204);
    });
};
