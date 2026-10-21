import { z } from 'zod';
import { isValidISODate } from './dates';
import { platforms } from './invest';

export const isoDateSchema = z
  .string()
  .refine(isValidISODate, { message: 'Date invalide (attendu AAAA-MM-JJ)' });

export const centsSchema = z.number().int('Montant en centimes entiers');
export const positiveCentsSchema = centsSchema.positive('Le montant doit être positif');
const idSchema = z.number().int().positive();
const nullableId = idSchema.nullable().optional();
const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Couleur hexadécimale attendue');

export const transactionKinds = ['expense', 'income', 'transfer', 'allocation'] as const;
export type TransactionKind = (typeof transactionKinds)[number];
export const transactionStatuses = ['confirmed', 'planned'] as const;
export type TransactionStatus = (typeof transactionStatuses)[number];
/** Qui a donné le nom d'un marchand : Claude, ou l'utilisateur (jamais écrasé). */
export const merchantSources = ['claude', 'user'] as const;
export type MerchantSource = (typeof merchantSources)[number];
/** Qui a donné la description d'un marchand : Claude, une recherche web, ou l'utilisateur (jamais écrasée). */
export const merchantDescriptionSources = ['claude', 'web', 'user'] as const;
export type MerchantDescriptionSource = (typeof merchantDescriptionSources)[number];
export const MERCHANT_DESCRIPTION_MAX = 140;
export const MERCHANT_NAME_MAX = 60;
export const frequencies = ['daily', 'weekly', 'monthly', 'yearly'] as const;
export type Frequency = (typeof frequencies)[number];

export const accountSchema = z.object({
  id: idSchema,
  name: z.string(),
  initialBalance: centsSchema,
  onBudget: z.boolean(),
  bankAccountNumber: z.string().nullable(),
  archived: z.boolean(),
  createdAt: z.string(),
});
export type Account = z.infer<typeof accountSchema>;

const accountFields = {
  name: z.string().trim().min(1, 'Nom requis').max(80),
  initialBalance: centsSchema,
  onBudget: z.boolean(),
  bankAccountNumber: z.string().trim().max(40).nullable().optional(),
};

export const accountInputSchema = z.object({
  ...accountFields,
  initialBalance: accountFields.initialBalance.default(0),
  onBudget: accountFields.onBudget.default(true),
});
export type AccountInput = z.infer<typeof accountInputSchema>;

/** Modification partielle : sans valeurs par défaut, un champ absent reste inchangé. */
export const accountPatchSchema = z.object(accountFields).partial().extend({ archived: z.boolean().optional() });
export type AccountPatch = z.infer<typeof accountPatchSchema>;

export const envelopeSchema = z.object({
  id: idSchema,
  name: z.string(),
  color: z.string(),
  /** Complément mensuel saisi à la main, en plus des charges fixes ; null = pas de complément. */
  monthlyExtra: centsSchema.nullable(),
  sortOrder: z.number().int(),
  archived: z.boolean(),
  isSavings: z.boolean(),
});
export type Envelope = z.infer<typeof envelopeSchema>;

const envelopeFields = {
  name: z.string().trim().min(1, 'Nom requis').max(80),
  color: colorSchema,
  monthlyExtra: positiveCentsSchema.nullable().optional(),
  isSavings: z.boolean(),
};

export const envelopeInputSchema = z.object({
  ...envelopeFields,
  color: envelopeFields.color.default('#4f8a5b'),
  isSavings: envelopeFields.isSavings.optional(),
});
export type EnvelopeInput = z.infer<typeof envelopeInputSchema>;

/** Répartition groupée depuis "Pas encore réparti" vers plusieurs enveloppes. */
export const envelopeFundSchema = z.object({
  items: z
    .array(z.object({ envelopeId: idSchema, amount: positiveCentsSchema }))
    .min(1, 'Rien à répartir')
    .refine((items) => new Set(items.map((i) => i.envelopeId)).size === items.length, 'Une enveloppe apparaît deux fois'),
});
export type EnvelopeFund = z.infer<typeof envelopeFundSchema>;

