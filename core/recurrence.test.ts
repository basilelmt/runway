import { describe, expect, it } from 'vitest';
import { expandRule, nextOccurrence } from './recurrence';
import { rule } from './test-fixtures';

describe('expandRule', () => {
  it('mensuel le 31 se borne en février', () => {
    const r = rule({ kind: 'expense', amount: 1, frequency: 'monthly', dayOfMonth: 31, startDate: '2026-01-01' });
    expect(expandRule(r, '2026-01-01', '2026-04-30')).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('mensuel tous les 2 mois', () => {
    const r = rule({ kind: 'expense', amount: 1, frequency: 'monthly', interval: 2, dayOfMonth: 5, startDate: '2026-01-01' });
    expect(expandRule(r, '2026-01-01', '2026-06-30')).toEqual(['2026-01-05', '2026-03-05', '2026-05-05']);
  });

  it('hebdomadaire toutes les 2 semaines à partir du début', () => {
    const r = rule({ kind: 'expense', amount: 1, frequency: 'weekly', interval: 2, startDate: '2026-03-02' });
    expect(expandRule(r, '2026-03-01', '2026-04-01')).toEqual(['2026-03-02', '2026-03-16', '2026-03-30']);
  });

  it('quotidien borné par la date de fin', () => {
    const r = rule({ kind: 'expense', amount: 1, frequency: 'daily', startDate: '2026-03-01', endDate: '2026-03-03' });
    expect(expandRule(r, '2026-02-01', '2026-03-31')).toEqual(['2026-03-01', '2026-03-02', '2026-03-03']);
  });

  it('annuel au jour et mois du début', () => {
    const r = rule({ kind: 'expense', amount: 1, frequency: 'yearly', dayOfMonth: 15, startDate: '2024-06-15' });
    expect(expandRule(r, '2024-01-01', '2026-12-31')).toEqual(['2024-06-15', '2025-06-15', '2026-06-15']);
  });

  it('règle inactive ou hors période', () => {
    const inactive = rule({ kind: 'expense', amount: 1, active: false });
    expect(expandRule(inactive, '2026-01-01', '2026-12-31')).toEqual([]);
    const future = rule({ kind: 'expense', amount: 1, startDate: '2027-01-01' });
    expect(expandRule(future, '2026-01-01', '2026-12-31')).toEqual([]);
  });

  it('la première occurrence mensuelle est le premier jour visé à partir du début', () => {
    const r = rule({ kind: 'expense', amount: 1, frequency: 'monthly', dayOfMonth: 5, startDate: '2026-01-10' });
    expect(expandRule(r, '2026-01-01', '2026-03-31')).toEqual(['2026-02-05', '2026-03-05']);
  });

  it('nextOccurrence renvoie la prochaine date strictement après', () => {
    const r = rule({ kind: 'expense', amount: 1, frequency: 'monthly', dayOfMonth: 5, startDate: '2026-01-01' });
    expect(nextOccurrence(r, '2026-03-05')).toBe('2026-04-05');
    expect(nextOccurrence(r, '2026-03-04')).toBe('2026-03-05');
    const ended = rule({ kind: 'expense', amount: 1, frequency: 'monthly', dayOfMonth: 5, startDate: '2026-01-01', endDate: '2026-02-28' });
    expect(nextOccurrence(ended, '2026-03-01')).toBeNull();
  });
});
