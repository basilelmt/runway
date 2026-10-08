import { describe, expect, it } from 'vitest';
import type { BankSyncConnectionResult, BankSyncRunResult } from '@shared/api-types';
import { keepTogether, syncSummary } from './format';

function run(...counts: { created: number; matched: number }[]): BankSyncRunResult {
  const connections: BankSyncConnectionResult[] = counts.map((c, i) => ({ connectionId: i + 1, status: 'active', duplicates: 0, skipped: 0, error: null, ...c }));
  return { reason: 'ok', connections };
}

describe('syncSummary', () => {
  it('rien de créé ni de rapproché : null', () => {
    expect(syncSummary(run({ created: 0, matched: 0 }))).toBeNull();
    expect(syncSummary({ reason: 'fresh', connections: [] })).toBeNull();
  });

  it('créations seules, rapprochements seuls, ou les deux, sans jamais « 0 opération »', () => {
    expect(syncSummary(run({ created: 1, matched: 0 }))).toBe('1 opération synchronisée');
    expect(syncSummary(run({ created: 3, matched: 0 }))).toBe('3 opérations synchronisées');
    expect(syncSummary(run({ created: 0, matched: 1 }))).toBe('1 opération rapprochée');
    expect(syncSummary(run({ created: 0, matched: 2 }))).toBe('2 opérations rapprochées');
    expect(syncSummary(run({ created: 3, matched: 1 }))).toBe('3 opérations synchronisées, 1 rapprochée');
  });

  it('additionne les connexions', () => {
    expect(syncSummary(run({ created: 2, matched: 0 }, { created: 1, matched: 2 }))).toBe('3 opérations synchronisées, 2 rapprochées');
  });
});

describe('keepTogether', () => {
  it('rend insécables les espaces des montants', () => {
    expect(keepTogether('Octobre en est à 1 223,17 € au 8, soit 12 % de plus.')).toBe('Octobre en est à 1 223,17 € au 8, soit 12 % de plus.');
    expect(keepTogether('32 047,71 € et 1 234 567 €')).toBe('32 047,71 € et 1 234 567 €');
  });

  it('garde les guillemets collés à leur contenu', () => {
    expect(keepTogether('la règle « MG BOULOGNE » suffit')).toBe('la règle « MG BOULOGNE » suffit');
  });

  it('ne touche pas aux nombres séparés par du texte', () => {
    expect(keepTogether('les mois 3 et 4 puis 2026 1234')).toBe('les mois 3 et 4 puis 2026 1234');
  });
});
