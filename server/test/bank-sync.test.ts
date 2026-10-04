import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { BankAccountInfo, BankProvider, BankTransaction } from '../src/bank/provider';
import { listBankAccounts, listConnections, updateConnection } from '../src/repos/bank';
import { createTransaction } from '../src/repos/transactions';
import { completeConnection, disconnect, getState, linkAccounts, runSync, startConnection } from '../src/services/bank-sync';
import { createTestApp, createTestDb, type TestApp, type TestContext } from './helpers';

const NOW = new Date('2026-10-04T10:00:00Z');
const TODAY = '2026-10-04';

const IBAN_COURANT = 'FR7620041010121234567K03022';
const IBAN_LIVRET = 'FR7620041010129876543210V42';

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

/** Faux agrégateur : comptes et opérations posés par le test, appels comptés. */
class FakeProvider implements BankProvider {
  accounts: BankAccountInfo[] = [
    { uid: 'u-courant', iban: IBAN_COURANT, name: 'Compte Courant Postal' },
    { uid: 'u-livret', iban: IBAN_LIVRET, name: 'Livret A' },
  ];
  transactions: Record<string, BankTransaction[]> = {};
  sessionStatus = 'AUTHORIZED';
  validUntil: string | null = '2027-01-02T00:00:00Z';
  maxConsent: number | null = 15552000;
  failListWith: Error | null = null;
  gate: Deferred<void> | null = null;
  calls: { method: string; args: unknown[] }[] = [];

  private log(method: string, ...args: unknown[]) {
    this.calls.push({ method, args });
  }
  async getApplication() {
    this.log('getApplication');
    return { name: 'Runway', environment: 'PRODUCTION' };
  }
  async getMaxConsentSeconds() {
    this.log('getMaxConsentSeconds');
    return this.maxConsent;
  }
  async startAuth(input: { state: string; validUntil: string; redirectUrl: string }) {
    this.log('startAuth', input);
    return { url: `https://auth.example/${input.state}` };
  }
  async createSession(code: string) {
    this.log('createSession', code);
    if (code === 'bad') throw new Error('Code refusé');
    return { sessionId: `sess-${code}`, validUntil: this.validUntil, accounts: this.accounts };
  }
  async getSession(sessionId: string) {
    this.log('getSession', sessionId);
    return { status: this.sessionStatus, validUntil: this.validUntil };
  }
  async listTransactions(uid: string, dateFrom: string, dateTo: string) {
    this.log('listTransactions', uid, dateFrom, dateTo);
    if (this.gate) await this.gate.promise;
    if (this.failListWith) throw this.failListWith;
    return (this.transactions[uid] ?? []).filter((t) => t.booking_date! >= dateFrom && t.booking_date! <= dateTo);
  }
  async deleteSession(sessionId: string) {
    this.log('deleteSession', sessionId);
  }
}

function tx(date: string, amount: string, side: 'DBIT' | 'CRDT', label: string, ref = `${date}-${label}`): BankTransaction {
  return { booking_date: date, transaction_amount: { amount, currency: 'EUR' }, credit_debit_indicator: side, status: 'BOOK', remittance_information: [label], entry_reference: ref };
}

let ctx: TestContext;
let provider: FakeProvider;
beforeEach(() => {
  ctx = createTestDb();
  provider = new FakeProvider();
});

/** Connexion complète : auth, session, liaison des deux comptes. */
async function connect(links?: { courant?: number | null; livret?: number | null }) {
  const start = await startConnection(ctx.db, provider, { now: NOW });
  const state = (provider.calls.find((c) => c.method === 'startAuth')!.args[0] as { state: string }).state;
  const view = await completeConnection(ctx.db, provider, { connectionId: start.connectionId, code: 'ok', state });
  const courant = view.accounts.find((a) => a.iban === IBAN_COURANT)!;
  const livret = view.accounts.find((a) => a.iban === IBAN_LIVRET)!;
  return linkAccounts(ctx.db, {
    connectionId: start.connectionId,
    today: TODAY,
    links: [
      { bankAccountId: courant.id, accountId: links?.courant === undefined ? ctx.courant.id : links.courant },
      { bankAccountId: livret.id, accountId: links?.livret === undefined ? ctx.livret.id : links.livret },
    ],
  });
}

