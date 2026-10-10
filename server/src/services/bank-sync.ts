import { randomBytes } from 'node:crypto';
import type { BankAccountView, BankAuthStart, BankConnectionView, BankSyncConnectionResult, BankSyncRunResult, BankSyncState, ImportPreviewRow } from '@shared/api-types';
import { addDays, compareISODate, type ISODate } from '@shared/dates';
import type { BankLinkInput, Settings } from '@shared/schemas';
import { EnableBankingClient, type PsuInfo } from '../bank/enable-banking';
import { toSourceRow } from '../bank/mapping';
import type { Aspsp, BankProvider } from '../bank/provider';
import type { Db } from '../db/client';
import { BadRequestError } from '../errors';
import { findAccountByBankNumber, getAccount, listAccounts } from '../repos/accounts';
import {
  createConnection,
  deletePendingConnections,
  getBankAccount,
  getConnection,
  listBankAccounts,
  listConnections,
  updateBankAccount,
  updateConnection,
  upsertBankAccount,
  type BankAccount,
  type BankConnection,
} from '../repos/bank';
import { countConfirmedOn, lastConfirmedDate, lastImportedDate } from '../repos/transactions';
import { buildPreview, commitImport, markClaimedCounterparts, type Sibling, type SourceRow } from './import';

export const ASPSP: Aspsp = { name: 'La Banque Postale', country: 'FR' };
/** Déclarée telle quelle dans l'application Enable Banking. Le navigateur ne la charge pas : l'utilisateur colle l'URL. */
export const REDIRECT_URL = 'https://localhost:3000/bank-sync/callback';

export function isBankConfigured(s: Settings): boolean {
  return s.enableBankingAppId !== '' && s.enableBankingPrivateKey !== '';
}

/** Fournisseur par défaut (le vrai Enable Banking), partagé entre les routes et le planificateur de fond. */
export const defaultBankProvider = (s: Settings, psu: PsuInfo): BankProvider => new EnableBankingClient({ appId: s.enableBankingAppId, privateKey: s.enableBankingPrivateKey, psu });

const SYNC_FILE_NAME = 'Synchronisation La Banque Postale';
const PARSER_ID = 'enablebanking';
const DEFAULT_CONSENT_SECONDS = 90 * 86_400;
/** Les banques datent parfois en retard : on relit les derniers jours, l'empreinte absorbe le chevauchement. */
const OVERLAP_DAYS = 7;
/**
 * Jusqu'à ce nombre de jours après la liaison, une opération déjà connue (date + montant) est un doublon
 * de jonction : saisies manuelles et récurrences confirmées entre la date de départ et la liaison,
 * plus quelques jours pour les opérations que la banque date en retard.
 */
const JUNCTION_DAYS = 10;
const EMPTY_ACCOUNT_HISTORY_DAYS = 90;
/**
 * Hors première synchro, on ne demande jamais plus de 89 jours d'historique : passé les premières
 * minutes après l'autorisation, beaucoup de banques refusent de remonter plus loin (DSP2, 90 jours).
 */
const MAX_HISTORY_DAYS_AFTER_FIRST_SYNC = 89;

function toAccountView(a: BankAccount): BankAccountView {
  return { id: a.id, uid: a.uid, iban: a.iban, bankName: a.bankName, accountId: a.accountId, syncFrom: a.syncFrom, linkedAt: a.linkedAt, lastSyncedDate: a.lastSyncedDate };
}

function toConnectionView(db: Db, c: BankConnection): BankConnectionView {
  return {
    id: c.id,
    aspspName: c.aspspName,
    status: c.status,
    validUntil: c.validUntil,
    lastSyncAt: c.lastSyncAt,
    lastError: c.lastError,
    accounts: listBankAccounts(db, c.id).map(toAccountView),
  };
}

/**
 * Première date à synchroniser pour un compte lié aujourd'hui : lendemain du dernier relevé importé,
 * sinon de la dernière opération confirmée, sinon 90 jours d'historique.
 */
function syncStart(db: Db, accountId: number, today: ISODate): ISODate {
  const last = lastImportedDate(db, accountId) ?? lastConfirmedDate(db, accountId);
  return last ? addDays(last, 1) : addDays(today, -EMPTY_ACCOUNT_HISTORY_DAYS);
}