/** Modification partielle : sans valeurs par défaut, un champ absent reste inchangé. */
export const envelopePatchSchema = z.object(envelopeFields).partial().extend({ archived: z.boolean().optional() });
export type EnvelopePatch = z.infer<typeof envelopePatchSchema>;

/** Champs communs à une opération et au modèle d'une règle récurrente (entités stockées). */
const operationFields = {
  kind: z.enum(transactionKinds),
  amount: positiveCentsSchema,
  label: z.string(),
  accountId: idSchema.nullable(),
  toAccountId: idSchema.nullable(),
  envelopeId: idSchema.nullable(),
  fromEnvelopeId: idSchema.nullable(),
};

/** Même chose en entrée : les références sont facultatives et validées selon le type. */
const operationInputFields = {
  kind: z.enum(transactionKinds),
  amount: positiveCentsSchema,
  label: z.string().trim().min(1, 'Libellé requis').max(200),
  accountId: nullableId,
  toAccountId: nullableId,
  envelopeId: nullableId,
  fromEnvelopeId: nullableId,
};

type OperationShape = {
  kind: TransactionKind;
  accountId?: number | null;
  toAccountId?: number | null;
  envelopeId?: number | null;
  fromEnvelopeId?: number | null;
};

function checkOperation(op: OperationShape, ctx: z.RefinementCtx) {
  const issue = (message: string, path: string) => ctx.addIssue({ code: 'custom', message, path: [path] });
  switch (op.kind) {
    case 'expense':
      if (!op.accountId) issue('Compte requis', 'accountId');
      break;
    case 'income':
      if (!op.accountId) issue('Compte requis', 'accountId');
      break;
    case 'transfer':
      if (!op.accountId) issue('Compte source requis', 'accountId');
      if (!op.toAccountId) issue('Compte destination requis', 'toAccountId');
      if (op.accountId && op.accountId === op.toAccountId) issue('Les deux comptes doivent être différents', 'toAccountId');
      break;
    case 'allocation':
      if (!op.envelopeId) issue('Enveloppe requise', 'envelopeId');
      if (op.fromEnvelopeId && op.fromEnvelopeId === op.envelopeId) issue('Les deux enveloppes doivent être différentes', 'fromEnvelopeId');
      break;
  }
}

export const transactionSchema = z.object({
  id: idSchema,
  ...operationFields,
  date: isoDateSchema,
  note: z.string().nullable(),
  status: z.enum(transactionStatuses),
  recurringRuleId: idSchema.nullable(),
  importId: idSchema.nullable(),
  fingerprint: z.string().nullable(),
  fundingId: idSchema.nullable(),
  /** Clé du marchand tirée du libellé (dépenses et revenus), null sinon. */
  merchantKey: z.string().nullable(),
  /** Nom du marchand, ou son repli tant qu'il n'est pas nommé ; null sans clé. */
  merchantName: z.string().nullable(),
  createdAt: z.string(),
});
export type Transaction = z.infer<typeof transactionSchema>;

export const transactionInputSchema = z
  .object({
    ...operationInputFields,
    date: isoDateSchema,
    note: z.string().trim().max(500).nullable().optional(),
  })
  .superRefine(checkOperation);
export type TransactionInput = z.infer<typeof transactionInputSchema>;

export const transactionFilterSchema = z.object({
  account: z.coerce.number().int().positive().optional(),
  envelope: z.coerce.number().int().positive().optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  q: z.string().trim().max(100).optional(),
  status: z.enum(transactionStatuses).optional(),
  kind: z.enum(transactionKinds).optional(),
  unsorted: z.coerce.boolean().optional(),
  merchant: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().positive().max(1000).default(500),
});
export type TransactionFilter = z.infer<typeof transactionFilterSchema>;

