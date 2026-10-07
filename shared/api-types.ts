import type { Cents } from './money';
import type { ISODate } from './dates';
import type { Account, BankConnectionStatus, Envelope, ImportRecord, SortingRule, Transaction } from './schemas';

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
  /** `budget` : répartition attendue d'après le budget mensuel de l'enveloppe `sourceId`. */
  source: 'planned' | 'rule' | 'budget';
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
  /** Ce qu'il manque pour atteindre le budget du mois. */
  toFundThisMonth: Cents;
};

export type MonthSummary = {
  start: ISODate;
  end: ISODate;
  /** Dépenses confirmées du mois, à trier comprises, hors enveloppes d'épargne. */
  spent: Cents;
  /** Somme des budgets mensuels des enveloppes hors épargne. */
  budget: Cents;
  /** Dépenses courantes : hors enveloppes portées par une charge fixe active (loyer, prêt...). */
  variable: { spent: Cents; budget: Cents };
  /** Mis de côté : virements nets vers l'épargne et dépenses des enveloppes d'épargne. */
  saved: Cents;
  /** Ce qu'il manque aux enveloppes pour atteindre leur budget du mois. */
  toFund: Cents;
  /** Revenu mensuel attendu : revenus récurrents actifs, ramenés au mois. */
  income: Cents;
  /** Somme des budgets mensuels de toutes les enveloppes, épargne comprise : ce que le budget prélève sur le revenu. */
  planned: Cents;
};

export type Overview = {
  today: ISODate;
  toAllocate: Cents;
  netWorth: Cents;
  accounts: AccountWithBalance[];
  envelopes: EnvelopeWithBalance[];
  month: MonthSummary;
  alerts: ForecastAlert[];
  unsortedCount: number;
  /** Opérations prévues que le relevé n'a pas confirmées dans la fenêtre de rapprochement : à vérifier. */
  latePlanned: Transaction[];
};

export type SpendingReport = {
  from: ISODate;
  to: ISODate;
  total: Cents;
  /** Somme des budgets mensuels des enveloppes de dépenses actives, pour comparer à la période. */
  monthlyBudget: Cents;
  /** Dépenses par enveloppe, hors enveloppes d'épargne ; `envelopeId` null = à trier. */
  byEnvelope: { envelopeId: number | null; name: string; color: string; amount: Cents; monthlyTarget: Cents | null }[];
};

/** `expense` exclut les enveloppes d'épargne, comptées dans `saved`. */
export type MonthlyReport = { month: string; income: Cents; expense: Cents; saved: Cents }[];

export type NetWorthReport = {
  history: { date: ISODate; value: Cents }[];
  projection: { date: ISODate; value: Cents }[];
};

/** `transfer` : virement vers un autre compte de l'app ; `internal` : contrepartie d'un virement déjà saisi, ignorée. */
export type ImportRowStatus = 'new' | 'duplicate' | 'matched' | 'transfer' | 'internal';

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
  /** Texte brut complet (relevés PDF), conservé en note. */
  note: string | null;
  transferToAccountId: number | null;
};

export type ImportSection = {
  index: number;
  accountName: string;
  bankAccountNumber: string;
  accountId: number | null;
  rowCount: number;
};

export type ImportPreview = {
  parserId: string;
  bankAccountNumber: string | null;
  accountId: number | null;
  rows: ImportPreviewRow[];
  counts: { total: number; new: number; duplicate: number; matched: number; transfer: number; internal: number };
  /** Un relevé PDF couvre plusieurs comptes : une section par compte, `sectionIndex` est celle affichée. */
  sections: ImportSection[];
  sectionIndex: number;
};

export type ImportCommitRow = {
  index: number;
  date: ISODate;
  label: string;
  signedAmount: Cents;
  fingerprint: string;
  plannedId: number | null;
  envelopeId: number | null;
  note?: string | null;
  transferToAccountId?: number | null;
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
  /** Présent si un lot a échoué après des lots réussis : les suggestions sont partielles. */
  warning?: string;
};

export type ApiErrorBody = { error: string; code?: string; issues?: unknown };

export type BankAccountView = {
  id: number;
  uid: string;
  iban: string | null;
  bankName: string;
  accountId: number | null;
  syncFrom: ISODate | null;
  /** Jour où la liaison a été confirmée ; null si le compte est ignoré. */
  linkedAt: ISODate | null;
  lastSyncedDate: ISODate | null;
};

export type BankConnectionView = {
  id: number;
  aspspName: string;
  status: BankConnectionStatus;
  validUntil: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  accounts: BankAccountView[];
};

export type BankSyncState = {
  /** Application ID et clé privée renseignés dans les réglages. */
  configured: boolean;
  redirectUrl: string;
  /** Connexions hors `pending` (une autorisation abandonnée n'apparaît pas). */
  connections: BankConnectionView[];
  /** Date de départ qu'aurait chaque compte Runway non archivé s'il était lié aujourd'hui. */
  syncStartByAccount: Record<number, ISODate>;
};

export type BankAuthStart = { connectionId: number; url: string };

export type BankSyncConnectionResult = {
  connectionId: number;
  status: BankConnectionStatus;
  created: number;
  matched: number;
  duplicates: number;
  /** Opérations API illisibles (sans date ou montant), ignorées. */
  skipped: number;
  error: string | null;
};

export type BankSyncRunResult = {
  reason: 'ok' | 'fresh' | 'not_configured' | 'no_connection';
  connections: BankSyncConnectionResult[];
};

export type { Account, Envelope, ImportRecord, SortingRule, Transaction };