export function getState(db: Db, configured: boolean, today: ISODate): BankSyncState {
  return {
    configured,
    redirectUrl: REDIRECT_URL,
    connections: listConnections(db)
      .filter((c) => c.status !== 'pending')
      .map((c) => toConnectionView(db, c)),
    syncStartByAccount: Object.fromEntries(listAccounts(db).map((a) => [a.id, syncStart(db, a.id, today)])),
  };
}

/** Numéro de compte français (11 caractères) contenu dans un IBAN FR, pour retrouver un compte Runway. */
function frenchAccountNumber(iban: string | null): string | null {
  const compact = iban?.replace(/\s/g, '').toUpperCase() ?? '';
  return compact.startsWith('FR') && compact.length === 27 ? compact.slice(14, 25) : null;
}

export async function startConnection(db: Db, provider: BankProvider, input: { connectionId?: number; now: Date }): Promise<BankAuthStart> {
  // Un identifiant inconnu échoue avant de créer une autorisation chez l'agrégateur.
  const renewed = input.connectionId !== undefined ? getConnection(db, input.connectionId) : null;
  const state = randomBytes(16).toString('hex');
  const maxSeconds = (await provider.getMaxConsentSeconds(ASPSP)) ?? DEFAULT_CONSENT_SECONDS;
  const validUntil = new Date(input.now.getTime() + maxSeconds * 1000).toISOString();
  const { url } = await provider.startAuth({ aspsp: ASPSP, validUntil, redirectUrl: REDIRECT_URL, state });

  let connection: BankConnection;
  if (renewed) {
    // Renouvellement : la connexion garde son statut et ses comptes, seul le state change.
    connection = updateConnection(db, renewed.id, { state });
  } else {
    deletePendingConnections(db);
    connection = createConnection(db, { aspspName: ASPSP.name, aspspCountry: ASPSP.country, state });
  }
  return { connectionId: connection.id, url };
}

export async function completeConnection(db: Db, provider: BankProvider, input: { connectionId: number; code: string; state: string }): Promise<BankConnectionView> {
  const connection = getConnection(db, input.connectionId);
  if (connection.state !== input.state) throw new BadRequestError("Retour d'autorisation invalide : relance la connexion");

  const session = await provider.createSession(input.code);
  const known = listBankAccounts(db, connection.id);
  for (const account of session.accounts) {
    const suggested = frenchAccountNumber(account.iban);
    const accountId = suggested ? (findAccountByBankNumber(db, suggested)?.id ?? null) : null;
    upsertBankAccount(db, { connectionId: connection.id, uid: account.uid, iban: account.iban, bankName: account.name, accountId });
  }
  // Première connexion : les liaisons restent à confirmer. Renouvellement : la synchro peut reprendre.
  const status = known.some((a) => a.syncFrom !== null) ? 'active' : 'authorized';
  const updated = updateConnection(db, connection.id, { sessionId: session.sessionId, validUntil: session.validUntil, status, lastError: null });
  return toConnectionView(db, updated);
}

export function linkAccounts(db: Db, input: { connectionId: number; links: BankLinkInput['links']; today: ISODate }): BankConnectionView {
  const connection = getConnection(db, input.connectionId);
  db.transaction((tx) => {
    const t = tx as unknown as Db;
    for (const link of input.links) {
      const bank = getBankAccount(t, link.bankAccountId);
      if (bank.connectionId !== connection.id) throw new BadRequestError("Ce compte n'appartient pas à cette connexion");
      if (link.accountId === null) {
        updateBankAccount(t, bank.id, { accountId: null, syncFrom: null, linkedAt: null });
        continue;
      }
      getAccount(t, link.accountId);
      updateBankAccount(t, bank.id, { accountId: link.accountId, syncFrom: syncStart(t, link.accountId, input.today), linkedAt: input.today, lastSyncedDate: null });
    }
    if (connection.status === 'authorized') updateConnection(t, connection.id, { status: 'active' });
  });
  return toConnectionView(db, getConnection(db, connection.id));
}

