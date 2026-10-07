import { describe, expect, it } from 'vitest';
import { budgetNeedsAttention, budgetOverIncome } from './budget';

const month = { start: '2026-10-01', end: '2026-10-31', spent: 0, budget: 0, variable: { spent: 0, budget: 0 }, saved: 0, toFund: 0, income: 0, planned: 0 };

describe('budgetOverIncome', () => {
  it('mesure le dépassement du revenu par les enveloppes', () => {
    expect(budgetOverIncome({ income: 2450_00, planned: 2871_00 })).toBe(421_00);
    expect(budgetOverIncome({ income: 2450_00, planned: 2000_00 })).toBe(0);
  });

  it('ne compare rien sans revenu récurrent connu', () => {
    expect(budgetOverIncome({ income: 0, planned: 2871_00 })).toBe(0);
  });
});

describe('budgetNeedsAttention', () => {
  it('signale un budget qui dépasse le revenu', () => {
    expect(budgetNeedsAttention({ toAllocate: 0, month: { ...month, income: 2450_00, planned: 2871_00 } })).toBe(true);
    expect(budgetNeedsAttention({ toAllocate: 0, month: { ...month, income: 2450_00, planned: 2450_00 } })).toBe(false);
  });
});