describe('connexion', () => {
  it('démarre une autorisation avec la durée maximale de la banque et un state aléatoire', async () => {
    const start = await startConnection(ctx.db, provider, { now: NOW });
    const auth = provider.calls.find((c) => c.method === 'startAuth')!.args[0] as { state: string; validUntil: string; redirectUrl: string };
    expect(start.url).toBe(`https://auth.example/${auth.state}`);
    expect(auth.state).toMatch(/^[a-f0-9]{32}$/);
    expect(auth.validUntil).toBe('2027-04-02T10:00:00.000Z');
    expect(auth.redirectUrl).toBe('https://localhost:3000/bank-sync/callback');
    expect(listConnections(ctx.db)[0]).toMatchObject({ status: 'pending', state: auth.state });
    // Une connexion en attente n'apparaît pas dans l'état.
    expect(getState(ctx.db, true, TODAY).connections).toEqual([]);
  });

  it('sans durée connue, 90 jours ; une nouvelle autorisation purge la précédente en attente', async () => {
    provider.maxConsent = null;
    await startConnection(ctx.db, provider, { now: NOW });
    await startConnection(ctx.db, provider, { now: NOW });
    const auth = provider.calls.filter((c) => c.method === 'startAuth').at(-1)!.args[0] as { validUntil: string };
    expect(auth.validUntil).toBe('2027-01-02T10:00:00.000Z');
    expect(listConnections(ctx.db)).toHaveLength(1);
  });

  it('refuse un state inattendu', async () => {
    const start = await startConnection(ctx.db, provider, { now: NOW });
    await expect(completeConnection(ctx.db, provider, { connectionId: start.connectionId, code: 'ok', state: 'nope' })).rejects.toThrow(/Retour d'autorisation invalide/);
  });

  it('crée la session, propose les comptes par numéro IBAN et passe en authorized', async () => {
    ctx.db.run(`update accounts set bank_account_number = '1234567K030' where id = ${ctx.courant.id}`);
    const start = await startConnection(ctx.db, provider, { now: NOW });
    const state = (provider.calls.find((c) => c.method === 'startAuth')!.args[0] as { state: string }).state;
    const view = await completeConnection(ctx.db, provider, { connectionId: start.connectionId, code: 'ok', state });
    expect(view).toMatchObject({ status: 'authorized', validUntil: '2027-01-02T00:00:00Z', aspspName: 'La Banque Postale' });
    expect(view.accounts).toEqual([
      expect.objectContaining({ uid: 'u-courant', iban: IBAN_COURANT, bankName: 'Compte Courant Postal', accountId: ctx.courant.id, syncFrom: null }),
      expect.objectContaining({ uid: 'u-livret', iban: IBAN_LIVRET, bankName: 'Livret A', accountId: null, syncFrom: null }),
    ]);
  });

  it('la liaison fixe la date de départ : lendemain de la dernière opération, sinon 90 jours', async () => {
    createTransaction(ctx.db, { kind: 'expense', date: '2026-09-20', amount: 10_00, label: 'Ancien relevé', accountId: ctx.courant.id });
    const view = await connect();
    expect(view.status).toBe('active');
    expect(view.accounts.find((a) => a.iban === IBAN_COURANT)).toMatchObject({ accountId: ctx.courant.id, syncFrom: '2026-09-21' });
    expect(view.accounts.find((a) => a.iban === IBAN_LIVRET)).toMatchObject({ accountId: ctx.livret.id, syncFrom: '2026-07-06', linkedAt: TODAY });
  });

  it('la date de départ suit le dernier relevé importé, pas une saisie manuelle plus récente', async () => {
    const importId = ctx.db.run(`insert into imports (file_name, account_id, row_count, new_count, duplicate_count, matched_count) values ('releve.pdf', ${ctx.courant.id}, 1, 1, 0, 0)`).lastInsertRowid;
    createTransaction(ctx.db, { kind: 'expense', date: '2026-09-07', amount: 12_00, label: 'RELEVE PHARMACIE', accountId: ctx.courant.id, importId: Number(importId) });
    // Loyer confirmé à la main (ou occurrence récurrente confirmée) : pas issu d'un relevé.
    createTransaction(ctx.db, { kind: 'expense', date: '2026-10-01', amount: 800_00, label: 'Loyer', accountId: ctx.courant.id });
    expect(getState(ctx.db, true, TODAY).syncStartByAccount).toEqual({ [ctx.courant.id]: '2026-09-08', [ctx.livret.id]: '2026-07-06' });

    provider.transactions['u-courant'] = [tx('2026-09-15', '30.00', 'DBIT', 'CARTE CINEMA'), tx('2026-10-01', '800.00', 'DBIT', 'PRLV LOYER SCI')];
    const view = await connect();
    expect(view.accounts.find((a) => a.iban === IBAN_COURANT)).toMatchObject({ syncFrom: '2026-09-08', linkedAt: TODAY });
    const result = await runSync(ctx.db, provider, { today: TODAY, now: NOW });
    // Le loyer, à plus de 10 jours de la date de départ mais avant la liaison, est reconnu par la jonction.
    expect(result.connections[0]).toMatchObject({ created: 1, duplicates: 1 });
    const rows = ctx.db.all<{ label: string }>(`select label from transactions where account_id = ${ctx.courant.id} order by date`);
    expect(rows.map((r) => r.label)).toEqual(['RELEVE PHARMACIE', 'CARTE CINEMA', 'Loyer']);
  });

  it('un compte ignoré n’a pas de date de liaison', async () => {
    const view = await connect({ livret: null });
    expect(view.accounts.find((a) => a.iban === IBAN_LIVRET)).toMatchObject({ accountId: null, syncFrom: null, linkedAt: null });
  });

  it('déconnecte : session supprimée, statut revoked', async () => {
    const view = await connect();
    await disconnect(ctx.db, provider, view.id);
    expect(provider.calls.some((c) => c.method === 'deleteSession' && c.args[0] === 'sess-ok')).toBe(true);
    expect(getState(ctx.db, true, TODAY).connections[0]).toMatchObject({ status: 'revoked' });
  });

  it('renouvelle une connexion existante en gardant les liaisons', async () => {
    const view = await connect();
    const renew = await startConnection(ctx.db, provider, { now: NOW, connectionId: view.id });
    expect(renew.connectionId).toBe(view.id);
    const state = (provider.calls.filter((c) => c.method === 'startAuth').at(-1)!.args[0] as { state: string }).state;
    provider.accounts = [{ uid: 'u-courant-2', iban: IBAN_COURANT, name: 'CCP' }, { uid: 'u-livret', iban: IBAN_LIVRET, name: 'Livret A' }];
    const after = await completeConnection(ctx.db, provider, { connectionId: view.id, code: 'again', state });
    expect(after.status).toBe('active');
    expect(after.accounts.find((a) => a.iban === IBAN_COURANT)).toMatchObject({ uid: 'u-courant-2', accountId: ctx.courant.id, syncFrom: '2026-07-06' });
    expect(listConnections(ctx.db)[0]!.sessionId).toBe('sess-again');
  });
});

describe('synchronisation', () => {
  it('ne fait rien sans connexion active', async () => {
    expect(await runSync(ctx.db, provider, { today: TODAY, now: NOW })).toEqual({ reason: 'no_connection', connections: [] });
  });

  it('enregistre les nouvelles opérations, applique les règles, rapproche une prévue, écrit un import', async () => {
    createTransaction(ctx.db, { kind: 'expense', date: '2026-09-20', amount: 10_00, label: 'Ancien', accountId: ctx.courant.id });
    createTransaction(ctx.db, { kind: 'expense', date: '2026-10-03', amount: 800_00, label: 'Loyer', accountId: ctx.courant.id, envelopeId: ctx.loisirs.id, status: 'planned' });
    ctx.db.run(`insert into sorting_rules (pattern, envelope_id, priority) values ('carrefour', ${ctx.courses.id}, 0)`);
    provider.transactions['u-courant'] = [
      tx('2026-09-25', '42.10', 'DBIT', 'CARTE X1234 CARREFOUR'),
      tx('2026-10-01', '800.00', 'DBIT', 'PRLV LOYER'),
      tx('2026-10-02', '2000.00', 'CRDT', 'VIR SALAIRE'),
    ];
    const view = await connect();
    const result = await runSync(ctx.db, provider, { today: TODAY, now: NOW });
    expect(result.reason).toBe('ok');
    expect(result.connections[0]).toMatchObject({ connectionId: view.id, status: 'active', created: 2, matched: 1, duplicates: 0, skipped: 0, error: null });

    const list = provider.calls.filter((c) => c.method === 'listTransactions');
    expect(list.map((c) => c.args)).toEqual([
      ['u-courant', '2026-09-21', TODAY],
      ['u-livret', '2026-07-06', TODAY],
    ]);

    const rows = ctx.db.all<{ label: string; amount: number; kind: string; status: string; envelope_id: number | null; import_id: number | null }>(
      `select label, amount, kind, status, envelope_id, import_id from transactions where date >= '2026-09-25' order by date`,
    );
    expect(rows).toEqual([
      expect.objectContaining({ label: 'CARTE X1234 CARREFOUR', amount: 42_10, kind: 'expense', envelope_id: ctx.courses.id }),
      expect.objectContaining({ label: 'PRLV LOYER', amount: 800_00, status: 'confirmed', envelope_id: ctx.loisirs.id }),
      expect.objectContaining({ label: 'VIR SALAIRE', amount: 2000_00, kind: 'income' }),
    ]);
    expect(rows.every((r) => r.import_id !== null)).toBe(true);
    const imports = ctx.db.all<{ file_name: string; new_count: number; matched_count: number }>(`select file_name, new_count, matched_count from imports`);
    expect(imports).toEqual([{ file_name: 'Synchronisation La Banque Postale', new_count: 2, matched_count: 1 }]);

    const state = getState(ctx.db, true, TODAY);
    expect(state.connections[0]).toMatchObject({ lastSyncAt: NOW.toISOString(), lastError: null });
    expect(state.connections[0]!.accounts.find((a) => a.iban === IBAN_COURANT)!.lastSyncedDate).toBe('2026-10-02');
  });

  it('seconde synchro : chevauchement de 7 jours sans doublon, aucun import vide', async () => {
    provider.transactions['u-courant'] = [tx('2026-10-01', '5.00', 'DBIT', 'CAFE')];
    await connect();
    await runSync(ctx.db, provider, { today: TODAY, now: NOW });
    const again = await runSync(ctx.db, provider, { today: TODAY, now: NOW });
    expect(again.connections[0]).toMatchObject({ created: 0, matched: 0, duplicates: 1 });
    const list = provider.calls.filter((c) => c.method === 'listTransactions' && c.args[0] === 'u-courant');
    expect(list.at(-1)!.args[1]).toBe('2026-09-24');
    expect(ctx.db.all(`select id from imports`)).toHaveLength(1);
  });

  it('jonction : même date et même montant qu’une opération du relevé = doublon jusqu’à 10 jours après la liaison', async () => {
    createTransaction(ctx.db, { kind: 'expense', date: '2026-09-30', amount: 15_00, label: 'RELEVE CAFE DU COIN', accountId: ctx.courant.id });
    createTransaction(ctx.db, { kind: 'expense', date: '2026-09-28', amount: 10_00, label: 'Ancien', accountId: ctx.courant.id });
    // syncFrom = 2026-10-01 ; la banque renvoie une opération du 30/09 datée différemment ? Non : on teste
    // une opération le jour même du départ qui existe déjà sous un autre libellé.
    createTransaction(ctx.db, { kind: 'expense', date: '2026-10-01', amount: 20_00, label: 'RELEVE BOULANGERIE', accountId: ctx.courant.id });
    provider.transactions['u-courant'] = [
      tx('2026-10-01', '20.00', 'DBIT', 'CARTE BOULANGERIE'),
      tx('2026-10-01', '7.00', 'DBIT', 'CARTE PRESSE'),
      tx('2026-10-12', '20.00', 'DBIT', 'CARTE BOULANGERIE'),
    ];
    createTransaction(ctx.db, { kind: 'expense', date: '2026-10-12', amount: 20_00, label: 'Hors fenêtre', accountId: ctx.courant.id });
    const view = await connect();
    expect(view.accounts.find((a) => a.iban === IBAN_COURANT)!.syncFrom).toBe('2026-10-13');
    // Date de départ après les opérations : rien à synchroniser. On la force pour tester la fenêtre.
    const bank = listBankAccounts(ctx.db, view.id).find((a) => a.iban === IBAN_COURANT)!;
    ctx.db.run(`update bank_accounts set sync_from = '2026-10-01', linked_at = '2026-10-01' where id = ${bank.id}`);
    const result = await runSync(ctx.db, provider, { today: '2026-10-15', now: NOW });
    // 20 € du 01/10 : doublon de jonction ; 7 € : nouvelle ; 20 € du 12/10 : au-delà de 10 jours après la liaison, nouvelle.
    expect(result.connections[0]).toMatchObject({ created: 2, duplicates: 1 });
  });

  it('jonction : deux opérations identiques le même jour, une seule déjà connue', async () => {
    createTransaction(ctx.db, { kind: 'expense', date: '2026-10-01', amount: 5_00, label: 'RELEVE CAFE', accountId: ctx.courant.id });
    provider.transactions['u-courant'] = [tx('2026-10-01', '5.00', 'DBIT', 'CAFE', 'CAFE'), tx('2026-10-01', '5.00', 'DBIT', 'CAFE', 'CAFE 2')];
    const view = await connect();
    const bank = listBankAccounts(ctx.db, view.id).find((a) => a.iban === IBAN_COURANT)!;
    ctx.db.run(`update bank_accounts set sync_from = '2026-10-01', linked_at = '2026-10-01' where id = ${bank.id}`);
    const result = await runSync(ctx.db, provider, { today: TODAY, now: NOW });
    // Le relevé n'en connaît qu'une : la seconde est bien une nouvelle dépense.
    expect(result.connections[0]).toMatchObject({ created: 1, duplicates: 1 });
  });

  it('jonction : une opération déjà écrite par une synchro précédente ne masque pas une nouvelle identique', async () => {
    provider.transactions['u-courant'] = [tx('2026-10-02', '5.00', 'DBIT', 'CARTE CAFE', 'CAFE')];
    const view = await connect();
    const bank = listBankAccounts(ctx.db, view.id).find((a) => a.iban === IBAN_COURANT)!;
    ctx.db.run(`update bank_accounts set sync_from = '2026-10-01', linked_at = '2026-10-01' where id = ${bank.id}`);
    expect((await runSync(ctx.db, provider, { today: TODAY, now: NOW })).connections[0]).toMatchObject({ created: 1, duplicates: 0 });
    provider.transactions['u-courant'].push(tx('2026-10-02', '5.00', 'DBIT', 'CARTE CAFE BIS', 'CAFE 2'));
    const again = await runSync(ctx.db, provider, { today: TODAY, now: NOW });
    // La première est reconnue par empreinte : elle ne doit pas aussi consommer la jonction de la seconde.
    expect(again.connections[0]).toMatchObject({ created: 1, duplicates: 1 });
    const rows = ctx.db.all<{ amount: number }>(`select amount from transactions where kind = 'expense' and date = '2026-10-02'`);
    expect(rows).toEqual([{ amount: 5_00 }, { amount: 5_00 }]);
  });

  it('virement entre deux comptes synchronisés : transfert d’un côté, crédit interne de l’autre', async () => {
    provider.transactions['u-courant'] = [tx('2026-10-01', '100.00', 'DBIT', 'VIREMENT VERS LIVRET A')];
    provider.transactions['u-livret'] = [tx('2026-10-02', '100.00', 'CRDT', 'VIREMENT DE M LAMOTTE')];
    await connect();
    const result = await runSync(ctx.db, provider, { today: TODAY, now: NOW });
    expect(result.connections[0]).toMatchObject({ created: 1, duplicates: 1 });
    const rows = ctx.db.all<{ kind: string; account_id: number; to_account_id: number | null }>(`select kind, account_id, to_account_id from transactions`);
    expect(rows).toEqual([{ kind: 'transfer', account_id: ctx.courant.id, to_account_id: ctx.livret.id }]);
  });

  it('virement entre deux comptes synchronisés, compte receveur traité en premier : un seul transfert', async () => {
    provider.accounts = [...provider.accounts].reverse();
    provider.transactions['u-courant'] = [tx('2026-10-01', '100.00', 'DBIT', 'VIREMENT VERS LIVRET A')];
    provider.transactions['u-livret'] = [tx('2026-10-02', '100.00', 'CRDT', 'VIREMENT DE M LAMOTTE')];
    await connect();
    const result = await runSync(ctx.db, provider, { today: TODAY, now: NOW });
    expect(result.connections[0]).toMatchObject({ created: 1, duplicates: 1 });
    const rows = ctx.db.all<{ kind: string; account_id: number; to_account_id: number | null }>(`select kind, account_id, to_account_id from transactions`);
    expect(rows).toEqual([{ kind: 'transfer', account_id: ctx.courant.id, to_account_id: ctx.livret.id }]);
  });

  it('session expirée : la connexion passe en expired sans erreur', async () => {
    await connect();
    provider.sessionStatus = 'EXPIRED';
    const result = await runSync(ctx.db, provider, { today: TODAY, now: NOW });
    expect(result.connections[0]).toMatchObject({ status: 'expired', error: null });
    expect(getState(ctx.db, true, TODAY).connections[0]!.status).toBe('expired');
    expect(await runSync(ctx.db, provider, { today: TODAY, now: NOW })).toEqual({ reason: 'no_connection', connections: [] });
  });

  it('erreur réseau : stockée sur la connexion, levée au prochain succès', async () => {
    await connect();
    provider.failListWith = new Error('ECONNRESET');
    const failed = await runSync(ctx.db, provider, { today: TODAY, now: NOW });
    expect(failed.connections[0]).toMatchObject({ error: 'Synchronisation impossible : ECONNRESET', created: 0 });
    expect(getState(ctx.db, true, TODAY).connections[0]!.lastError).toBe('Synchronisation impossible : ECONNRESET');
    provider.failListWith = null;
    await runSync(ctx.db, provider, { today: TODAY, now: NOW });
    expect(getState(ctx.db, true, TODAY).connections[0]!.lastError).toBeNull();
  });

  it('onlyIfStaleMinutes : saute si la dernière synchro est récente', async () => {
    const view = await connect();
    updateConnection(ctx.db, view.id, { lastSyncAt: '2026-10-04T09:30:00Z' });
    expect(await runSync(ctx.db, provider, { today: TODAY, now: NOW, onlyIfStaleMinutes: 60 })).toEqual({ reason: 'fresh', connections: [] });
    expect((await runSync(ctx.db, provider, { today: TODAY, now: NOW, onlyIfStaleMinutes: 20 })).reason).toBe('ok');
  });

  it('deux appels concurrents partagent la même exécution', async () => {
    provider.transactions['u-courant'] = [tx('2026-10-01', '5.00', 'DBIT', 'CAFE')];
    await connect();
    provider.gate = deferred<void>();
    const a = runSync(ctx.db, provider, { today: TODAY, now: NOW });
    const b = runSync(ctx.db, provider, { today: TODAY, now: NOW });
    provider.gate.resolve();
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra).toBe(rb);
    expect(provider.calls.filter((c) => c.method === 'getSession')).toHaveLength(1);
  });

  it('ignore une opération illisible et compte skipped', async () => {
    provider.transactions['u-courant'] = [{ ...tx('2026-10-01', '5.00', 'DBIT', 'OK'), booking_date: '2026-10-01' }, { ...tx('2026-10-01', 'n/a', 'DBIT', 'KO') }];
    await connect();
    const result = await runSync(ctx.db, provider, { today: TODAY, now: NOW });
    expect(result.connections[0]).toMatchObject({ created: 1, skipped: 1 });
  });
});