/** Sans fournisseur (identifiants effacés), la session reste chez Enable Banking jusqu'à son expiration : seul l'état local change. */
export async function disconnect(db: Db, provider: BankProvider | null, connectionId: number): Promise<void> {
  const connection = getConnection(db, connectionId);
  if (provider && connection.sessionId) {
    try {
      await provider.deleteSession(connection.sessionId);
    } catch {
      // Session déjà expirée ou révoquée côté banque : l'état local suffit.
    }
  }
  updateConnection(db, connection.id, { status: 'revoked', lastError: null });
}

/**
 * Jonction avec l'historique des relevés et des saisies, dont les libellés diffèrent : jusqu'à
 * 10 jours après la liaison, une opération déjà connue (même jour, même montant) est un doublon. Les opérations identiques
 * sont comptées : s'il en existe une seule et que la banque en renvoie deux, la seconde reste nouvelle.
 */
function applyJunctionDedup(db: Db, bank: BankAccount, rows: ReturnType<typeof buildPreview>['rows']): void {
  // Liaison antérieure à la colonne linked_at : la date de départ sert de repère.
  const limit = addDays(bank.linkedAt ?? bank.syncFrom!, JUNCTION_DAYS);
  const keyOf = (row: (typeof rows)[number]) => `${row.date}|${row.signedAmount}`;
  const groups = new Map<string, typeof rows>();
  // Opérations déjà reconnues par empreinte (écrites par une synchro précédente) : elles
  // figurent dans le compte en base mais ne doivent pas consommer la jonction des nouvelles.
  const recognized = new Map<string, number>();
  for (const row of rows) {
    if (compareISODate(row.date, limit) > 0) continue;
    const key = keyOf(row);
    if (row.status === 'duplicate') recognized.set(key, (recognized.get(key) ?? 0) + 1);
    if (row.status !== 'new') continue;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  for (const [key, group] of groups) {
    const confirmed = countConfirmedOn(db, bank.accountId!, group[0]!.date, group[0]!.signedAmount);
    const known = Math.max(0, confirmed - (recognized.get(key) ?? 0));
    for (const row of group.slice(0, known)) row.status = 'duplicate';
  }
}

function maxDate(a: ISODate, b: ISODate): ISODate {
  return compareISODate(a, b) >= 0 ? a : b;
}

function causeOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Synchronise les comptes liés d'une connexion. Une erreur sur un compte (lecture ou écriture)
 * n'empêche pas les autres : les messages sont regroupés dans `lastError`, compte par compte.
 */
async function syncConnection(db: Db, provider: BankProvider, connection: BankConnection, today: ISODate, now: Date): Promise<BankSyncConnectionResult> {
  const result: BankSyncConnectionResult = { connectionId: connection.id, status: connection.status, created: 0, matched: 0, duplicates: 0, skipped: 0, error: null };
  const errors: string[] = [];
  const fail = (bank: BankAccount, err: unknown) => errors.push(`${bank.bankName} : ${causeOf(err)}`);
  try {
    const session = await provider.getSession(connection.sessionId!);
    const expired = session.status !== 'AUTHORIZED' || (session.validUntil !== null && new Date(session.validUntil).getTime() < now.getTime());
    if (expired) {
      updateConnection(db, connection.id, { status: 'expired', lastError: null, consecutiveFailures: 0, firstFailureAt: null });
      result.status = 'expired';
      return result;
    }

    const linked = listBankAccounts(db, connection.id).filter((a) => a.accountId !== null && a.syncFrom !== null && !getAccount(db, a.accountId).archived);
    const fetched: { bank: BankAccount; rows: SourceRow[] }[] = [];
    for (const bank of linked) {
      const overlapFrom = bank.lastSyncedDate ? addDays(bank.lastSyncedDate, -OVERLAP_DAYS) : bank.syncFrom!;
      let from = maxDate(overlapFrom, bank.syncFrom!);
      if (bank.lastSyncedDate) from = maxDate(from, addDays(today, -MAX_HISTORY_DAYS_AFTER_FIRST_SYNC));
      try {
        const rows: SourceRow[] = [];
        for (const tx of await provider.listTransactions(bank.uid, from, today)) {
          const mapped = toSourceRow(tx);
          if (mapped.ok) rows.push(mapped.row);
          else result.skipped++;
        }
        fetched.push({ bank, rows });
      } catch (err) {
        fail(bank, err);
      }
    }

    // Toutes les prévisualisations d'abord : la contrepartie d'un virement interne doit être connue
    // avant d'écrire quoi que ce soit, quel que soit l'ordre des comptes.
    const previews: { bank: BankAccount; sourceRows: SourceRow[]; accountId: number; rows: ImportPreviewRow[] }[] = [];
    for (const { bank, rows } of fetched) {
      try {
        const siblings: Sibling[] = fetched.filter((f) => f.bank.id !== bank.id).map((f) => ({ accountId: f.bank.accountId, iban: f.bank.iban, rows: f.rows }));
        const preview = buildPreview(db, { parserId: PARSER_ID, bankAccountNumber: null, rows, sections: [], sectionIndex: 0, siblings }, bank.accountId);
        applyJunctionDedup(db, bank, preview.rows);
        previews.push({ bank, sourceRows: rows, accountId: bank.accountId!, rows: preview.rows });
      } catch (err) {
        fail(bank, err);
      }
    }
    markClaimedCounterparts(previews);

    for (const { bank, sourceRows, rows } of previews) {
      try {
        const toWrite = rows.filter((r) => r.status === 'new' || r.status === 'matched' || r.status === 'transfer');
        const duplicates = rows.length - toWrite.length;
        if (toWrite.length > 0) {
          const record = commitImport(db, {
            fileName: SYNC_FILE_NAME,
            accountId: bank.accountId!,
            duplicateCount: duplicates,
            rows: toWrite.map(({ index, date, label, signedAmount, fingerprint, plannedId, envelopeId, note, transferToAccountId }) => ({ index, date, label, signedAmount, fingerprint, plannedId, envelopeId, note, transferToAccountId })),
          });
          result.created += record.newCount;
          result.matched += record.matchedCount;
        }
        result.duplicates += duplicates;
        // Lecture et écriture réussies : le compte est à jour au jour de la synchro, même sans opération,
        // pour que la suivante reparte de quelques jours avant aujourd'hui et non de la date de départ.
        const latest = sourceRows.reduce<ISODate>((max, r) => maxDate(max, r.date), today);
        if (latest !== bank.lastSyncedDate) updateBankAccount(db, bank.id, { lastSyncedDate: latest });
      } catch (err) {
        fail(bank, err);
      }
    }
  } catch (err) {
    errors.push(causeOf(err));
  }
  result.error = errors.length > 0 ? errors.join(' ; ') : null;
  const nowIso = now.toISOString();
  // `lastSyncAt` avance à chaque tentative (succès ou échec) ; `lastSuccessAt` ne bouge qu'en cas de succès,
  // pour que le signal `sync_error` sache depuis combien de temps la synchro n'a pas abouti.
  updateConnection(db, connection.id, {
    lastSyncAt: nowIso,
    lastError: result.error,
    consecutiveFailures: result.error !== null ? connection.consecutiveFailures + 1 : 0,
    firstFailureAt: result.error !== null ? (connection.firstFailureAt ?? nowIso) : null,
    lastSuccessAt: result.error !== null ? connection.lastSuccessAt : nowIso,
  });
  return result;
}

let running: Promise<BankSyncRunResult> | null = null;

/**
 * Synchronise toutes les connexions actives. Une seule exécution à la fois : un second appel
 * pendant qu'une synchro tourne reçoit le même résultat.
 */
export function runSync(db: Db, provider: BankProvider, input: { today: ISODate; now: Date; onlyIfStaleMinutes?: number }): Promise<BankSyncRunResult> {
  if (running) return running;
  running = (async () => {
    const active = listConnections(db).filter((c) => c.status === 'active' && c.sessionId !== null);
    if (active.length === 0) return { reason: 'no_connection' as const, connections: [] };
    if (input.onlyIfStaleMinutes !== undefined) {
      const latest = Math.max(...active.map((c) => (c.lastSyncAt ? new Date(c.lastSyncAt).getTime() : 0)));
      if (input.now.getTime() - latest < input.onlyIfStaleMinutes * 60_000) return { reason: 'fresh' as const, connections: [] };
    }
    const connections: BankSyncConnectionResult[] = [];
    for (const c of active) connections.push(await syncConnection(db, provider, c, input.today, input.now));
    return { reason: 'ok' as const, connections };
  })().finally(() => {
    running = null;
  });
  return running;
}
