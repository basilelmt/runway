import { describe, expect, it } from 'vitest';
import { extractIbans, isValidIban } from './iban';

describe('isValidIban', () => {
  it('accepte un IBAN dont la somme de contrôle est juste', () => {
    expect(isValidIban('FR7630006000011234567890189')).toBe(true);
    expect(isValidIban('GB82WEST12345698765432')).toBe(true);
  });

  it('refuse une somme de contrôle fausse ou une longueur incorrecte', () => {
    expect(isValidIban('FR7630006000011234567890188')).toBe(false);
    expect(isValidIban('FR763000600001123456789018')).toBe(false);
  });
});

describe('extractIbans', () => {
  it('extrait un IBAN groupé par quatre, sans espaces', () => {
    expect(extractIbans('VIREMENT POUR M DUPONT FR76 3000 6000 0112 3456 7890 189 LOYER')).toEqual(['FR7630006000011234567890189']);
  });

  it('ignore un IBAN à la somme de contrôle fausse', () => {
    expect(extractIbans('VIREMENT FR76 3000 6000 0112 3456 7890 188')).toEqual([]);
  });

  it('ne prend pas une longue référence numérique pour un IBAN', () => {
    expect(extractIbans('VIREMENT REF 2026100412345678 LOYER')).toEqual([]);
    expect(extractIbans('VIR SEPA 0410 LOYER OCTOBRE')).toEqual([]);
  });

  it('trouve un IBAN précédé d\'une référence alphanumérique', () => {
    expect(extractIbans('VIREMENT REF123456 FR76 3000 6000 0112 3456 7890 189')).toEqual(['FR7630006000011234567890189']);
    expect(extractIbans('VIREMENT AB1234567890 FR76 3000 6000 0112 3456 7890 189')).toEqual(['FR7630006000011234567890189']);
  });

  it('trouve un IBAN au milieu du texte compacté', () => {
    expect(extractIbans('VIR SEPA vers gb82 west 1234 5698 7654 32 epargne')).toEqual(['GB82WEST12345698765432']);
  });
});
