import { Hono } from 'hono';
import { today } from '@shared/dates';
import type { Db } from './db/client';
import { AppError } from './errors';
import { accountRoutes } from './routes/accounts';
import { askRoutes } from './routes/ask';
import { bankSyncRoutes, type BankDeps } from './routes/bank-sync';
import { envelopeRoutes } from './routes/envelopes';
import { fundingRoutes } from './routes/fundings';
import { importRoutes } from './routes/imports';
import { investRoutes } from './routes/invest';
import { exportRoutes, forecastRoutes, overviewRoutes, reportRoutes } from './routes/insights';
import { merchantRoutes } from './routes/merchants';
import { recurringRuleRoutes } from './routes/recurring-rules';
import { settingsRoutes } from './routes/settings';
import { signalRoutes } from './routes/signals';
import { sortingRoutes } from './routes/sorting';
import { sortingRuleRoutes } from './routes/sorting-rules';
import { transactionRoutes } from './routes/transactions';
import type { Exec, StreamExec } from './services/claude';
import type { ImportDeps } from './services/import';
import { materializeDue } from './services/materialize';
import { createMerchantNamer, type MerchantNamer } from './services/merchants';
import { createPrices, type PricesDeps } from './services/prices';

export type AppEnv = { Variables: { db: Db; today: string } };

export type AppOptions = {
  db: Db;
  /** Date du jour injectable pour les tests. */
  now?: () => string;
  /** Exécuteur du binaire `claude`, injectable pour les tests. */
  exec?: Exec;
  /** Exécuteur en flux de `claude` pour Demander, et identifiant de session, injectables pour les tests. */
  askStream?: StreamExec;
  askSessionId?: () => string;
  /** Extraction du texte des PDF, injectable pour les tests. */
  importDeps?: ImportDeps;
  /** Fournisseur bancaire et horloge, injectables pour les tests. */
  bankDeps?: BankDeps;
  /** Réseau (Yahoo, Binance) et horloge de l'écran Investir, injectables pour les tests. */
  investDeps?: PricesDeps & { onRunStarted?: (done: Promise<void>) => void };
  /** Nommage des marchands par Claude en tâche de fond ; par défaut, un nommeur qui utilise `exec`. */
  merchantNamer?: MerchantNamer;
};

export function createApp({ db, now = today, exec, askStream, askSessionId, importDeps, bankDeps, investDeps = {}, merchantNamer }: AppOptions) {
  const app = new Hono<AppEnv>();
  const prices = createPrices(db, investDeps);
  const namer = merchantNamer ?? createMerchantNamer(db, { exec });

  app.use('*', async (c, next) => {
    c.set('db', db);
    c.set('today', now());
    await next();
  });

  // Toute lecture ou écriture part d'un état où les occurrences dues existent.
  app.use('/api/*', async (c, next) => {
    materializeDue(db, c.get('today'));
    await next();
  });

  app.onError((err, c) => {
    if (err instanceof AppError) return c.json({ error: err.message, code: err.code }, err.status as 400);
    const sqliteCode = (err as { code?: string }).code ?? '';
    if (sqliteCode.startsWith('SQLITE_CONSTRAINT')) {
      const friendly = sqliteCode.includes('UNIQUE')
        ? 'Ce nom existe déjà'
        : sqliteCode.includes('FOREIGNKEY')
          ? 'Référence vers un élément inexistant ou encore utilisé'
          : 'Contrainte de données violée';
      return c.json({ error: friendly, code: 'conflict' }, 409);
    }
    console.error(err);
    return c.json({ error: 'Erreur interne', code: 'internal' }, 500);
  });

  app.notFound((c) => c.json({ error: 'Route inconnue', code: 'not_found' }, 404));

  app.get('/api/health', (c) => c.json({ ok: true }));
  app.route('/api/accounts', accountRoutes);
  app.route('/api/envelopes', envelopeRoutes);
  app.route('/api/fundings', fundingRoutes);
  app.route('/api/transactions', transactionRoutes);
  app.route('/api/recurring-rules', recurringRuleRoutes);
  app.route('/api/sorting-rules', sortingRuleRoutes);
  app.route('/api/sorting', sortingRoutes(exec ? { exec } : {}));
  app.route('/api/ask', askRoutes({ stream: askStream, newSessionId: askSessionId }));
  app.route('/api/settings', settingsRoutes);
  app.route('/api/overview', overviewRoutes);
  app.route('/api/forecast', forecastRoutes);
  app.route('/api/reports', reportRoutes);
  app.route('/api/merchants', merchantRoutes(namer));
  app.route('/api/signals', signalRoutes);
  app.route('/api/imports', importRoutes(importDeps, { onCommitted: () => namer.request() }));
  app.route('/api/bank-sync', bankSyncRoutes({ ...bankDeps, onNewTransactions: () => namer.request() }));
  app.route('/api/invest', investRoutes({ prices, exec, ...investDeps }));
  app.route('/api', exportRoutes);

  return app;
}
