import { Hono } from 'hono';
import { today } from '@shared/dates';
import type { Db } from './db/client';
import { AppError } from './errors';
import { accountRoutes } from './routes/accounts';
import { envelopeRoutes } from './routes/envelopes';
import { importRoutes } from './routes/imports';
import { exportRoutes, forecastRoutes, overviewRoutes, reportRoutes } from './routes/insights';
import { recurringRuleRoutes } from './routes/recurring-rules';
import { settingsRoutes } from './routes/settings';
import { sortingRoutes } from './routes/sorting';
import { sortingRuleRoutes } from './routes/sorting-rules';
import { transactionRoutes } from './routes/transactions';
import type { Exec } from './services/claude';
import { materializeDue } from './services/materialize';

export type AppEnv = { Variables: { db: Db; today: string } };

export type AppOptions = {
  db: Db;
  /** Date du jour injectable pour les tests. */
  now?: () => string;
  /** Exécuteur du binaire `claude`, injectable pour les tests. */
  exec?: Exec;
};

export function createApp({ db, now = today, exec }: AppOptions) {
  const app = new Hono<AppEnv>();

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
  app.route('/api/transactions', transactionRoutes);
  app.route('/api/recurring-rules', recurringRuleRoutes);
  app.route('/api/sorting-rules', sortingRuleRoutes);
  app.route('/api/sorting', sortingRoutes(exec ? { exec } : {}));
  app.route('/api/settings', settingsRoutes);
  app.route('/api/overview', overviewRoutes);
  app.route('/api/forecast', forecastRoutes);
  app.route('/api/reports', reportRoutes);
  app.route('/api/imports', importRoutes);
  app.route('/api', exportRoutes);

  return app;
}
