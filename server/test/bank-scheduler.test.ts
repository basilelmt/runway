import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BankProvider } from '../src/bank/provider';
import { createConnection, updateConnection } from '../src/repos/bank';
import { saveSettings } from '../src/repos/settings';
import { startBackgroundSync } from '../src/services/bank-scheduler';
import { createTestDb, type TestContext } from './helpers';

const NOW = new Date('2026-10-10T08:00:00.000Z');

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

/** Faux agrégateur minimal : compte les appels, peut retarder `getSession` pour simuler une synchro en cours. */
class FakeProvider implements BankProvider {
  calls: string[] = [];
  gate: Deferred<void> | null = null;
  async getApplication() {
    this.calls.push('getApplication');
    return { name: 'Runway', environment: 'PRODUCTION' };
  }
  async getMaxConsentSeconds() {
    return 15552000;
  }
  async startAuth() {
    return { url: 'https://auth.example' };
  }
  async createSession() {
    return { sessionId: 'sess', validUntil: null, accounts: [] };
  }
  async getSession() {
    this.calls.push('getSession');
    if (this.gate) await this.gate.promise;
    return { status: 'AUTHORIZED', validUntil: null };
  }
  async listTransactions() {
    this.calls.push('listTransactions');
    return [];
  }
  async deleteSession() {
    this.calls.push('deleteSession');
  }
}

let ctx: TestContext;
let provider: FakeProvider;
beforeEach(() => {
  ctx = createTestDb();
  provider = new FakeProvider();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

function configureBank() {
  saveSettings(ctx.db, { forecastHorizonDays: 90, claudeModel: '', enableBankingAppId: 'app', enableBankingPrivateKey: 'key', backupMirrorDir: '' });
}

function activeConnection() {
  const c = createConnection(ctx.db, { aspspName: 'La Banque Postale', aspspCountry: 'FR', state: 's' });
  return updateConnection(ctx.db, c.id, { status: 'active', sessionId: 'sess-1' });
}

describe('startBackgroundSync', () => {
  it('ne fait rien si Enable Banking n’est pas configuré', async () => {
    const { stop } = startBackgroundSync({ db: ctx.db, provider: () => provider, now: () => NOW });
    await vi.waitFor(() => expect(provider.calls).toEqual([]));
    stop();
  });

  it('synchronise tout de suite puis toutes les 30 minutes, sans dépasser le rythme fixé par onlyIfStaleMinutes', async () => {
    configureBank();
    activeConnection();
    const { stop } = startBackgroundSync({ db: ctx.db, provider: () => provider, now: () => new Date() });
    await vi.waitFor(() => expect(provider.calls).toContain('getSession'));
    expect(provider.calls.filter((c) => c === 'getSession')).toHaveLength(1);

    // 20 minutes plus tard (2 tentatives à 30 min, mais onlyIfStaleMinutes=360 doit en bloquer l'essentiel) :
    // ici on vérifie seulement qu'un deuxième passage à 30 min n'explose pas le nombre d'appels sans raison.
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    expect(provider.calls.filter((c) => c === 'getSession')).toHaveLength(1);
    stop();
  });

  it('ne double pas une synchro déjà en cours (verrou partagé avec une synchro manuelle)', async () => {
    configureBank();
    activeConnection();
    provider.gate = deferred();
    const { stop } = startBackgroundSync({ db: ctx.db, provider: () => provider, now: () => new Date(), intervalMs: 1000 });
    await vi.waitFor(() => expect(provider.calls).toContain('getSession'));
    // Un second passage pendant que le premier est bloqué sur `getSession` ne relance pas de session.
    await vi.advanceTimersByTimeAsync(1000);
    expect(provider.calls.filter((c) => c === 'getSession')).toHaveLength(1);
    provider.gate.resolve();
    stop();
  });

  it('désactivé par `enabled`, ne tente jamais rien', async () => {
    configureBank();
    activeConnection();
    const { stop } = startBackgroundSync({ db: ctx.db, provider: () => provider, now: () => new Date(), enabled: () => false });
    await vi.advanceTimersByTimeAsync(0);
    expect(provider.calls).toEqual([]);
    stop();
  });
});
