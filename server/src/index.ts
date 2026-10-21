import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { relative } from 'node:path';
import { today } from '@shared/dates';
import { createApp } from './app';
import { migrationsFolder, openDb } from './db/client';
import { createDbHolder } from './db/holder';
import { failInterruptedRuns } from './repos/ideas';
import { startBackgroundSync } from './services/bank-scheduler';
import { createBackupService, defaultBackupsDir, startupBackup } from './services/backup';
import { materializeDue } from './services/materialize';
import { backfillMerchantKeys, createMerchantNamer } from './services/merchants';
import { detectSignals } from './services/signals';

const port = Number(process.env.PORT ?? 3000);
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const clientDist = fileURLToPath(new URL('../../client/dist', import.meta.url));
const dbPath = process.env.RUNWAY_DB ?? fileURLToPath(new URL('../../data/runway.db', import.meta.url));
const backupsDir = defaultBackupsDir(dbPath);

// Sauvegarde d'avant-démarrage (voir `startupBackup`). Une sauvegarde de démarrage manquée n'empêche pas de
// démarrer ; une sauvegarde d'avant-migration manquée, si : migrer sans filet, c'est risquer la base sans retour.
const startup = await startupBackup({ dbPath, dir: backupsDir, date: new Date(), migrationsFolder });
if (startup.error && startup.reason === 'avant-migration') {
  console.error(`[sauvegardes] Sauvegarde d'avant-migration impossible : ${startup.error}`);
  console.error(`[sauvegardes] Démarrage annulé : la base n'est pas migrée sans sauvegarde. Vérifie le dossier ${backupsDir} (place libre, droits), puis relance.`);
  process.exit(1);
}
if (startup.error) console.warn(`[sauvegardes] Sauvegarde de démarrage impossible : ${startup.error}`);

const db = openDb(dbPath);
const holder = createDbHolder(db);
const backupService = createBackupService({ holder, dbPath, dir: backupsDir });
// Vérification horaire : sauvegarde si la dernière réussie date de plus de 24 h.
backupService.startHourlyCheck();

// Une fournée d'idées ne survit pas à un redémarrage du serveur.
failInterruptedRuns(db, new Date().toISOString());
const created = materializeDue(db, today());
if (created > 0) console.log(`${created} occurrence(s) récurrente(s) créée(s)`);

// Opérations d'avant les marchands : leur clé est calculée une fois, puis plus rien n'est à faire.
const backfilled = backfillMerchantKeys(db);
if (backfilled > 0) console.log(`${backfilled} opération(s) rattachée(s) à un marchand`);

const merchantNamer = createMerchantNamer(holder);
// Nomme en tâche de fond les marchands apparus depuis le dernier démarrage, sans retarder l'écoute.
merchantNamer.request();

// Premier état des signaux au démarrage ; les autres passages suivent chaque synchro, import et modification de charge.
detectSignals(db, today());

// Synchro bancaire en tâche de fond : désactivable par RUNWAY_BACKGROUND_SYNC=0 (recette, worktrees sur la vraie base).
// Lit le porteur de connexion à chaque tentative (pas `db` figé) : une restauration ne doit jamais écrire sur une
// connexion fermée.
startBackgroundSync({
  db: holder,
  onResult: (result) => {
    if (result.connections.some((r) => r.created > 0 || r.matched > 0)) merchantNamer.request();
    detectSignals(holder.current(), today());
  },
  onError: (err) => console.error('[bank-scheduler]', err),
});

const app = createApp({ db: holder, merchantNamer, backupService, selfUrl: `http://127.0.0.1:${port}` });

if (existsSync(clientDist)) {
  app.use('/*', serveStatic({ root: relative(process.cwd(), clientDist) }));
  app.get('*', serveStatic({ root: relative(process.cwd(), clientDist), path: 'index.html' }));
}

serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
  console.log(`Runway écoute sur http://localhost:${info.port} (base : ${relative(repoRoot, dbPath)})`);
});
