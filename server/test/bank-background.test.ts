import { spawn } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { Settings } from '@shared/schemas';
import { EnableBankingClient, type PsuInfo } from '../src/bank/enable-banking';
import { openDb, type Db } from '../src/db/client';
import { createConnection, updateConnection } from '../src/repos/bank';
import { saveSettings, writeSettingKey } from '../src/repos/settings';
import { startBackgroundSync } from '../src/services/bank-scheduler';
import { claimBackgroundAttempt } from '../src/services/bank-sync';
import { createTestDb, quietMerchantNamer } from './helpers';

const pem = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

/** Faux Enable Banking au niveau HTTP : garde les en-têtes de chaque appel, session valide sans compte lié. */
function fakeEnableBanking() {
  const calls: { path: string; headers: Headers }[] = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const path = String(input).replace('https://api.enablebanking.com', '');
    calls.push({ path, headers: new Headers(init?.headers) });
    return new Response(JSON.stringify({ status: 'AUTHORIZED', access: { valid_until: null } }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { fetchFn, calls };
}

function configure(db: Db) {
  saveSettings(db, { forecastHorizonDays: 90, claudeModel: '', homeArea: '', enableBankingAppId: 'app', enableBankingPrivateKey: pem, backupMirrorDir: '' });
  const c = createConnection(db, { aspspName: 'La Banque Postale', aspspCountry: 'FR', state: 's' });
  updateConnection(db, c.id, { status: 'active', sessionId: 'sess-1' });
}

describe('en-têtes PSU', () => {
  it('la synchro de fond n’envoie aucun en-tête Psu-* (utilisateur absent)', async () => {
    const { db } = createTestDb();
    configure(db);
    const eb = fakeEnableBanking();
    let results = 0;
    const { stop } = startBackgroundSync({
      db,
      provider: (s, psu) => new EnableBankingClient({ appId: s.enableBankingAppId, privateKey: s.enableBankingPrivateKey, psu, fetch: eb.fetchFn }),
      onResult: () => results++,
      enabled: () => true,
    });
    await expect.poll(() => results).toBe(1);
    stop();
    expect(eb.calls.map((c) => c.path)).toEqual(['/sessions/sess-1']);
    expect(eb.calls[0]!.headers.get('psu-ip-address')).toBeNull();
    expect(eb.calls[0]!.headers.get('psu-user-agent')).toBeNull();
  });

  it('une synchro lancée depuis l’interface garde les siens (utilisateur présent)', async () => {
    const { db } = createTestDb();
    configure(db);
    const eb = fakeEnableBanking();
    const app = createApp({
      db,
      merchantNamer: quietMerchantNamer(db),
      bankDeps: { provider: (s, psu) => new EnableBankingClient({ appId: s.enableBankingAppId, privateKey: s.enableBankingPrivateKey, psu, fetch: eb.fetchFn }) },
    });
    const res = await app.request('/api/bank-sync/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': 'Firefox', 'x-forwarded-for': '192.168.1.20' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    expect(eb.calls[0]!.headers.get('psu-ip-address')).toBe('192.168.1.20');
    expect(eb.calls[0]!.headers.get('psu-user-agent')).toBe('Firefox');
  });
});

describe('deux serveurs sur la même base', () => {
  const root = join('tmp', 'bank-background-tests');
  let dir: string;
  beforeEach(() => {
    mkdirSync(root, { recursive: true });
    dir = mkdtempSync(join(root, 'run-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('une seule des deux connexions obtient la tentative, puis à nouveau après 10 minutes', () => {
    const path = join(dir, 'runway.db');
    const a = openDb(path);
    const b = openDb(path);
    const now = new Date('2026-10-10T08:00:00.000Z');
    expect(claimBackgroundAttempt(a, now)).toBe(true);
    expect(claimBackgroundAttempt(b, now)).toBe(false);
    expect(claimBackgroundAttempt(b, new Date('2026-10-10T08:09:00.000Z'))).toBe(false);
    expect(claimBackgroundAttempt(b, new Date('2026-10-10T08:10:00.000Z'))).toBe(true);
    a.$client.close();
    b.$client.close();
  });

  it('une tentative de fond démarrée par l’autre serveur il y a moins de 10 minutes : aucun appel à la banque', async () => {
    const path = join(dir, 'runway.db');
    const a = openDb(path);
    const b = openDb(path);
    configure(a);
    const eb = fakeEnableBanking();
    const provider = (s: Settings, psu: PsuInfo | null) =>
      new EnableBankingClient({ appId: s.enableBankingAppId, privateKey: s.enableBankingPrivateKey, psu, fetch: eb.fetchFn });
    // Le second serveur a pris la main il y a 2 minutes et n'a pas encore fini.
    writeSettingKey(b, 'bankBackgroundSyncAttemptAt', new Date(Date.now() - 2 * 60_000).toISOString());
    let results = 0;
    const { stop } = startBackgroundSync({ db: a, provider, onResult: () => results++, enabled: () => true });
    await expect.poll(() => results).toBe(1);
    stop();
    expect(eb.calls).toEqual([]);
    a.$client.close();
    b.$client.close();
  });

  it('deux processus qui réclament la tentative en même temps : un seul l’obtient', async () => {
    const path = resolve(dir, 'runway.db');
    openDb(path).$client.close();
    const script = `
      import { openDb } from ${JSON.stringify(resolve('server/src/db/client.ts'))};
      import { claimBackgroundAttempt } from ${JSON.stringify(resolve('server/src/services/bank-sync.ts'))};
      const db = openDb(${JSON.stringify(path)});
      process.stdout.write(String(claimBackgroundAttempt(db, new Date('2026-10-10T08:00:00.000Z'))));
      db.$client.close();
    `;
    const claim = () =>
      new Promise<string>((done, fail) => {
        const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], { stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '';
        let err = '';
        child.stdout.on('data', (c) => (out += String(c)));
        child.stderr.on('data', (c) => (err += String(c)));
        child.on('exit', (code) => (code === 0 ? done(out) : fail(new Error(err))));
      });
    const results = await Promise.all([claim(), claim()]);
    expect(results.sort()).toEqual(['false', 'true']);
  });
});
