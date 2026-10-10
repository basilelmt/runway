/**
 * Sauvegarde manuelle immédiate de la base, serveur allumé ou non :
 *
 *   npm run db:backup                    -- raison "manuelle"
 *   npm run db:backup -- "avant purge"    -- raison "avant-purge"
 *
 * Lit `RUNWAY_DB` comme le serveur. Remplace les copies que les agents faisaient à la main avant de
 * corriger des données.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { kebabCase } from '@core/backups';
import { getSettings } from '../src/repos/settings';
import { defaultBackupsDir, performBackup } from '../src/services/backup';
import { openDb } from '../src/db/client';

const dbPath = process.env.RUNWAY_DB ?? fileURLToPath(new URL('../../data/runway.db', import.meta.url));
if (!existsSync(dbPath)) {
  console.error(`Base introuvable : ${dbPath}`);
  process.exit(1);
}

const reasonArg = process.argv[2];
const reason = reasonArg ? kebabCase(reasonArg) : 'manuelle';

const db = openDb(dbPath);
const mirrorDir = getSettings(db).backupMirrorDir || null;
const result = await performBackup({ sqlite: db.$client, dir: defaultBackupsDir(dbPath), reason, date: new Date(), mirrorDir });
db.$client.close();

if (result.localError) {
  console.error(`Sauvegarde impossible : ${result.localError}`);
  process.exit(1);
}
console.log(`Sauvegarde créée : ${result.name}`);
if (result.mirrorError) console.warn(`Copie vers le second dossier impossible : ${result.mirrorError}`);
