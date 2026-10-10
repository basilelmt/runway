import type { Cents } from './money';
import type { ISODate } from './dates';
import type { Account, AppliedReview, BankConnectionStatus, Envelope, ImportRecord, MerchantSource, RecurringRule, RecurringRuleInput, SignalKind, SortingRule, Transaction } from './schemas';
import type { IdeaAngle, Platform } from './invest';

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

/** Enveloppe avec son budget du mois, calculé à partir de ses charges fixes. */
export type BudgetedEnvelope = Envelope & {
  /** Charges fixes ramenées au mois. */
  monthlyCharges: Cents;
  /** monthlyCharges + (monthlyExtra ?? 0) ; 0 = pas de budget. */
  monthlyBudget: Cents;
};

export type EnvelopeWithBalance = BudgetedEnvelope & {
  balance: Cents;
  allocatedThisMonth: Cents;
  spentThisMonth: Cents;
  /** Ce qu'il manque pour atteindre le budget du mois. */
  toFundThisMonth: Cents;
};

/** Enveloppe à surveiller sur l'Accueil : dépassée (`amount` = dépassement) ou presque vide (`amount` = disponible libre). */
export type WatchedEnvelope = { envelopeId: number; name: string; kind: 'over' | 'low'; amount: Cents };

export type MonthSummary = {
  start: ISODate;
  end: ISODate;
  /** Dépenses confirmées du mois, à trier comprises, hors enveloppes d'épargne. */
  spent: Cents;
  /** Somme des budgets mensuels (charges fixes + complément) des enveloppes hors épargne. */
  budget: Cents;
  /**
   * Dépenses courantes : dépenses confirmées hors épargne qui ne viennent pas d'une règle récurrente,
   * face à la somme des compléments des enveloppes hors épargne.
   */
  variable: { spent: Cents; budget: Cents };
  /** Mis de côté : virements nets vers l'épargne et dépenses des enveloppes d'épargne. */
  saved: Cents;
  /** Ce qu'il manque aux enveloppes pour atteindre leur budget du mois. */
  toFund: Cents;
  /** Revenu mensuel attendu : revenus récurrents actifs, ramenés au mois. */
  income: Cents;
  /** Somme des budgets mensuels (charges fixes + complément) de toutes les enveloppes, épargne comprise : ce que le budget prélève sur le revenu. */
  planned: Cents;
};

/** Dernière répartition automatique à annoncer : total réparti, enveloppes servies, enveloppes restées incomplètes. */
export type FundingView = {
  id: number;
  month: string;
  total: Cents;
  envelopeCount: number;
  shortfallCount: number;
  sourceLabel: string;
};

/** Bilan du mois précédent à faire, pour la carte d'Accueil : visible du 1er à la fin du mois tant qu'il n'est pas validé. */
export type PendingReview = { month: string; spent: Cents; overspentCount: number };

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
  /** Dernière répartition automatique, tant qu'elle n'est ni annulée ni fermée. */
  latestFunding: FundingView | null;
  /** Enveloppes dépassées ou presque vides, les plus urgentes d'abord. */
  watch: WatchedEnvelope[];
  /** Signaux actifs (ni écartés, ni résolus). */
  signalCount: number;
  /** Bilan du mois précédent restant à faire, ou null une fois validé ou hors de la fenêtre. */
  pendingReview: PendingReview | null;
};

/** Chiffres du mois passé en revue : revenus, dépenses et épargne, sur les opérations confirmées. */
export type ReviewMonthFigures = { income: Cents; spent: Cents; saved: Cents };

/** Une ligne de la section Enveloppes du bilan (hors épargne) : `gap` = dépensé - budget (positif = dépassement, négatif = marge). */
export type ReviewEnvelopeLine = { envelopeId: number; name: string; color: string; budget: Cents; spent: Cents; gap: Cents };