export const fundingStatuses = ['applied', 'undone'] as const;

/** Répartition automatique déclenchée par un revenu confirmé. */
export const fundingSchema = z.object({
  id: idSchema,
  sourceTransactionId: idSchema,
  month: z.string(),
  status: z.enum(fundingStatuses),
  shortfallCount: z.number().int().nonnegative(),
  dismissedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Funding = z.infer<typeof fundingSchema>;

/** `AAAA-MM`. */
export const monthKeySchema = z.string().refine((s) => isValidISODate(`${s}-01`), { message: 'Mois invalide (attendu AAAA-MM)' });

/** Ce qu'un bilan validé a appliqué, pour l'annulation et l'affichage d'un bilan déjà validé. */
export const appliedReviewSchema = z.object({
  budgets: z.array(z.object({ envelopeId: idSchema, before: centsSchema.nullable(), after: centsSchema.nullable() })),
  allocationIds: z.array(idSchema),
});
export type AppliedReview = z.infer<typeof appliedReviewSchema>;

/** Bilan validé d'un mois passé (table `month_reviews`). */
export const monthReviewSchema = z.object({
  month: monthKeySchema,
  reviewedAt: z.string(),
  applied: appliedReviewSchema,
});
export type MonthReviewRecord = z.infer<typeof monthReviewSchema>;

/** Ce que `POST /api/reviews/:month` applique en une transaction. */
export const reviewApplySchema = z.object({
  budgets: z.array(z.object({ envelopeId: idSchema, monthlyExtra: positiveCentsSchema.nullable() })),
  transfers: z.array(z.object({ fromEnvelopeId: idSchema, toEnvelopeId: idSchema, amount: positiveCentsSchema })),
});
export type ReviewApply = z.infer<typeof reviewApplySchema>;

export const recurringRuleSchema = z.object({
  id: idSchema,
  name: z.string(),
  ...operationFields,
  frequency: z.enum(frequencies),
  interval: z.number().int().positive(),
  dayOfMonth: z.number().int().min(1).max(31).nullable(),
  startDate: isoDateSchema,
  endDate: isoDateSchema.nullable(),
  triggersFunding: z.boolean(),
  fundsNextMonth: z.boolean(),
  lastGeneratedDate: isoDateSchema.nullable(),
  active: z.boolean(),
});
export type RecurringRule = z.infer<typeof recurringRuleSchema>;

export const recurringRuleInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Nom requis').max(80),
    ...operationInputFields,
    frequency: z.enum(frequencies),
    interval: z.number().int().positive().max(365).default(1),
    dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
    startDate: isoDateSchema,
    endDate: isoDateSchema.nullable().optional(),
    active: z.boolean().default(true),
    triggersFunding: z.boolean().default(false),
    fundsNextMonth: z.boolean().default(false),
  })
  .superRefine((rule, ctx) => {
    if (rule.kind === 'allocation') {
      ctx.addIssue({ code: 'custom', message: 'Le budget mensuel se règle sur l’enveloppe', path: ['kind'] });
      return;
    }
    checkOperation(rule, ctx);
    if ((rule.frequency === 'monthly' || rule.frequency === 'yearly') && !rule.dayOfMonth) {
      ctx.addIssue({ code: 'custom', message: 'Jour du mois requis', path: ['dayOfMonth'] });
    }
    if (rule.endDate && rule.endDate < rule.startDate) {
      ctx.addIssue({ code: 'custom', message: 'La fin doit être après le début', path: ['endDate'] });
    }
    if (rule.triggersFunding && rule.kind !== 'income') {
      ctx.addIssue({ code: 'custom', message: 'Seul un revenu peut déclencher la répartition', path: ['triggersFunding'] });
    }
    if (rule.fundsNextMonth && !rule.triggersFunding) {
      ctx.addIssue({ code: 'custom', message: 'Le mois suivant ne vaut que pour un revenu qui déclenche la répartition', path: ['fundsNextMonth'] });
    }
  });
