import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { bankConnectionStatuses, fundingStatuses } from '@shared/schemas';
import { platforms, ideaAngleKeys } from '@shared/invest';

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

export const accounts = sqliteTable('accounts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  initialBalance: integer('initial_balance').notNull().default(0),
  onBudget: integer('on_budget', { mode: 'boolean' }).notNull().default(true),
  bankAccountNumber: text('bank_account_number'),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().default(now),
});

export const envelopes = sqliteTable('envelopes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  color: text('color').notNull().default('#4f8a5b'),
  /** Complément mensuel saisi à la main, en plus des charges fixes de l'enveloppe ; null = pas de complément. */
  monthlyExtra: integer('monthly_extra'),
  sortOrder: integer('sort_order').notNull().default(0),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  /** Enveloppe d'épargne : ses dépenses comptent comme argent mis de côté, pas comme consommation. */
  isSavings: integer('is_savings', { mode: 'boolean' }).notNull().default(false),
});

export const recurringRules = sqliteTable('recurring_rules', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  kind: text('kind', { enum: ['expense', 'income', 'transfer', 'allocation'] }).notNull(),
  amount: integer('amount').notNull(),
  label: text('label').notNull(),
  accountId: integer('account_id').references(() => accounts.id),
  toAccountId: integer('to_account_id').references(() => accounts.id),
  envelopeId: integer('envelope_id').references(() => envelopes.id),
  fromEnvelopeId: integer('from_envelope_id').references(() => envelopes.id),
  frequency: text('frequency', { enum: ['daily', 'weekly', 'monthly', 'yearly'] }).notNull(),
  interval: integer('interval').notNull().default(1),
  dayOfMonth: integer('day_of_month'),
  startDate: text('start_date').notNull(),
  endDate: text('end_date'),
  lastGeneratedDate: text('last_generated_date'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  /** Revenu dont la confirmation remplit les enveloppes jusqu'à leur budget. */
  triggersFunding: integer('triggers_funding', { mode: 'boolean' }).notNull().default(false),
  /** Versé en fin de mois pour vivre le mois suivant : finance le budget du mois d'après. */
  fundsNextMonth: integer('funds_next_month', { mode: 'boolean' }).notNull().default(false),
});

export const imports = sqliteTable('imports', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  fileName: text('file_name').notNull(),
  accountId: integer('account_id')
    .notNull()
    .references(() => accounts.id),
  importedAt: text('imported_at').notNull().default(now),
  rowCount: integer('row_count').notNull(),
  newCount: integer('new_count').notNull(),
  duplicateCount: integer('duplicate_count').notNull(),
  matchedCount: integer('matched_count').notNull(),
});

export const transactions = sqliteTable(
  'transactions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    kind: text('kind', { enum: ['expense', 'income', 'transfer', 'allocation'] }).notNull(),
    date: text('date').notNull(),
    amount: integer('amount').notNull(),
    label: text('label').notNull(),
    note: text('note'),
    accountId: integer('account_id').references(() => accounts.id),
    toAccountId: integer('to_account_id').references(() => accounts.id),
    envelopeId: integer('envelope_id').references(() => envelopes.id),
    fromEnvelopeId: integer('from_envelope_id').references(() => envelopes.id),
    status: text('status', { enum: ['confirmed', 'planned'] }).notNull().default('confirmed'),
    recurringRuleId: integer('recurring_rule_id').references(() => recurringRules.id, { onDelete: 'set null' }),
    importId: integer('import_id').references(() => imports.id, { onDelete: 'set null' }),
    fingerprint: text('fingerprint'),
    /** Répartition automatique qui a créé cette allocation. */
    fundingId: integer('funding_id').references((): AnySQLiteColumn => fundings.id, { onDelete: 'cascade' }),
    createdAt: text('created_at').notNull().default(now),
  },
  (t) => [
    index('transactions_date_idx').on(t.date),
    index('transactions_account_idx').on(t.accountId),
    index('transactions_envelope_idx').on(t.envelopeId),
    uniqueIndex('transactions_fingerprint_idx').on(t.fingerprint),
  ],
);

export const fundings = sqliteTable('fundings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sourceTransactionId: integer('source_transaction_id')
    .notNull()
    .unique()
    .references((): AnySQLiteColumn => transactions.id, { onDelete: 'cascade' }),
  /** Mois financé, `YYYY-MM`. */
  month: text('month').notNull(),
  status: text('status', { enum: fundingStatuses }).notNull().default('applied'),
  shortfallCount: integer('shortfall_count').notNull().default(0),
  dismissedAt: text('dismissed_at'),
  createdAt: text('created_at').notNull().default(now),
});

export const sortingRules = sqliteTable('sorting_rules', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  pattern: text('pattern').notNull(),
  envelopeId: integer('envelope_id')
    .notNull()
    .references(() => envelopes.id, { onDelete: 'cascade' }),
  priority: integer('priority').notNull().default(0),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const bankConnections = sqliteTable('bank_connections', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  provider: text('provider').notNull().default('enablebanking'),
  aspspName: text('aspsp_name').notNull(),
  aspspCountry: text('aspsp_country').notNull(),
  /** Jeton aléatoire envoyé à `/auth`, vérifié au retour. */
  state: text('state').notNull(),
  sessionId: text('session_id'),
  status: text('status', { enum: bankConnectionStatuses }).notNull().default('pending'),
  validUntil: text('valid_until'),
  lastSyncAt: text('last_sync_at'),
  lastError: text('last_error'),
  createdAt: text('created_at').notNull().default(now),
});

