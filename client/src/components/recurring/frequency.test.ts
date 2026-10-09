import { describe, expect, it } from 'vitest';
import { describeFrequency, describeRhythm } from './frequency';

describe('describeRhythm', () => {
  it('donne le rythme d’une charge non mensuelle, rien pour une mensuelle', () => {
    expect(describeRhythm({ frequency: 'monthly', interval: 1 })).toBeNull();
    expect(describeRhythm({ frequency: 'monthly', interval: 3 })).toBe('tous les 3 mois');
    expect(describeRhythm({ frequency: 'yearly', interval: 1 })).toBe('par an');
    expect(describeRhythm({ frequency: 'yearly', interval: 2 })).toBe('tous les 2 ans');
    expect(describeRhythm({ frequency: 'weekly', interval: 1 })).toBe('par semaine');
    expect(describeRhythm({ frequency: 'weekly', interval: 2 })).toBe('toutes les 2 semaines');
    expect(describeRhythm({ frequency: 'daily', interval: 1 })).toBe('par jour');
    expect(describeRhythm({ frequency: 'daily', interval: 3 })).toBe('tous les 3 jours');
  });
});

describe('describeFrequency', () => {
  it.each([
    [{ frequency: 'monthly', interval: 1, dayOfMonth: 5, startDate: '2026-01-01' }, 'Tous les mois le 5'],
    [{ frequency: 'monthly', interval: 1, dayOfMonth: 1, startDate: '2026-01-01' }, 'Tous les mois le 1er'],
    [{ frequency: 'monthly', interval: 3, dayOfMonth: 10, startDate: '2026-01-01' }, 'Tous les 3 mois le 10'],
    [{ frequency: 'weekly', interval: 2, dayOfMonth: null, startDate: '2026-01-01' }, 'Toutes les 2 semaines'],
    [{ frequency: 'weekly', interval: 1, dayOfMonth: null, startDate: '2026-01-01' }, 'Toutes les semaines'],
    [{ frequency: 'daily', interval: 1, dayOfMonth: null, startDate: '2026-01-01' }, 'Tous les jours'],
    [{ frequency: 'yearly', interval: 1, dayOfMonth: 15, startDate: '2024-06-15' }, 'Tous les ans le 15 juin'],
  ] as const)('%o -> %s', (rule, expected) => {
    expect(describeFrequency(rule)).toBe(expected);
  });
});
