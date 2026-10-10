import Database from 'better-sqlite3';
import { rmSync, statSync } from 'node:fs';
import { copyFile, mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { backupsToDelete, formatBackupFilename, parseBackupFilename, reasonLabel, type RetentionEntry } from '@core/backups';
import type { BackupEntry, BackupsState } from '@shared/api-types';
import { migrationsFolder as defaultMigrationsFolder, openDb } from '../db/client';
import type { DbHolder } from '../db/holder';
import { AppError, BadRequestError, ConflictError, NotFoundError } from '../errors';
import { getSettings, saveSettings } from '../repos/settings';

/** Sauvegarde trouvée sur disque : structurée (notre format) ou ancienne copie manuelle. */
export type BackupFileEntry = { name: string; date: Date; reason: string; size: number; legacy: boolean };

/** `backups/` à côté du fichier de base ; pour une base en mémoire (tests), un dossier de `tmp/` du projet. */
export function defaultBackupsDir(dbPath: string): string {
  if (dbPath === ':memory:') return join(process.cwd(), 'tmp', 'backups-memoire');
  return join(dirname(dbPath), 'backups');
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Erreur du second dossier en clair : le message brut de Node (« ENOENT: ... copyfile ... ») ne dit rien à l'écran. */
export function mirrorMessage(err: unknown, mirrorDir: string): string {
  const code = (err as NodeJS.ErrnoException | null)?.code;
  if (code === 'ENOENT') return `le dossier ${mirrorDir} est introuvable (clé ou disque débranché ?)`;
  if (code === 'EACCES' || code === 'EPERM' || code === 'EROFS') return `Runway n’a pas le droit d’écrire dans ${mirrorDir}`;
  if (code === 'ENOSPC') return `plus de place dans ${mirrorDir}`;
  return message(err);
}

/**
 * Une connexion en lecture seule sur un fichier en mode WAL laisse quand même des `-wal`/`-shm`, même sans
 * aucune écriture. Le `-shm` (index partagé, jamais de données uniques) est toujours supprimable. Le `-wal`
 * ne l'est que s'il est vide : un `-wal` qui contient de vraies écritures pas encore reportées (celui de la
 * base réelle, lue pour `hasPendingMigrations` avant de l'ouvrir pour de bon) ne doit jamais être touché.
 */
function closeAndCleanupSidecars(db: Database.Database | undefined, path: string): void {
  db?.close();
  rmSync(`${path}-shm`, { force: true });
  const walPath = `${path}-wal`;
  try {
    if (statSync(walPath).size === 0) rmSync(walPath, { force: true });
  } catch {
    // Pas de -wal à nettoyer.
  }
}

/** Ouvre en lecture seule et lance `PRAGMA quick_check` ; `false` si le fichier est illisible ou corrompu. */
function verifyDb(path: string): boolean {
  let db: Database.Database | undefined;
  try {
    db = new Database(path, { readonly: true });
    const rows = db.pragma('quick_check', { simple: true }) as unknown;
    return rows === 'ok';
  } catch {
    return false;
  } finally {
    closeAndCleanupSidecars(db, path);
  }
}

/**
 * Sauvegarde `sqlite` (cohérente même pendant des écritures, WAL compris) dans `<dir>/<name>`, en écrivant
 * d'abord dans un fichier `.partial` renommé à la fin, pour qu'une sauvegarde interrompue n'apparaisse jamais
 * dans la liste. Vérifie le résultat ; un échec supprime le fichier produit.
 */
export async function writeBackup(sqlite: Database.Database, dir: string, name: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  const finalPath = join(dir, name);
  const partialPath = `${finalPath}.partial`;
  await sqlite.backup(partialPath);
  if (!verifyDb(partialPath)) {
    await rm(partialPath, { force: true });
    throw new Error('Vérification de la sauvegarde échouée (PRAGMA quick_check)');
  }
  await rename(partialPath, finalPath);
}

/** Copie une sauvegarde locale vers le second dossier, puis la vérifie comme la sauvegarde locale. */
export async function copyToMirror(localPath: string, mirrorDir: string, name: string): Promise<void> {
  const dest = join(mirrorDir, name);
  await copyFile(localPath, dest);
  if (!verifyDb(dest)) {
    await rm(dest, { force: true }).catch(() => {});
    throw new Error('Vérification de la copie échouée (PRAGMA quick_check)');
  }
}

/** Noms de fichiers `.db` d'un dossier (sauvegardes locales ou miroir) ; vide si le dossier est inaccessible. */
async function listNames(dir: string): Promise<Set<string>> {
  try {
    return new Set((await readdir(dir)).filter((n) => n.endsWith('.db')));
  } catch {
    return new Set();
  }
}

/**
 * Sauvegardes d'un dossier : les `.db` dont le nom suit notre format sont datées et raisonnées par leur
 * nom, les autres sont de vieilles copies manuelles (date de modification, raison `manuelle`). Les
 * `.partial`, `-wal` et `-shm` sont ignorés (ils ne finissent pas par `.db`).
 */
export async function listBackups(dir: string): Promise<BackupFileEntry[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const entries: BackupFileEntry[] = [];
  for (const name of names) {
    if (!name.endsWith('.db')) continue;
    const stats = await stat(join(dir, name));
    const parsed = parseBackupFilename(name);
    if (parsed) entries.push({ name, date: parsed.date, reason: parsed.reason, size: stats.size, legacy: false });
    else entries.push({ name, date: stats.mtime, reason: 'manuelle', size: stats.size, legacy: true });
  }
  return entries;
}

/** Délai sous lequel un redémarrage ne refait pas de sauvegarde (le serveur de dev redémarre à chaque modification). */
export const STARTUP_BACKUP_MIN_GAP_MS = 60 * 60_000;

/**
 * Raison de la sauvegarde de démarrage, ou null pour la sauter : une migration en attente sauvegarde
 * toujours, sinon seulement si la dernière sauvegarde du dossier date de plus d'une heure.
 */
export async function startupBackupReason(dir: string, pendingMigration: boolean, now: Date): Promise<'avant-migration' | 'demarrage' | null> {
  if (pendingMigration) return 'avant-migration';
  const latest = Math.max(0, ...(await listBackups(dir)).map((e) => e.date.getTime()));
  return now.getTime() - latest < STARTUP_BACKUP_MIN_GAP_MS ? null : 'demarrage';
}

/** Applique la règle de conservation à un dossier (local ou miroir) et supprime ce qui doit l'être. */
export async function cleanupOldBackups(dir: string, now: Date): Promise<string[]> {
  const entries = await listBackups(dir);
  const retention: RetentionEntry[] = entries.map((e) => ({ name: e.name, date: e.date, reason: e.reason }));
  const toDelete = backupsToDelete(retention, now);
  for (const name of toDelete) await rm(join(dir, name), { force: true });
  return toDelete;
}

/** Recopie vers le second dossier les sauvegardes locales au format Runway qui n'y sont pas encore. */
export async function catchUpMirror(dir: string, mirrorDir: string): Promise<void> {
  const local = (await listBackups(dir)).filter((e) => !e.legacy);
  const mirrored = await listNames(mirrorDir);
  for (const e of local) {
    if (mirrored.has(e.name)) continue;
    await copyToMirror(join(dir, e.name), mirrorDir, e.name);
  }
}

function migrationHashes(migrationsFolder: string): Set<string> {
  return new Set(readMigrationFiles({ migrationsFolder }).map((m) => m.hash));
}

function appliedHashes(sqlite: Database.Database): string[] {
  const hasTable = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'").get();
  if (!hasTable) return [];
  return (sqlite.prepare('SELECT hash FROM __drizzle_migrations').all() as { hash: string }[]).map((r) => r.hash);
}

/** Vrai si au moins une migration du dossier n'est pas encore appliquée à ce fichier. */
export function hasPendingMigrations(dbPath: string, migrationsFolder = defaultMigrationsFolder): boolean {
  const known = migrationHashes(migrationsFolder);
  const sqlite = new Database(dbPath, { readonly: true });
  try {
    const applied = new Set(appliedHashes(sqlite));
    return [...known].some((h) => !applied.has(h));
  } finally {
    closeAndCleanupSidecars(sqlite, dbPath);
  }
}

/** Refuse une sauvegarde dont `__drizzle_migrations` contient une migration inconnue de ce code (base plus récente). */
export function isRestorable(backupPath: string, migrationsFolder = defaultMigrationsFolder): boolean {
  const known = migrationHashes(migrationsFolder);
  const sqlite = new Database(backupPath, { readonly: true });
  try {
    return appliedHashes(sqlite).every((h) => known.has(h));
  } finally {
    closeAndCleanupSidecars(sqlite, backupPath);
  }
}

export type PerformBackupResult = { name: string; localError: string | null; mirrorError: string | null };

/**
 * Sauvegarde locale, puis miroir et nettoyage des deux dossiers. Un échec local empêche le miroir ; un échec
 * du miroir (dossier débranché, non inscriptible) n'empêche pas la sauvegarde locale de compter comme réussie.
 */
export async function performBackup(opts: { sqlite: Database.Database; dir: string; reason: string; date: Date; mirrorDir: string | null }): Promise<PerformBackupResult> {
  const name = formatBackupFilename(opts.date, opts.reason);
  await mkdir(opts.dir, { recursive: true });
  let localError: string | null = null;
  try {
    await writeBackup(opts.sqlite, opts.dir, name);
  } catch (err) {
    localError = message(err);
  }
  let mirrorError: string | null = null;
  if (!localError) {
    await cleanupOldBackups(opts.dir, opts.date);
    if (opts.mirrorDir) {
      try {
        await copyToMirror(join(opts.dir, name), opts.mirrorDir, name);
        await catchUpMirror(opts.dir, opts.mirrorDir);
        await cleanupOldBackups(opts.mirrorDir, opts.date);
      } catch (err) {
        mirrorError = mirrorMessage(err, opts.mirrorDir);
      }
    }
  }
  return { name, localError, mirrorError };
}

function toView(entry: BackupFileEntry, inMirror: boolean): BackupEntry {
  return { name: entry.name, date: entry.date.toISOString(), reason: entry.reason, reasonLabel: reasonLabel(entry.reason), size: entry.size, inMirror };
}

export type BackupService = {
  state(): Promise<BackupsState>;
  /** Sauvegarde manuelle immédiate ; 409 si une sauvegarde ou une restauration tourne déjà. */
  runNow(reason: string): Promise<BackupEntry>;
  /** Restaure une sauvegarde par son nom ; voir le plan dans la spec (sauvegarde préalable, bascule de connexion, réglage du second dossier). */
  restore(name: string): Promise<void>;
  /** Vérification horaire : sauvegarde si la dernière réussie date de plus de 24 h. N'échoue jamais (journalise seulement). */
  checkDaily(): Promise<void>;
  /** Lance la vérification horaire ; renvoie une fonction d'arrêt. */
  startHourlyCheck(): () => void;
};

export type BackupServiceDeps = {
  holder: DbHolder;
  /** Chemin du fichier de base, stable pour la durée de vie du serveur (une restauration garde le même chemin). */
  dbPath: string;
  dir?: string;
  migrationsFolder?: string;
  now?: () => Date;
  log?: (message: string) => void;
};

export function createBackupService(deps: BackupServiceDeps): BackupService {
  const dir = deps.dir ?? defaultBackupsDir(deps.dbPath);
  const migrationsFolder = deps.migrationsFolder ?? defaultMigrationsFolder;
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? ((m: string) => console.warn(m));
  let busy = false;
  let lastLocalError: string | null = null;
  let lastMirrorError: string | null = null;

  async function state(): Promise<BackupsState> {
    const settings = getSettings(deps.holder.current());
    const mirrorDir = settings.backupMirrorDir || null;
    const entries = await listBackups(dir);
    const mirrorNames = mirrorDir ? await listNames(mirrorDir) : new Set<string>();
    const sorted = [...entries].sort((a, b) => b.date.getTime() - a.date.getTime());
    const lastSuccessAt = entries.length === 0 ? null : new Date(Math.max(...entries.map((e) => e.date.getTime()))).toISOString();
    return {
      backups: sorted.map((e) => toView(e, mirrorNames.has(e.name))),
      lastSuccessAt,
      lastLocalError,
      lastMirrorError,
      localDir: dir,
      mirrorDir,
    };
  }

  /** Sauvegarde effective, sans le verrou (déjà posé par l'appelant). */
  async function doBackup(reason: string): Promise<BackupEntry> {
    const db = deps.holder.current();
    const mirrorDir = getSettings(db).backupMirrorDir || null;
    const result = await performBackup({ sqlite: db.$client, dir, reason, date: now(), mirrorDir });
    lastLocalError = result.localError;
    lastMirrorError = result.mirrorError;
    if (result.localError) throw new AppError(`Sauvegarde impossible : ${result.localError}`, 500, 'backup_failed');
    const entries = await listBackups(dir);
    const entry = entries.find((e) => e.name === result.name);
    const mirrorNames = mirrorDir ? await listNames(mirrorDir) : new Set<string>();
    return toView(entry ?? { name: result.name, date: now(), reason, size: 0, legacy: false }, mirrorDir !== null && mirrorNames.has(result.name));
  }

  async function runNow(reason: string): Promise<BackupEntry> {
    if (busy) throw new ConflictError('Une sauvegarde ou une restauration est déjà en cours');
    busy = true;
    try {
      return await doBackup(reason);
    } finally {
      busy = false;
    }
  }

  async function checkDaily(): Promise<void> {
    if (busy) return;
    const entries = await listBackups(dir);
    const last = entries.length === 0 ? 0 : Math.max(...entries.map((e) => e.date.getTime()));
    if (now().getTime() - last < 24 * 60 * 60 * 1000) return;
    busy = true;
    try {
      await doBackup('quotidienne');
    } catch (err) {
      log(`[sauvegardes] Sauvegarde quotidienne impossible : ${message(err)}`);
    } finally {
      busy = false;
    }
  }

  async function restore(name: string): Promise<void> {
    if (busy) throw new ConflictError('Une sauvegarde ou une restauration est déjà en cours');
    if (deps.dbPath === ':memory:') throw new BadRequestError('Restauration indisponible sur une base en mémoire');
    busy = true;
    try {
      const entries = await listBackups(dir);
      const entry = entries.find((e) => e.name === name);
      if (!entry) throw new NotFoundError('Sauvegarde introuvable');
      const backupPath = join(dir, name);
      if (!isRestorable(backupPath, migrationsFolder)) {
        throw new AppError('Cette sauvegarde contient une migration inconnue de cette version de Runway', 409, 'unknown_migration');
      }

      // Copie à part avant tout le reste : la sauvegarde "avant-restauration" de l'étape suivante a la même
      // raison et peut tomber à la même seconde (restaurer, puis restaurer son "avant-restauration" aussitôt
      // après) ; sans cette copie, elle écraserait le fichier qu'on est justement en train de restaurer.
      const stagedPath = `${backupPath}.restoring`;
      await copyFile(backupPath, stagedPath);
      try {
        // 1. Sauvegarde de l'état actuel, pour qu'une restauration se défasse toujours.
        const current = deps.holder.current();
        const mirrorDirBefore = getSettings(current).backupMirrorDir || null;
        const before = await performBackup({ sqlite: current.$client, dir, reason: 'avant-restauration', date: now(), mirrorDir: mirrorDirBefore });
        lastLocalError = before.localError;
        lastMirrorError = before.mirrorError;
        if (before.localError) throw new AppError(`Sauvegarde préalable impossible : ${before.localError}`, 500, 'backup_failed');

        // 2. Ferme la connexion, remplace runway.db par une copie de la sauvegarde, supprime -wal et -shm.
        current.$client.close();
        await copyFile(stagedPath, deps.dbPath);
        await rm(`${deps.dbPath}-wal`, { force: true });
        await rm(`${deps.dbPath}-shm`, { force: true });

        // 3. Rouvre la base (applique les migrations manquantes) et bascule le porteur de connexion.
        const next = openDb(deps.dbPath);
        deps.holder.replace(next);

        // 4. Remet le réglage du second dossier d'avant la restauration.
        saveSettings(next, { ...getSettings(next), backupMirrorDir: mirrorDirBefore ?? '' });
      } finally {
        await rm(stagedPath, { force: true });
      }
    } finally {
      busy = false;
    }
  }

  function startHourlyCheck(): () => void {
    const id = setInterval(() => void checkDaily(), 60 * 60 * 1000);
    return () => clearInterval(id);
  }

  return { state, runNow, restore, checkDaily, startHourlyCheck };
}