/** Proposition de nouveau complément, à partir de la médiane des dépenses courantes des 3 derniers mois. */
export type ReviewProposal = {
  envelopeId: number;
  name: string;
  currentExtra: Cents | null;
  proposedExtra: Cents;
  /** Dépenses courantes des mois disponibles, du plus ancien au plus récent (le mois passé en revue en dernier). */
  monthsSpent: Cents[];
};

/** Budget du mois courant d'une enveloppe, pour le contrôle d'ensemble recalculé côté client à chaque proposition acceptée. */
export type ReviewControlEnvelope = { envelopeId: number; monthlyCharges: Cents; monthlyBudget: Cents };

export type ReviewControl = { envelopes: ReviewControlEnvelope[]; medianIncome: Cents };

/** Solde positif à aujourd'hui d'une enveloppe hors épargne, qu'on peut verser dans l'épargne. */
export type ReviewRemainder = { envelopeId: number; name: string; color: string; amount: Cents };

export type ReviewStatus = { validated: boolean; reviewedAt: string | null; applied: AppliedReview | null };

/** Bilan complet d'un mois passé (`GET /api/reviews/:month`), calculé par `core/review.ts`. */
export type MonthReview = {
  month: string;
  figures: ReviewMonthFigures;
  envelopes: ReviewEnvelopeLine[];
  proposals: ReviewProposal[];
  control: ReviewControl;
  /** `null` pour un mois déjà validé, ou plus ancien que le mois précédent. */
  remainders: ReviewRemainder[] | null;
  status: ReviewStatus;
};