export type RecurringRuleInput = z.infer<typeof recurringRuleInputSchema>;

/** Espaces superflus compactés, comme pour un libellé importé. */
const compactSpaces = (s: string) => s.replace(/\s+/g, ' ').trim();

export const advanceSchema = z.object({
  id: idSchema,
  expenseId: idSchema,
  person: z.string(),
  amount: positiveCentsSchema,
  refundId: idSchema.nullable(),
  settledAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Advance = z.infer<typeof advanceSchema>;

/** Une ligne d'avance saisie : nom libre (espaces compactés) et montant. */
export const advanceLineInputSchema = z.object({
  person: z.string().trim().min(1, 'Nom requis').max(80).transform(compactSpaces),
  amount: positiveCentsSchema,
});
export type AdvanceLineInput = z.infer<typeof advanceLineInputSchema>;

/** Remplace toutes les avances d'une dépense ; la somme ne peut pas dépasser son montant (vérifié à l'écriture). */
export const advancesReplaceSchema = z.array(advanceLineInputSchema).max(30, 'Trop de lignes');
export type AdvancesReplace = z.infer<typeof advancesReplaceSchema>;

/** Solde une ou plusieurs avances ouvertes ; `refundId` nul = soldée sans remboursement. */
export const advancesSettleSchema = z.object({
  advanceIds: z.array(idSchema).min(1, 'Aucune avance'),
  refundId: idSchema.nullable(),
});
export type AdvancesSettle = z.infer<typeof advancesSettleSchema>;

export const sortingRuleSchema = z.object({
  id: idSchema,
  pattern: z.string(),
  envelopeId: idSchema,
  priority: z.number().int(),
});
export type SortingRule = z.infer<typeof sortingRuleSchema>;

export const sortingRuleInputSchema = z.object({
  pattern: z.string().trim().min(2, 'Motif trop court').max(100),
  envelopeId: idSchema,
});
export type SortingRuleInput = z.infer<typeof sortingRuleInputSchema>;

export const importRecordSchema = z.object({
  id: idSchema,
  fileName: z.string(),
  accountId: idSchema,
  importedAt: z.string(),
  rowCount: z.number().int(),
  newCount: z.number().int(),
  duplicateCount: z.number().int(),
  matchedCount: z.number().int(),
});
export type ImportRecord = z.infer<typeof importRecordSchema>;

export const settingsSchema = z.object({
  forecastHorizonDays: z.number().int().min(7).max(730).default(90),
  claudeModel: z.string().trim().max(60).default(''),
  /** Application ID Enable Banking (en-tête `kid` du JWT). Vide = synchro bancaire désactivée. */
  enableBankingAppId: z.string().trim().max(100).default(''),
  /** Clé privée PEM de l'application Enable Banking. */
  enableBankingPrivateKey: z.string().trim().max(10_000).default(''),
  /** Chemin absolu d'un second dossier de sauvegardes (clé USB, NAS, dossier synchronisé). Vide = pas de second dossier. */
  backupMirrorDir: z.string().trim().max(500).default(''),
});
export type Settings = z.infer<typeof settingsSchema>;

export const bankConnectionStatuses = ['pending', 'authorized', 'active', 'expired', 'revoked'] as const;
export type BankConnectionStatus = (typeof bankConnectionStatuses)[number];

/**
 * Les types de signaux, dans l'ordre où ils sont détectés.
 * Pas de `missing_charge` : une occurrence prévue en retard est déjà signalée dans « À faire »
 * (alerte existante sur `latePlanned`), avec une action plus complète (confirmer ou supprimer).
 * Un deuxième signal pour le même événement n'aurait rien ajouté.
 */
export const signalKinds = ['unusual_expense', 'new_recurring', 'price_change', 'consent_expiring', 'sync_error'] as const;
export type SignalKind = (typeof signalKinds)[number];

export const bankStartSchema = z.object({ connectionId: idSchema.nullable().optional() });
export type BankStartInput = z.infer<typeof bankStartSchema>;

export const bankCompleteSchema = z.object({
  code: z.string().trim().min(1, 'Code manquant').max(1000),
  state: z.string().trim().min(1, 'State manquant').max(200),
});
export type BankCompleteInput = z.infer<typeof bankCompleteSchema>;

export const bankLinkSchema = z.object({
  links: z.array(z.object({ bankAccountId: idSchema, accountId: idSchema.nullable() })).min(1, 'Aucun compte'),
});
export type BankLinkInput = z.infer<typeof bankLinkSchema>;

export const bankRunSchema = z.object({ onlyIfStaleMinutes: z.number().int().min(1).max(10_080).optional() });
export type BankRunInput = z.infer<typeof bankRunSchema>;

export const idListSchema = z.object({ ids: z.array(idSchema).min(1) });

export const suggestionResultSchema = z.object({
  suggestions: z.array(
    z.object({
      transactionId: z.number().int(),
      envelopeId: z.number().int().nullable(),
      reason: z.string().max(300),
    }),
  ),
  rules: z.array(z.object({ pattern: z.string().min(2).max(100), envelopeId: z.number().int() })),
});
export type SuggestionResult = z.infer<typeof suggestionResultSchema>;

export const sortingApplySchema = z.object({
  assignments: z.array(z.object({ transactionId: idSchema, envelopeId: idSchema })),
  rules: z.array(sortingRuleInputSchema).default([]),
});
export type SortingApply = z.infer<typeof sortingApplySchema>;

/** Renommage d'un marchand par l'utilisateur ; un nom vide le rend à Claude. */
export const merchantRenameSchema = z.object({
  name: z.string().trim().max(60, '60 caractères au plus'),
  /** Absente : description inchangée. Vide : rendue à Claude. */
  description: z.string().trim().max(MERCHANT_DESCRIPTION_MAX, `${MERCHANT_DESCRIPTION_MAX} caractères au plus`).optional(),
});
export type MerchantRename = z.infer<typeof merchantRenameSchema>;

/** Sortie brute du nommage des marchands par Claude, filtrée clé par clé ensuite. */
export const merchantNamesResultSchema = z.object({
  names: z.array(z.object({ key: z.string(), name: z.string(), description: z.string().default('') })),
});

/** Sortie brute de la recherche web d'un marchand à la demande. */
export const merchantWebResultSchema = z.object({ description: z.string() });

/** Quantité décimale exacte, transportée en texte (« 0.04512 »). */
export const decimalSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(',', '.'))
  .pipe(z.string().regex(/^\d+(\.\d{1,18})?$/, 'Quantité invalide'))
  .refine((s) => /[1-9]/.test(s), 'La quantité doit être positive');

export const tradeInputSchema = z.object({
  side: z.enum(['buy', 'sell']),
  date: isoDateSchema,
  quantity: decimalSchema,
  amount: positiveCentsSchema,
  fees: centsSchema.min(0, 'Frais négatifs').default(0),
});
export type TradeInput = z.infer<typeof tradeInputSchema>;

/** Modification partielle : sans valeur par défaut, un champ absent reste inchangé (les frais ne retombent pas à zéro). */
export const tradePatchSchema = tradeInputSchema.extend({ fees: centsSchema.min(0, 'Frais négatifs') }).partial();
export type TradePatch = z.infer<typeof tradePatchSchema>;

export const holdingInputSchema = z.object({
  platform: z.enum(platforms),
  ticker: z.string().trim().min(1, 'Ticker manquant').max(32),
  name: z.string().trim().min(1, 'Nom manquant').max(120),
  firstTrade: tradeInputSchema,
});
export type HoldingInput = z.infer<typeof holdingInputSchema>;

export const binanceKeysSchema = z.object({
  apiKey: z.string().trim().min(16, 'Clé API trop courte').max(200),
  apiSecret: z.string().trim().min(16, 'Clé secrète trop courte').max(200),
});
export type BinanceKeys = z.infer<typeof binanceKeysSchema>;

export const binanceSyncSchema = z.object({ onlyIfStaleMinutes: z.number().int().min(1).max(10_080).optional() });

export const ideaRunStartSchema = z.object({ trigger: z.enum(['manual', 'weekly']) });

const validSourceUrl = z.url({ protocol: /^https?$/, error: 'Lien http(s) attendu' });
/** Ticker normalisé en majuscules : les comparaisons (doublon, déjà détenu, verdict) ignorent la casse. */
const tickerSchema = z.string().trim().min(1).max(32).transform((s) => s.toUpperCase());

/** Une piste telle qu'un chercheur la propose, avant vérification du ticker. */
export const ideaCandidateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  event: z.string().trim().min(1).max(1000),
  /** Un lien invalide (ex. `javascript:`) n'écarte pas toute la piste : seules les URL http(s) valides sont gardées, dédoublonnées, dans la limite de 8. */
  sources: z
    .array(z.string())
    .transform((urls) => {
      const valid = urls.filter((u) => validSourceUrl.safeParse(u).success);
      return [...new Set(valid)].slice(0, 8);
    })
    .refine((urls) => urls.length > 0, 'Format invalide'),
  reasoning: z.array(z.string().trim().min(1).max(400)).min(1).max(5),
  ticker: tickerSchema,
  assetName: z.string().trim().min(1).max(120),
  whereToBuy: z.enum(platforms),
  horizon: isoDateSchema,
});
export type IdeaCandidate = z.infer<typeof ideaCandidateSchema>;

