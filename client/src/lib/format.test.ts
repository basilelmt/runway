import { describe, expect, it } from 'vitest';
import type { BankSyncConnectionResult, BankSyncRunResult } from '@shared/api-types';
import { syncSummary } from './format';

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
