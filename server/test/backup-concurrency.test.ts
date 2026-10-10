import Database from 'better-sqlite3';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrationsFolder } from '../src/db/client';
import { hasPendingMigrations, isRestorable, writeBackup } from '../src/services/backup';

// Un second processus (le serveur de dev, un script) écrit dans la base pendant que celui-ci la lit pour
// hasPendingMigrations, isRestorable ou une sauvegarde. Supprimer le `-shm` d'une base ouverte ailleurs
// casse le partage du WAL entre les deux processus et perd des écritures sans erreur : ces tests le gardent.

const root = join('tmp', 'backup-concurrency-tests');
const betterSqlitePath = createRequire(import.meta.url).resolve('better-sqlite3');

let dir: string;
let dbPath: string;

beforeEach(() => {
  mkdirSync(root, { recursive: true });
  dir = mkdtempSync(join(root, 'run-'));
  dbPath = resolve(dir, 'runway.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec('CREATE TABLE t (x INTEGER NOT NULL)');
  db.close();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Processus qui insère `count` lignes une à une, avec une courte pause entre chaque, puis se ferme. */
function startWriter(count: number): Promise<number> {
  const script = `
    const Database = require(${JSON.stringify(betterSqlitePath)});
    const db = new Database(${JSON.stringify(dbPath)});
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');
    const insert = db.prepare('INSERT INTO t (x) VALUES (?)');
    const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
    for (let i = 0; i < ${count}; i++) { insert.run(i); sleep(2); }
    db.close();
  `;
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => (stderr += String(chunk)));
    child.on('error', fail);
    child.on('exit', (code) => (code === 0 ? done(count) : fail(new Error(`écrivain en échec (${code}) : ${stderr}`))));
  });
}

/** Lance l'écrivain, répète `action` tant qu'il tourne ; renvoie le nombre total de lignes attendues. */
async function whileWriting(count: number, action: (i: number) => unknown | Promise<unknown>): Promise<number> {
  let finished = false;
  let i = 0;
  const writer = startWriter(count).finally(() => (finished = true));
  while (!finished) {
    await action(i);
    writeOnce(i);
    i++;
    await new Promise((r) => setTimeout(r, 5));
  }
  await writer;
  return count + i;
}

/**
 * Ce que fait un second serveur ou script après la vérification : il écrit lui aussi. Une connexion ouverte à
 * chaque passage, comme un serveur qui démarre après hasPendingMigrations.
 */
function writeOnce(i: number): void {
  const db = new Database(dbPath);
  try {
    db.pragma('busy_timeout = 5000');
    db.prepare('INSERT INTO t (x) VALUES (?)').run(-1 - i);
  } finally {
    db.close();
  }
}

function rowCount(): number {
  const db = new Database(dbPath, { readonly: true });
  try {
    return (db.prepare('SELECT count(*) AS n FROM t').get() as { n: number }).n;
  } finally {
    db.close();
  }
}

describe('lecture de la vraie base pendant qu’un autre processus y écrit', () => {
  it('hasPendingMigrations ne fait perdre aucune écriture', async () => {
    const expected = await whileWriting(300, () => hasPendingMigrations(dbPath, migrationsFolder));
    expect(rowCount()).toBe(expected);
  });

  it('isRestorable sur une sauvegarde ne fait perdre aucune écriture à la vraie base', async () => {
    const backupsDir = join(dir, 'backups');
    const raw = new Database(dbPath);
    await writeBackup(raw, backupsDir, 'runway-test.db');
    raw.close();
    const expected = await whileWriting(300, () => isRestorable(join(backupsDir, 'runway-test.db'), migrationsFolder));
    expect(rowCount()).toBe(expected);
  });

  it('une sauvegarde ne fait perdre aucune écriture', async () => {
    const backupsDir = join(dir, 'backups');
    let n = 0;
    const expected = await whileWriting(300, async () => {
      const raw = new Database(dbPath);
      try {
        await writeBackup(raw, backupsDir, `runway-test-${n++}.db`);
      } finally {
        raw.close();
      }
    });
    expect(rowCount()).toBe(expected);
  });
});