export type SpendingReport = {
  from: ISODate;
  to: ISODate;
  total: Cents;
  /** Somme des budgets mensuels (charges fixes + complément) des enveloppes de dépenses actives, pour comparer à la période. */
  monthlyBudget: Cents;
  /** Dépenses par enveloppe, hors enveloppes d'épargne ; `envelopeId` null = à trier. */
  byEnvelope: { envelopeId: number | null; name: string; color: string; amount: Cents; monthlyBudget: Cents }[];
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

/** Ce qu'il faut pour afficher et agir sur chaque type de signal. */
export type SignalPayloadByKind = {
  unusual_expense: { transactionId: number; merchantName: string; amount: Cents; median: Cents | null; date: ISODate };
  new_recurring: { merchantKey: string; merchantName: string; amount: Cents; envelopeId: number | null; dayOfMonth: number };
  price_change: { ruleId: number; ruleName: string; oldAmount: Cents; newAmount: Cents; transactionId: number; rule: RecurringRule };
  consent_expiring: { connectionId: number; aspspName: string; validUntil: string };
  /** `since` : date du premier échec de la série en cours (ISO datetime), pour la phrase principale. */
  sync_error: { connectionId: number; aspspName: string; since: string; lastError: string | null };
};

/** Un signal tel que renvoyé par l'API, avec sa charge typée selon son type. */
export type Signal<K extends SignalKind = SignalKind> = {
  id: number;
  kind: K;
  key: string;
  createdAt: string;
  dismissedAt: string | null;
  resolvedAt: string | null;
  payload: SignalPayloadByKind[K];
};

/** Union distribuée : un `Signal<'unusual_expense'>` ou un `Signal<'new_recurring'>`, etc. */
export type AnySignal = { [K in SignalKind]: Signal<K> }[SignalKind];

export type { Account, Envelope, ImportRecord, SortingRule, Transaction };

export type PortfolioRange = '1m' | '6m' | '1y' | 'all';

export type PriceInfo = { eur: number; date: ISODate; stale: boolean };

export type TradeView = {
  id: number;
  side: 'buy' | 'sell';
  date: ISODate;
  quantity: string;
  amount: Cents;
  fees: Cents;
  source: 'manual' | 'binance';
};

/** Point de courbe : valeur et montant investi à une date. */
export type SeriesPoint = { date: ISODate; value: Cents; invested: Cents };

export type HoldingView = {
  id: number;
  platform: Platform;
  ticker: string;
  name: string;
  source: 'manual' | 'binance';
  /** Quantité détenue : solde Binance pour une position synchronisée, sinon somme des mouvements. */
  quantity: string;
  /** Coût de revient (PMP) de la quantité couverte par des mouvements. */
  costBasis: Cents;
  realized: Cents;
  price: PriceInfo | null;
  value: Cents | null;
  gain: Cents | null;
  gainPct: number | null;
  dayChangePct: number | null;
  /** Quantité synchronisée sans mouvement d'achat connu (« 0,002 BTC sans prix d'achat »), sinon null. */
  unpricedQuantity: string | null;
  /** Quantité achetée d'après les mouvements mais absente du solde Binance (retrait, staking bloqué), sinon null. */
  missingQuantity: string | null;
  trades: TradeView[];
  /** Courbe de la position seule, même période et même échantillonnage que celle du portefeuille. */
  series: SeriesPoint[];
};

export type BinanceState = { configured: boolean; apiKeyHint: string | null; lastSyncAt: string | null; lastError: string | null };

export type PortfolioView = {
  today: ISODate;
  totals: { value: Cents; invested: Cents; gain: Cents; gainPct: number | null; realized: Cents };
  holdings: HoldingView[];
  series: SeriesPoint[];
  /** Vrai si au moins un cours affiché n'a pas pu être rafraîchi. */
  stale: boolean;
  binance: BinanceState;
};

export type BinanceSyncResult = { skipped: boolean; holdings: number; newTrades: number; warnings: string[] };

export type AssetSearchResult = { ticker: string; name: string; exchange: string; type: string };

export type IdeaRunView = {
  id: number;
  trigger: 'manual' | 'weekly';
  status: 'running' | 'done' | 'failed';
  /** Étape en cours : les chercheurs, puis le critique ; null une fois finie. */
  phase: 'research' | 'review' | null;
  startedAt: string;
  finishedAt: string | null;
  acceptedCount: number;
  /** Pistes proposées par les chercheurs, avant tout filtre. */
  candidateCount: number;
  failedAngles: { key: IdeaAngle; label: string }[];
  rejected: { ticker: string; reason: string }[];
  error: string | null;
};

export type IdeaView = {
  id: number;
  createdOn: ISODate;
  title: string;
  event: string;
  sources: string[];
  reasoning: string[];
  pricedIn: string;
  /** Ce qui peut mal tourner, selon le critique ; null pour les idées d'avant la critique. */
  risk: string | null;
  /** Variation sur 3 mois au moment de l'idée, et celle du S&P 500 ; null si inconnue. */
  marketContext: { perf3m: number; benchPerf3m: number } | null;
  ticker: string;
  assetName: string;
  whereToBuy: Platform;
  horizon: ISODate;
  startPriceEur: number;
  status: 'open' | 'closed';
  /** Rendement depuis l'idée (fraction : 0.05 = +5 %), figé à la clôture ; null si aucun cours. */
  return: number | null;
  benchReturn: number | null;
  /** Date du cours utilisé pour `return`. */
  priceDate: ISODate | null;
};

export type IdeasSummary = {
  closedCount: number;
  beatCount: number;
  /** Écart moyen idée - référence, en fraction. */
  avgExcess: number | null;
  hundredEach: { invested: Cents; ideas: Cents; bench: Cents };
  /** Retenues contre écartées, sur les idées closes passées par le critique ; null tant qu'un des deux groupes est vide. */
  filter: { keptCount: number; keptAvgExcess: number; droppedCount: number; droppedAvgExcess: number } | null;
};

export type IdeasView = { open: IdeaView[]; closed: IdeaView[]; summary: IdeasSummary; lastRun: IdeaRunView | null };

export type IdeaRunStart = { run: IdeaRunView | null; started: boolean };

/** Action proposée par Claude, validée et enrichie pour l'affichage. */
export type AskActionView =
  | { type: 'sort'; transactionIds: number[]; envelopeId: number; envelopeName: string; rulePattern: string | null; count: number; total: Cents }
  | { type: 'move'; fromEnvelopeId: number | null; fromName: string; toEnvelopeId: number; toName: string; amount: Cents }
  /**
   * `monthlyTarget` : budget voulu par Claude (null = retirer le complément) ; `monthlyExtra` : complément à enregistrer ;
   * `charges` : charges fixes de l'enveloppe ramenées au mois ; `current` : budget actuel calculé.
   */
  | { type: 'budget'; envelopeId: number; envelopeName: string; monthlyTarget: Cents | null; monthlyExtra: Cents | null; charges: Cents; current: Cents }
  | { type: 'recurring'; rule: RecurringRuleInput; accountName: string };

/** Graphique d'une réponse : les valeurs viennent de la requête exécutée par le serveur, pas de Claude. */
export type AskChart = { kind: 'bar' | 'line'; title: string; rows: { label: string; value: Cents }[] };

export type AskAnswerEvent = {
  sessionId: string;
  answer: string;
  highlight: { label: string; amount: Cents } | null;
  chart: AskChart | null;
  actions: AskActionView[];
  /** Motifs des actions refusées par `validateActions`, à afficher sous la réponse ; vide s'il n'y en a pas. */
  notices: string[];
};

/** Événements SSE de `POST /api/ask`. */
export type AskStreamEvent =
  | { event: 'step'; data: { text: string } }
  | { event: 'answer'; data: AskAnswerEvent }
  | { event: 'error'; data: { message: string; code: string } };

/** État du nommage des marchands par Claude (`GET /api/merchants/status`). */
export type MerchantStatus = { total: number; named: number; running: boolean; lastError: string | null };

/** Un marchand et le nombre de ses opérations (`GET /api/merchants/:key`). */
export type MerchantDetail = { key: string; name: string; source: MerchantSource | null; transactionCount: number };

/** Une avance avec sa dépense et son remboursement, pour l'affichage (`GET /api/advances`). */
export type AdvanceView = {
  id: number;
  person: string;
  amount: Cents;
  expense: { id: number; date: ISODate; label: string; envelopeId: number | null; envelopeName: string | null };
  refund: { id: number; date: ISODate; label: string } | null;
  settledAt: ISODate | null;
  createdAt: string;
};

/**
 * Une personne qui doit de l'argent : total ouvert et date de la dépense la plus ancienne qui porte
 * encore une avance ouverte (`GET /api/advances/people`).
 */
export type PersonAdvancesSummary = { person: string; totalOpen: Cents; oldestOpenDate: ISODate; openCount: number };

/** Rapprochement proposé entre un revenu sans enveloppe et une ou plusieurs avances ouvertes de la même personne. */
export type AdvanceSuggestionView = {
  incomeId: number;
  incomeLabel: string;
  incomeAmount: Cents;
  incomeDate: ISODate;
  person: string;
  advanceIds: number[];
  amount: Cents;
  /** Dépenses couvertes par les avances proposées. */
  expenses: { id: number; label: string; date: ISODate }[];
};

/** Une sauvegarde listée (`GET /api/backups`). */
export type BackupEntry = {
  name: string;
  /** Horodatage ISO, déduit du nom du fichier (ou de sa date de modification pour une ancienne copie manuelle). */
  date: string;
  /** Suffixe technique du nom (`demarrage`, `avant-migration`, `quotidienne`, `manuelle`, `avant-restauration`, ou une raison personnalisée). */
  reason: string;
  /** Raison en clair, pour l'affichage. */
  reasonLabel: string;
  size: number;
  /** Présente aussi dans le second dossier. */
  inMirror: boolean;
};

/** État des sauvegardes (`GET /api/backups`). */
export type BackupsState = {
  backups: BackupEntry[];
  /** Horodatage ISO de la dernière sauvegarde locale réussie, ou `null` si aucune. */
  lastSuccessAt: string | null;
  lastLocalError: string | null;
  lastMirrorError: string | null;
  localDir: string;
  mirrorDir: string | null;
};
