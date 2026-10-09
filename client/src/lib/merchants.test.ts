import { describe, expect, it } from 'vitest';
import { displayLabel } from './merchants';

describe('displayLabel', () => {
  it('nom du marchand, sinon libellé', () => {
    expect(displayLabel({ label: 'ACHAT CB MONOP4801', merchantName: 'Monoprix' })).toBe('Monoprix');
    expect(displayLabel({ label: 'Virement Courant → Livret', merchantName: null })).toBe('Virement Courant → Livret');
  });
});
