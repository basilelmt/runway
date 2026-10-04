import { z } from 'zod';
import { isValidISODate } from './dates';

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

export const accountInputSchema = z.object({
  name: z.string().trim().min(1, 'Nom requis').max(80),
  initialBalance: centsSchema.default(0),
  onBudget: z.boolean().default(true),
  bankAccountNumber: z.string().trim().max(40).nullable().optional(),
});
export type AccountInput = z.infer<typeof accountInputSchema>;

export const envelopeSchema = z.object({
  id: idSchema,
  name: z.string(),
  color: z.string(),
  monthlyTarget: centsSchema.nullable(),
  sortOrder: z.number().int(),
  archived: z.boolean(),
});
export type Envelope = z.infer<typeof envelopeSchema>;

export const envelopeInputSchema = z.object({
  name: z.string().trim().min(1, 'Nom requis').max(80),
  color: colorSchema.default('#4f8a5b'),
  monthlyTarget: positiveCentsSchema.nullable().optional(),
});
export type EnvelopeInput = z.infer<typeof envelopeInputSchema>;

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
  limit: z.coerce.number().int().positive().max(1000).default(500),
});
export type TransactionFilter = z.infer<typeof transactionFilterSchema>;

export const recurringRuleSchema = z.object({
  id: idSchema,
  name: z.string(),
  ...operationFields,
  frequency: z.enum(frequencies),
  interval: z.number().int().positive(),
  dayOfMonth: z.number().int().min(1).max(31).nullable(),
  startDate: isoDateSchema,
  endDate: isoDateSchema.nullable(),
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
  })
  .superRefine((rule, ctx) => {
    checkOperation(rule, ctx);
    if ((rule.frequency === 'monthly' || rule.frequency === 'yearly') && !rule.dayOfMonth) {
      ctx.addIssue({ code: 'custom', message: 'Jour du mois requis', path: ['dayOfMonth'] });
    }
    if (rule.endDate && rule.endDate < rule.startDate) {
      ctx.addIssue({ code: 'custom', message: 'La fin doit être après le début', path: ['endDate'] });
    }
  });
export type RecurringRuleInput = z.infer<typeof recurringRuleInputSchema>;

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
});
export type Settings = z.infer<typeof settingsSchema>;

export const bankConnectionStatuses = ['pending', 'authorized', 'active', 'expired', 'revoked'] as const;
export type BankConnectionStatus = (typeof bankConnectionStatuses)[number];

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
