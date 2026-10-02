import { describe, expect, it } from 'vitest';
import { fingerprint } from './fingerprint';
import { applySortingRules, normalizeLabel, suggestPattern } from './sorting';

describe('normalizeLabel', () => {
  it('minuscules, sans accents, espaces compactés', () => {
    expect(normalizeLabel('  CB  CARREFOUR   Élise ')).toBe('cb carrefour elise');
  });
});

describe('applySortingRules', () => {
  const rules = [
    { id: 1, pattern: 'carrefour', envelopeId: 10, priority: 1 },
    { id: 2, pattern: 'carrefour market', envelopeId: 11, priority: 0 },
    { id: 3, pattern: 'élise', envelopeId: 12, priority: 2 },
  ];

  it('la priorité la plus basse gagne', () => {
    expect(applySortingRules('CB CARREFOUR MARKET 12/03', rules)).toBe(11);
    expect(applySortingRules('CB CARREFOUR CITY', rules)).toBe(10);
  });

  it('ignore les accents dans le motif et le libellé', () => {
    expect(applySortingRules('Boulangerie Elise', rules)).toBe(12);
  });

  it('renvoie null sans correspondance', () => {
    expect(applySortingRules('VIR SALAIRE', rules)).toBeNull();
  });
});

describe('suggestPattern', () => {
  it('retire les préfixes bancaires, dates et numéros', () => {
    expect(suggestPattern('CB CARREFOUR MARKET 12/03/26')).toBe('CARREFOUR MARKET');
    expect(suggestPattern('PRLV SEPA EDF CLIENTS 1234567')).toBe('EDF CLIENTS');
    expect(suggestPattern('VIR SEPA DE M. DUPONT')).toBe('DUPONT');
    expect(suggestPattern('CARTE X1234 11/03 CAFE DU COIN')).toBe('CAFE DU COIN');
  });

  it('garde le libellé si rien ne reste', () => {
    expect(suggestPattern('CB 123')).toBe('CB 123');
  });
});

describe('fingerprint', () => {
  it('est stable et sensible à l’occurrence', () => {
    const a = fingerprint(1, '2026-03-12', -6230, 'CB CARREFOUR', 0);
    expect(a).toBe(fingerprint(1, '2026-03-12', -6230, 'CB CARREFOUR', 0));
    expect(a).not.toBe(fingerprint(1, '2026-03-12', -6230, 'CB CARREFOUR', 1));
    expect(a).toMatch(/^[0-9a-f]{40}$/);
  });
});
