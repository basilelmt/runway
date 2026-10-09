import { describe, expect, it } from 'vitest';
import { buildAskSystemPrompt } from '../src/ask/prompt';

describe('buildAskSystemPrompt', () => {
  it('décrit les marchands et invite à regrouper par nom de marchand', () => {
    const p = buildAskSystemPrompt({ today: '2026-10-08', envelopes: [], accounts: [] });
    expect(p).toContain('recurring_rule_id, merchant_key)');
    expect(p).toContain('merchants(key, name, source)');
    expect(p).toContain('COALESCE(merchants.name, transactions.label)');
  });
});
