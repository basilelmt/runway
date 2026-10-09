import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { relative } from 'node:path';
import { today } from '@shared/dates';
import { createApp } from './app';
import { openDb } from './db/client';
import { failInterruptedRuns } from './repos/ideas';
import { materializeDue } from './services/materialize';
import { backfillMerchantKeys } from './services/merchants';

const port = Number(process.env.PORT ?? 3000);
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const clientDist = fileURLToPath(new URL('../../client/dist', import.meta.url));
const dbPath = process.env.RUNWAY_DB ?? fileURLToPath(new URL('../../data/runway.db', import.meta.url));

const db = openDb(dbPath);
// Une fournée d'idées ne survit pas à un redémarrage du serveur.
failInterruptedRuns(db, new Date().toISOString());
const created = materializeDue(db, today());
if (created > 0) console.log(`${created} occurrence(s) récurrente(s) créée(s)`);

// Opérations d'avant les marchands : leur clé est calculée une fois, puis plus rien n'est à faire.
const backfilled = backfillMerchantKeys(db);
if (backfilled > 0) console.log(`${backfilled} opération(s) rattachée(s) à un marchand`);

const app = createApp({ db });

if (existsSync(clientDist)) {
  app.use('/*', serveStatic({ root: relative(process.cwd(), clientDist) }));
  app.get('*', serveStatic({ root: relative(process.cwd(), clientDist), path: 'index.html' }));
}

serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
  console.log(`Runway écoute sur http://localhost:${info.port} (base : ${relative(repoRoot, dbPath)})`);
});