describe('routes /api/bank-sync', () => {
  let t: TestApp;
  let p: FakeProvider;
  let consoleError: MockInstance<typeof console.error>;
  beforeEach(() => {
    p = new FakeProvider();
    t = createTestApp('2026-10-04', { bankProvider: p });
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    consoleError.mockRestore();
  });

  async function configure() {
    await t.call('PUT', '/api/settings', { forecastHorizonDays: 90, claudeModel: '', enableBankingAppId: 'app', enableBankingPrivateKey: 'key' });
  }

  it('sans identifiants : état non configuré, run sans erreur, autres routes en 400', async () => {
    expect((await t.call('GET', '/api/bank-sync')).body).toEqual({
      configured: false,
      redirectUrl: 'https://localhost:3000/bank-sync/callback',
      connections: [],
      syncStartByAccount: { [t.courant.id]: '2026-07-06', [t.livret.id]: '2026-07-06' },
    });
    expect((await t.call('POST', '/api/bank-sync/run', {})).body).toEqual({ reason: 'not_configured', connections: [] });
    const test = await t.call('POST', '/api/bank-sync/test', {});
    expect(test.status).toBe(400);
    expect(test.body.error).toMatch(/Paramètres/);
    expect((await t.call('POST', '/api/bank-sync/connections', {})).status).toBe(400);
  });

  it('parcours complet : test, connexion, retour, liaison, synchro, déconnexion', async () => {
    await configure();
    expect((await t.call('POST', '/api/bank-sync/test', {})).body).toEqual({ name: 'Runway', environment: 'PRODUCTION' });

    const start = await t.call('POST', '/api/bank-sync/connections', {});
    expect(start.status).toBe(201);
    expect(start.body.url).toMatch(/^https:\/\/auth\.example\//);
    const state = (p.calls.find((c) => c.method === 'startAuth')!.args[0] as { state: string }).state;

    const bad = await t.call('POST', `/api/bank-sync/connections/${start.body.connectionId}/complete`, { code: 'ok', state: 'wrong' });
    expect(bad.status).toBe(400);
    const done = await t.call('POST', `/api/bank-sync/connections/${start.body.connectionId}/complete`, { code: 'ok', state });
    expect(done.status).toBe(200);
    expect(done.body.status).toBe('authorized');
    expect(done.body.accounts).toHaveLength(2);

    p.transactions['u-courant'] = [tx('2026-10-01', '5.00', 'DBIT', 'CAFE')];
    const linked = await t.call('PUT', `/api/bank-sync/connections/${start.body.connectionId}/accounts`, {
      links: [
        { bankAccountId: done.body.accounts[0].id, accountId: t.courant.id },
        { bankAccountId: done.body.accounts[1].id, accountId: null },
      ],
    });
    expect(linked.body.status).toBe('active');

    const run = await t.call('POST', '/api/bank-sync/run', {});
    expect(run.body.reason).toBe('ok');
    expect(run.body.connections[0]).toMatchObject({ created: 1 });
    const listCall = p.calls.find((c) => c.method === 'listTransactions')!;
    expect(listCall.args[2]).toBe('2026-10-04');

    const stale = await t.call('POST', '/api/bank-sync/run', { onlyIfStaleMinutes: 60 });
    expect(stale.body.reason).toBe('fresh');

    const state2 = await t.call('GET', '/api/bank-sync');
    expect(state2.body.connections[0]).toMatchObject({ status: 'active', lastError: null });

    expect((await t.call('DELETE', `/api/bank-sync/connections/${start.body.connectionId}`)).status).toBe(204);
    expect((await t.call('GET', '/api/bank-sync')).body.connections[0].status).toBe('revoked');
  });

  it('renvoie une erreur lisible quand Enable Banking refuse la session', async () => {
    await configure();
    const start = await t.call('POST', '/api/bank-sync/connections', {});
    const state = (p.calls.find((c) => c.method === 'startAuth')!.args[0] as { state: string }).state;
    const res = await t.call('POST', `/api/bank-sync/connections/${start.body.connectionId}/complete`, { code: 'bad', state });
    expect(res.status).toBe(502);
    expect(res.body.error).toBe('Code refusé');
    expect(consoleError).toHaveBeenCalledWith(expect.stringMatching(/bank-sync/), expect.objectContaining({ message: 'Code refusé' }));
  });

  it('clé privée illisible : 400 avec le message du fournisseur, pas une 502', async () => {
    const real = createTestApp('2026-10-04');
    await real.call('PUT', '/api/settings', { forecastHorizonDays: 90, claudeModel: '', enableBankingAppId: 'app', enableBankingPrivateKey: 'pas une clé' });
    const res = await real.call('POST', '/api/bank-sync/test', {});
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'bank_provider', error: expect.stringMatching(/Clé privée Enable Banking illisible/) });
  });
});