/** Sortie brute d'un chercheur : chaque piste est validée séparément pour ne pas tout rejeter pour une seule. */
export const ideaBatchSchema = z.object({ ideas: z.array(z.unknown()) });

/** Verdict du critique sur une piste ; "pricedIn" et "risk" peuvent être vides (pas d'avis particulier). */
export const ideaReviewSchema = z.object({
  ticker: tickerSchema,
  verdict: z.enum(['kept', 'dropped']),
  reason: z.string().trim().min(1).max(600),
  pricedIn: z.string().trim().max(600),
  risk: z.string().trim().max(600),
});
export type IdeaReview = z.infer<typeof ideaReviewSchema>;

/** Sortie brute du critique, validée verdict par verdict. */
export const ideaReviewBatchSchema = z.object({ reviews: z.array(z.unknown()) });

export const askRequestSchema = z.object({
  question: z.string().trim().min(1, 'Question vide').max(500, 'Question trop longue'),
  sessionId: z.uuid().nullable(),
});
export type AskRequest = z.infer<typeof askRequestSchema>;

/** Actions que Claude peut proposer depuis Demander ; rien n'est appliqué sans un clic. */
export const askActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('sort'), transactionIds: z.array(idSchema).min(1).max(500), envelopeId: idSchema, rulePattern: z.string().trim().min(2).max(100).nullable() }),
  z.object({ type: z.literal('move'), fromEnvelopeId: idSchema.nullable(), toEnvelopeId: idSchema, amount: positiveCentsSchema }),
  z.object({ type: z.literal('budget'), envelopeId: idSchema, monthlyTarget: positiveCentsSchema.nullable() }),
  z.object({ type: z.literal('recurring'), rule: recurringRuleInputSchema }),
]);
export type AskAction = z.infer<typeof askActionSchema>;

/** Réponse structurée de Claude ; les actions sont validées une par une ensuite. */
export const askAnswerSchema = z.object({
  answer: z.string().trim().min(1),
  highlight: z.object({ label: z.string(), amount: z.number().int() }).nullable(),
  chart: z.object({ kind: z.enum(['bar', 'line']), title: z.string(), sql: z.string() }).nullable(),
  actions: z.array(z.unknown()).max(5),
});
export type AskAnswer = z.infer<typeof askAnswerSchema>;
