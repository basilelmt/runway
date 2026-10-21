import { describe, expect, it } from 'vitest';
import { askRequestSchema, recurringRuleInputSchema, tradePatchSchema, transactionInputSchema } from './schemas';

const base = { date: '2026-03-01', amount: 1000, label: 'Test' };

describe('transactionInputSchema', () => {
  it('accepte une dépense sans enveloppe (à trier)', () => {
    const r = transactionInputSchema.safeParse({ ...base, kind: 'expense', accountId: 1 });
    expect(r.success).toBe(true);
  });

  it('refuse une dépense sans compte', () => {
    const r = transactionInputSchema.safeParse({ ...base, kind: 'expense', envelopeId: 1 });
    expect(r.success).toBe(false);
  });

  it('refuse un transfert vers le même compte', () => {
    const r = transactionInputSchema.safeParse({
      ...base,
      kind: 'transfer',
      accountId: 1,
      toAccountId: 1,
    });
    expect(r.success).toBe(false);
  });

  it('refuse une allocation entre une enveloppe et elle-même', () => {
    const r = transactionInputSchema.safeParse({
      ...base,
      kind: 'allocation',
      envelopeId: 2,
      fromEnvelopeId: 2,
    });
    expect(r.success).toBe(false);
  });

  it('accepte une allocation depuis "À répartir"', () => {
    const r = transactionInputSchema.safeParse({ ...base, kind: 'allocation', envelopeId: 2 });
    expect(r.success).toBe(true);
  });

  it('refuse un montant nul, négatif ou non entier', () => {
    expect(transactionInputSchema.safeParse({ ...base, amount: 0, kind: 'income', accountId: 1 }).success).toBe(false);
    expect(transactionInputSchema.safeParse({ ...base, amount: -1, kind: 'income', accountId: 1 }).success).toBe(false);
    expect(transactionInputSchema.safeParse({ ...base, amount: 1.5, kind: 'income', accountId: 1 }).success).toBe(false);
  });

  it('refuse une date invalide', () => {
    expect(transactionInputSchema.safeParse({ ...base, date: '2026-02-30', kind: 'income', accountId: 1 }).success).toBe(false);
  });
});

describe('recurringRuleInputSchema', () => {
  const rule = {
    name: 'Loyer',
    kind: 'expense',
    amount: 80000,
    label: 'Loyer',
    accountId: 1,
    envelopeId: 3,
    frequency: 'monthly',
    interval: 1,
    dayOfMonth: 5,
    startDate: '2026-01-01',
  };

  it('accepte une règle mensuelle', () => {
    expect(recurringRuleInputSchema.safeParse(rule).success).toBe(true);
  });

  it('refuse une allocation : le budget mensuel se règle sur l’enveloppe', () => {
    const r = recurringRuleInputSchema.safeParse({ ...rule, kind: 'allocation', accountId: null });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['kind']);
  });

  it('exige dayOfMonth pour monthly', () => {
    expect(recurringRuleInputSchema.safeParse({ ...rule, dayOfMonth: undefined }).success).toBe(false);
  });

  it('refuse une fin avant le début', () => {
    expect(recurringRuleInputSchema.safeParse({ ...rule, endDate: '2025-12-01' }).success).toBe(false);
  });
});

describe('tradePatchSchema', () => {
  it('laisse les frais absents au lieu de les remettre à zéro', () => {
    expect(tradePatchSchema.parse({ amount: 100 })).toEqual({ amount: 100 });
  });

  it('accepte une quantité à virgule', () => {
    expect(tradePatchSchema.parse({ quantity: '0,5' })).toEqual({ quantity: '0.5' });
  });
});

describe('askRequestSchema', () => {
  const ref = { kind: 'section' as const, id: null, label: 'Idées en cours', snapshot: 'Ensemble…' };

  it('garde les anciennes requêtes valides : ni écran ni bloc par défaut', () => {
    expect(askRequestSchema.parse({ question: 'Combien ?', sessionId: null })).toEqual({ question: 'Combien ?', sessionId: null, page: null, refs: [] });
  });

  it('accepte huit blocs au plus, et un texte de bloc de 1 500 caractères au plus', () => {
    expect(askRequestSchema.safeParse({ question: 'q', sessionId: null, page: 'Investir', refs: Array(8).fill(ref) }).success).toBe(true);
    expect(askRequestSchema.safeParse({ question: 'q', sessionId: null, refs: Array(9).fill(ref) }).success).toBe(false);
    expect(askRequestSchema.safeParse({ question: 'q', sessionId: null, refs: [{ ...ref, snapshot: 'x'.repeat(1501) }] }).success).toBe(false);
    expect(askRequestSchema.safeParse({ question: 'q', sessionId: null, refs: [{ ...ref, label: ' ' }] }).success).toBe(false);
  });
});
