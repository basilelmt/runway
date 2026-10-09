import { describe, expect, it } from 'vitest';
import { fingerprint } from './fingerprint';

describe('fingerprint', () => {
  it('est identique entre un libellé avec des espaces multiples et sa version compactée', () => {
    const noisy = 'ACHAT CB CARREFOUR EXPR 03.10.26 CARTE NUMERO                089';
    const compact = 'ACHAT CB CARREFOUR EXPR 03.10.26 CARTE NUMERO 089';
    expect(fingerprint(1, '2026-10-03', -4556, noisy, 0)).toBe(fingerprint(1, '2026-10-03', -4556, compact, 0));
  });
});