export const bankAccounts = sqliteTable(
  'bank_accounts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    connectionId: integer('connection_id')
      .notNull()
      .references(() => bankConnections.id, { onDelete: 'cascade' }),
    /** Identifiant du compte chez Enable Banking. */
    uid: text('uid').notNull(),
    iban: text('iban'),
    bankName: text('bank_name').notNull(),
    accountId: integer('account_id').references(() => accounts.id, { onDelete: 'set null' }),
    /** Première date synchronisée ; null tant que la liaison n'est pas confirmée. */
    syncFrom: text('sync_from'),
    /** Jour de la liaison confirmée : borne la fenêtre de jonction avec l'historique ; null si le compte est ignoré. */
    linkedAt: text('linked_at'),
    lastSyncedDate: text('last_synced_date'),
  },
  (t) => [index('bank_accounts_connection_idx').on(t.connectionId)],
);

export const holdings = sqliteTable(
  'holdings',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    platform: text('platform', { enum: platforms }).notNull(),
    /** Ticker Yahoo (`SXR8.DE`, `BTC-EUR`). */
    ticker: text('ticker').notNull(),
    name: text('name').notNull(),
    source: text('source', { enum: ['manual', 'binance'] }).notNull().default('manual'),
    /** Actif Binance (`BTC`) pour une position synchronisée. */
    externalAsset: text('external_asset'),
    /** Dernier solde lu chez Binance, en texte décimal. */
    syncedQuantity: text('synced_quantity'),
    createdAt: text('created_at').notNull().default(now),
  },
  (t) => [uniqueIndex('holdings_external_idx').on(t.source, t.externalAsset)],
);

export const holdingTrades = sqliteTable(
  'holding_trades',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    holdingId: integer('holding_id')
      .notNull()
      .references(() => holdings.id, { onDelete: 'cascade' }),
    side: text('side', { enum: ['buy', 'sell'] }).notNull(),
    date: text('date').notNull(),
    quantity: text('quantity').notNull(),
    /** Montant total en centimes d'euro, frais exclus. */
    amount: integer('amount').notNull(),
    fees: integer('fees').notNull().default(0),
    source: text('source', { enum: ['manual', 'binance'] }).notNull().default('manual'),
    externalId: text('external_id'),
  },
  (t) => [index('holding_trades_holding_idx').on(t.holdingId), uniqueIndex('holding_trades_external_idx').on(t.externalId)],
);

export const prices = sqliteTable(
  'prices',
  {
    ticker: text('ticker').notNull(),
    date: text('date').notNull(),
    close: real('close').notNull(),
    currency: text('currency').notNull(),
    fetchedAt: text('fetched_at').notNull().default(now),
  },
  (t) => [primaryKey({ columns: [t.ticker, t.date] })],
);

export const priceTickers = sqliteTable('price_tickers', {
  ticker: text('ticker').primaryKey(),
  name: text('name').notNull(),
  currency: text('currency').notNull(),
  /** Plus ancienne date demandée à Yahoo : l'historique en base est complet à partir d'ici. */
  historyFrom: text('history_from').notNull(),
  refreshedAt: text('refreshed_at').notNull(),
});

export const ideaRuns = sqliteTable('idea_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  trigger: text('trigger', { enum: ['manual', 'weekly'] }).notNull(),
  status: text('status', { enum: ['running', 'done', 'failed'] }).notNull().default('running'),
  startedAt: text('started_at').notNull(),
  finishedAt: text('finished_at'),
  acceptedCount: integer('accepted_count').notNull().default(0),
  /** JSON : `[{ ticker, reason }]`. */
  rejected: text('rejected').notNull().default('[]'),
  error: text('error'),
  phase: text('phase', { enum: ['research', 'review'] }),
  candidateCount: integer('candidate_count').notNull().default(0),
  /** JSON : clés des angles dont le chercheur a échoué. */
  failedAngles: text('failed_angles').notNull().default('[]'),
});

export const ideas = sqliteTable(
  'ideas',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    runId: integer('run_id')
      .notNull()
      .references(() => ideaRuns.id, { onDelete: 'cascade' }),
    createdOn: text('created_on').notNull(),
    title: text('title').notNull(),
    event: text('event').notNull(),
    /** JSON : URL des pages lues qui appuient l'idée. */
    sources: text('sources').notNull().default('[]'),
    /** JSON : étapes de la déduction. */
    reasoning: text('reasoning').notNull(),
    pricedIn: text('priced_in').notNull(),
    ticker: text('ticker').notNull(),
    assetName: text('asset_name').notNull(),
    whereToBuy: text('where_to_buy', { enum: platforms }).notNull(),
    horizon: text('horizon').notNull(),
    startPriceEur: real('start_price_eur').notNull(),
    benchStartPriceEur: real('bench_start_price_eur').notNull(),
    status: text('status', { enum: ['open', 'closed'] }).notNull().default('open'),
    finalReturn: real('final_return'),
    benchFinalReturn: real('bench_final_return'),
    /** Verdict du critique ; null pour les idées d'avant la critique, traitées comme affichées. */
    verdict: text('verdict', { enum: ['kept', 'dropped'] }),
    critique: text('critique'),
    risk: text('risk'),
    angle: text('angle', { enum: ideaAngleKeys }),
    /** Variations de cours vues par le critique, en fraction. */
    perf1m: real('perf_1m'),
    perf3m: real('perf_3m'),
    benchPerf1m: real('bench_perf_1m'),
    benchPerf3m: real('bench_perf_3m'),
  },
  (t) => [index('ideas_status_idx').on(t.status)],
);
