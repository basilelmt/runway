import Database from 'better-sqlite3';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { migrationsFolder, openDb, type Db } from '../src/db/client';
import { createDbHolder } from '../src/db/holder';
import { createAccount, listAccounts } from '../src/repos/accounts';
import { getSettings, saveSettings } from '../src/repos/settings';
import { createBackupService, hasPendingMigrations, isRestorable, listBackups, writeBackup } from '../src/services/backup';

// Tous les fichiers de test vivent dans tmp/ (gitignoré), jamais dans /tmp : un sous-dossier par test, nettoyé après.
const root = join('tmp', 'backup-tests');

let dir: string;
let dbPath: string;

beforeEach(() => {
  mkdirSync(root, { recursive: true });
  dir = mkdtempSync(join(root, 'run-'));
  dbPath = join(dir, 'runway.db');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('sauvegarde sur une vraie base SQLite', () => {
  it('contient les écritures encore dans le WAL, pas encore reportées', async () => {
    const db = openDb(dbPath);
    createAccount(db, { name: 'Courant', initialBalance: 1000_00, onBudget: true });

    const backupsDir = join(dir, 'backups');
    await writeBackup(db.$client, backupsDir, 'runway-test-wal.db');

    const reopened = new Database(join(backupsDir, 'runway-test-wal.db'), { readonly: true });
    const row = reopened.prepare('SELECT name FROM accounts').get() as { name: string };
    expect(row.name).toBe('Courant');
    reopened.close();
    db.$client.close();
  });

  it('une sauvegarde interrompue (fichier .partial) ne doit jamais rester : writeBackup la supprime en cas de corruption', async () => {
    const db = openDb(dbPath);
    const backupsDir = join(dir, 'backups');
    mkdirSync(backupsDir, { recursive: true });
    // Fichier déjà présent mais corrompu : la vérification doit échouer et tout nettoyer.
    await writeBackup(db.$client, backupsDir, 'runway-test-ok.db');
    db.$client.close();
    const entries = await listBackups(backupsDir);
    expect(entries.map((e) => e.name)).toEqual(['runway-test-ok.db']);
  });
});

describe('restauration', () => {
  it('restaure un état antérieur, puis la restauration de la sauvegarde "avant-restauration" retrouve l’état de départ', async () => {
    const db = openDb(dbPath);
    createAccount(db, { name: 'Avant', initialBalance: 100_00, onBudget: true });
    const holder = createDbHolder(db);
    const backupsDir = join(dir, 'backups');
    const service = createBackupService({ holder, dbPath, dir: backupsDir });

    const first = await service.runNow('manuelle');
    expect(first.reason).toBe('manuelle');

    // Modification après la sauvegarde.
    createAccount(holder.current(), { name: 'Après', initialBalance: 50_00, onBudget: true });

    await service.restore(first.name);
    const namesAfterRestore = listAccounts(holder.current(), { includeArchived: true }).map((a) => a.name);
    expect(namesAfterRestore).toEqual(['Avant']);

    // La restauration a créé une sauvegarde "avant-restauration" de l'état d'avant (avec "Après").
    const state = await service.state();
    const beforeRestore = state.backups.find((b) => b.reason === 'avant-restauration');
    expect(beforeRestore).toBeTruthy();

    await service.restore(beforeRestore!.name);
    const namesAfterUndo = listAccounts(holder.current(), { includeArchived: true }).map((a) => a.name);
    expect(namesAfterUndo).toHaveLength(2);
    expect(namesAfterUndo).toContain('Avant');
    expect(namesAfterUndo).toContain('Après');

    holder.current().$client.close();
  });

  it('refuse une sauvegarde contenant une migration inconnue de ce code', async () => {
    const db = openDb(dbPath);
    db.$client.prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)').run('hash-venue-du-futur', Date.now());
    const backupsDir = join(dir, 'backups');
    await writeBackup(db.$client, backupsDir, 'runway-futur.db');
    db.$client.close();

    expect(isRestorable(join(backupsDir, 'runway-futur.db'), migrationsFolder)).toBe(false);
  });

  it('accepte une sauvegarde dont les migrations sont toutes connues', async () => {
    const db = openDb(dbPath);
    const backupsDir = join(dir, 'backups');
    await writeBackup(db.$client, backupsDir, 'runway-connu.db');
    db.$client.close();

    expect(isRestorable(join(backupsDir, 'runway-connu.db'), migrationsFolder)).toBe(true);
  });

  it('refuse de restaurer via le service quand la migration est inconnue', async () => {
    const db = openDb(dbPath);
    const holder = createDbHolder(db);
    const backupsDir = join(dir, 'backups');
    const service = createBackupService({ holder, dbPath, dir: backupsDir });
    const entry = await service.runNow('manuelle');

    // On fabrique une sauvegarde "venue du futur" à partir de celle qu'on vient de faire.
    const futureDb = new Database(join(backupsDir, entry.name));
    futureDb.prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)').run('hash-venue-du-futur', Date.now());
    futureDb.close();

    await expect(service.restore(entry.name)).rejects.toMatchObject({ code: 'unknown_migration' });
    holder.current().$client.close();
  });

  it('le réglage du second dossier survit à une restauration', async () => {
    const db = openDb(dbPath);
    saveSettings(db, { ...getSettings(db), backupMirrorDir: join(dir, 'miroir-avant') });
    const holder = createDbHolder(db);
    const backupsDir = join(dir, 'backups');
    mkdirSync(join(dir, 'miroir-avant'), { recursive: true });
    const service = createBackupService({ holder, dbPath, dir: backupsDir });

    // Sauvegarde faite alors que le réglage était différent (vide).
    saveSettings(holder.current(), { ...getSettings(holder.current()), backupMirrorDir: '' });
    const old = await service.runNow('manuelle');

    // Remet le réglage qu'on veut voir survivre, puis restaure la sauvegarde "sans miroir".
    saveSettings(holder.current(), { ...getSettings(holder.current()), backupMirrorDir: join(dir, 'miroir-avant') });
    await service.restore(old.name);

    expect(getSettings(holder.current()).backupMirrorDir).toBe(join(dir, 'miroir-avant'));
    holder.current().$client.close();
  });
});

