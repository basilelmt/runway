import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

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
  monthlyTarget: integer('monthly_target'),
  sortOrder: integer('sort_order').notNull().default(0),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
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
    createdAt: text('created_at').notNull().default(now),
  },
  (t) => [
    index('transactions_date_idx').on(t.date),
    index('transactions_account_idx').on(t.accountId),
    index('transactions_envelope_idx').on(t.envelopeId),
    uniqueIndex('transactions_fingerprint_idx').on(t.fingerprint),
  ],
);

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
  status: text('status', { enum: ['pending', 'authorized', 'active', 'expired', 'revoked'] }).notNull().default('pending'),
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
