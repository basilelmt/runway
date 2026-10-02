import type { Cents } from './money';
import type { ISODate } from './dates';
import type { Account, Envelope, ImportRecord, SortingRule, Transaction } from './schemas';

export type Balances = {
  accounts: Record<number, Cents>;
  envelopes: Record<number, Cents>;
  toAllocate: Cents;
  netWorth: Cents;
};

export type ForecastAlert = {
  kind: 'account' | 'envelope';
  id: number;
  name: string;
  firstNegativeDate: ISODate;
  daysUntil: number;
  minBalance: Cents;
  minBalanceDate: ISODate;
};

export type ForecastDay = {
  date: ISODate;
  accounts: Record<number, Cents>;
  envelopes: Record<number, Cents>;
};

export type ForecastEvent = {
  date: ISODate;
  label: string;
  kind: Transaction['kind'];
  amount: Cents;
  accountId: number | null;
  toAccountId: number | null;
  envelopeId: number | null;
  fromEnvelopeId: number | null;
  source: 'planned' | 'rule';
  sourceId: number;
};

export type ForecastResult = {
  today: ISODate;
  horizonDays: number;
  days: ForecastDay[];
  alerts: ForecastAlert[];
  events: ForecastEvent[];
};

export type ForecastResponse = ForecastResult & {
  accounts: Pick<Account, 'id' | 'name' | 'onBudget'>[];
  envelopes: Pick<Envelope, 'id' | 'name' | 'color'>[];
};

export type AccountWithBalance = Account & { balance: Cents; lastImport: ImportRecord | null };

export type EnvelopeWithBalance = Envelope & {
  balance: Cents;
  allocatedThisMonth: Cents;
  spentThisMonth: Cents;
};

export type Overview = {
  today: ISODate;
  toAllocate: Cents;
  netWorth: Cents;
  accounts: AccountWithBalance[];
  envelopes: EnvelopeWithBalance[];
  alerts: ForecastAlert[];
  unsortedCount: number;
  plannedCount: number;
  netWorthSparkline: { date: ISODate; value: Cents }[];
};

export type SpendingReport = {
  from: ISODate;
  to: ISODate;
  total: Cents;
  byEnvelope: { envelopeId: number | null; name: string; color: string; amount: Cents }[];
};

export type MonthlyReport = { month: string; income: Cents; expense: Cents }[];

export type NetWorthReport = {
  history: { date: ISODate; value: Cents }[];
  projection: { date: ISODate; value: Cents }[];
};

export type ImportRowStatus = 'new' | 'duplicate' | 'matched';

export type ImportPreviewRow = {
  index: number;
  date: ISODate;
  label: string;
  signedAmount: Cents;
  status: ImportRowStatus;
  fingerprint: string;
  plannedId: number | null;
  plannedLabel: string | null;
  envelopeId: number | null;
};

export type ImportPreview = {
  parserId: string;
  bankAccountNumber: string | null;
  accountId: number | null;
  rows: ImportPreviewRow[];
  counts: { total: number; new: number; duplicate: number; matched: number };
};

export type ImportCommitRow = {
  index: number;
  date: ISODate;
  label: string;
  signedAmount: Cents;
  fingerprint: string;
  plannedId: number | null;
  envelopeId: number | null;
};

export type ImportCommitInput = {
  fileName: string;
  accountId: number;
  rows: ImportCommitRow[];
  duplicateCount: number;
};

export type Suggestion = {
  transactionId: number;
  envelopeId: number | null;
  envelopeName: string | null;
  reason: string;
};

export type SuggestResponse = {
  suggestions: Suggestion[];
  rules: { pattern: string; envelopeId: number }[];
};

export type ApiErrorBody = { error: string; code?: string; issues?: unknown };

export type { Account, Envelope, ImportRecord, SortingRule, Transaction };