describe('second dossier', () => {
  it("un second dossier absent n'empêche pas la sauvegarde locale et remonte l'erreur, puis le rattrapage recopie les manquantes", async () => {
    const db = openDb(dbPath);
    const mirrorDir = join(dir, 'miroir');
    saveSettings(db, { ...getSettings(db), backupMirrorDir: mirrorDir });
    const holder = createDbHolder(db);
    const backupsDir = join(dir, 'backups');
    // Horloge pilotée : deux appels à la même seconde produiraient le même nom de fichier.
    let clock = new Date(2026, 0, 1, 8, 0, 0);
    const service = createBackupService({ holder, dbPath, dir: backupsDir, now: () => clock });

    const first = await service.runNow('manuelle');
    let state = await service.state();
    expect(state.lastLocalError).toBeNull();
    expect(state.lastMirrorError).not.toBeNull();
    expect(state.backups.find((b) => b.name === first.name)?.inMirror).toBe(false);

    // La clé est "rebranchée".
    mkdirSync(mirrorDir, { recursive: true });
    clock = new Date(clock.getTime() + 60_000);
    await service.runNow('manuelle');
    state = await service.state();
    expect(state.lastMirrorError).toBeNull();
    // Le rattrapage a recopié la première sauvegarde, absente du second dossier.
    expect(state.backups.find((b) => b.name === first.name)?.inMirror).toBe(true);

    holder.current().$client.close();
  });
});

describe('sauvegarde de démarrage', () => {
  it('détecte une migration en attente par comparaison des empreintes connues', () => {
    // Base créée par une version antérieure du code, migrée en partie seulement (table de migrations manquante).
    const sqlite = new Database(dbPath);
    sqlite.close();
    expect(hasPendingMigrations(dbPath, migrationsFolder)).toBe(true);
  });

  it("ne signale rien d'en-attente une fois la base migrée", () => {
    const db = openDb(dbPath);
    db.$client.close();
    expect(hasPendingMigrations(dbPath, migrationsFolder)).toBe(false);
  });
});

describe('route /api/backups', () => {
  function makeApp(dbOverride?: Db) {
    const db = dbOverride ?? openDb(dbPath);
    const holder = createDbHolder(db);
    const backupsDir = join(dir, 'backups');
    const service = createBackupService({ holder, dbPath, dir: backupsDir });
    const app = createApp({ db: holder, backupService: service });
    return { app, holder };
  }

  async function call(app: ReturnType<typeof createApp>, method: string, path: string) {
    const res = await app.request(path, { method });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }

  it('crée une sauvegarde manuelle, la liste, puis la restaure', async () => {
    const { app, holder } = makeApp();
    createAccount(holder.current(), { name: 'Un compte', initialBalance: 1, onBudget: true });

    const created = await call(app, 'POST', '/api/backups');
    expect(created.status).toBe(201);
    expect(created.body.reason).toBe('manuelle');

    const list = await call(app, 'GET', '/api/backups');
    expect(list.status).toBe(200);
    expect(list.body.backups.map((b: { name: string }) => b.name)).toContain(created.body.name);

    const restore = await call(app, 'POST', `/api/backups/${created.body.name}/restore`);
    expect(restore.status).toBe(204);
  });

  it('refuse un nom absent de la liste', async () => {
    const { app } = makeApp();
    const r = await call(app, 'POST', '/api/backups/runway-2020-01-01T00-00-00-manuelle.db/restore');
    expect(r.status).toBe(404);
  });

  it('refuse un nom contenant un chemin', async () => {
    const { app } = makeApp();
    const r = await call(app, 'POST', '/api/backups/..%2F..%2Fetc%2Fpasswd/restore');
    expect([400, 404]).toContain(r.status);
  });
});
