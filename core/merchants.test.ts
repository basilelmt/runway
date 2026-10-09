import { describe, expect, it } from 'vitest';
import {
  MERCHANT_NOISE,
  MERCHANT_PREFIXES,
  PAYMENT_INTERMEDIARIES,
  merchantDisplayName,
  merchantFallbackName,
  merchantKey,
  merchantKeyFor,
} from './merchants';

describe('merchantKey', () => {
  it.each([
    ['ACHAT CB CARREFOUR EXPR 03.10.26 CARTE NUMERO 089', 'CARREFOUR EXPR'],
    ['ACHAT CB SUMUP *OCCHIO APPLE PAY', 'OCCHIO'],
    ['ACHAT CB PAYPAL *BOLT.E', 'BOLT.E'],
    ['ACHAT CB MONOP4801', 'MONOP'],
    ['ACHAT CB UBER 03.10.26 EUR 26,30 CARTE NO 089', 'UBER'],
    ['PRELEVEMENT DE MAIF 79038 NIORT EX REF : 0001112223334A ECHEANCE OCTOBRE 2026', 'MAIF 79038 NIORT'],
    ['VIREMENT PERMANENT POUR LEO LE COLOC CHARGES APPARTEMENT', 'LEO LE COLOC CHARGES APPARTEMENT'],
  ])('exemple de la spec : %s', (label, key) => {
    expect(merchantKey(label)).toBe(key);
  });

  it('normalise : majuscules, sans accents, espaces compactés', () => {
    expect(merchantKey('achat cb  Boulangerie   Élise')).toBe('BOULANGERIE ELISE');
  });

  it('la clé est inchangée que le libellé stocké ait des espaces multiples ou compactés', () => {
    const noisy = 'ACHAT CB CARREFOUR EXPR 03.10.26 CARTE NUMERO                089';
    const compact = 'ACHAT CB CARREFOUR EXPR 03.10.26 CARTE NUMERO 089';
    expect(merchantKey(noisy)).toBe(merchantKey(compact));
  });

  it.each(MERCHANT_PREFIXES)('retire le préfixe « %s »', (prefix) => {
    expect(merchantKey(`${prefix} BOUTIQUE DU COIN`)).toBe('BOUTIQUE DU COIN');
  });

  it('préfère le préfixe le plus long', () => {
    expect(merchantKey('VIREMENT INSTANTANE WERO A LEO R')).toBe('LEO R');
  });

  it.each(PAYMENT_INTERMEDIARIES)('retire l’intermédiaire de paiement « %s »', (name) => {
    expect(merchantKey(`ACHAT CB ${name} *CAFE DU PORT`)).toBe('CAFE DU PORT');
    expect(merchantKey(`ACHAT CB ${name}*CAFE DU PORT`)).toBe('CAFE DU PORT');
  });

  const noiseCases: Record<string, [string, string]> = {
    'référence': ['PRELEVEMENT DE ASSURANCE HABITAT REF : AB-123 ECHEANCE', 'ASSURANCE HABITAT'],
    'Apple Pay': ['ACHAT CB CAFE DU PORT APPLE PAY', 'CAFE DU PORT'],
    'numéro de carte': ['ACHAT CB CAFE DU PORT CARTE NUMERO 123', 'CAFE DU PORT'],
    'carte masquée': ['CARTE X1234 CAFE DU PORT', 'CAFE DU PORT'],
    'montant en devise': ['ACHAT CB CAFE DU PORT CHF 4,50', 'CAFE DU PORT'],
    'montant': ['COTISATION FORMULE DE COMPTE 14,55 €', 'COTISATION FORMULE DE COMPTE'],
    'date': ['ACHAT CB CAFE DU PORT 03/10/2026', 'CAFE DU PORT'],
    'date espacée': ['REJET DE VIREMENT DU 06 10 2025 POUR LEO R', 'REJET DE VIREMENT DU POUR LEO R'],
    'mois': ['PRELEVEMENT DE ASSURANCE HABITAT ECHEANCE SEPTEMBRE2026', 'ASSURANCE HABITAT ECHEANCE'],
    'mois numérique': ['FRAIS DU MOIS DE 08/2026', 'FRAIS DU MOIS DE'],
    'date courte': ['ACHAT CB CAFE DU PORT 11/03', 'CAFE DU PORT'],
    'chiffres collés': ['ACHAT CB MAGASIN4801', 'MAGASIN'],
  };

  it.each(MERCHANT_NOISE.map((n) => n.name))('retire le bruit « %s »', (name) => {
    const testCase = noiseCases[name];
    expect(testCase, `cas de test manquant pour « ${name} »`).toBeDefined();
    expect(merchantKey(testCase![0])).toBe(testCase![1]);
  });

  it('coupe à la première référence longue après le premier mot', () => {
    expect(merchantKey('VIREMENT DE CLUB DE SPORT AB12CD34EF 03/2026 LEOR')).toBe('CLUB DE SPORT');
    expect(merchantKey('ACHAT CB BOUTIQUE_123456')).toBe('BOUTIQUE_123456');
    expect(merchantKey('PRELEVEMENT DE MUTUELLE 79038 PARIS')).toBe('MUTUELLE 79038 PARIS');
  });

  it('retire la ponctuation de bord', () => {
    expect(merchantKey('ACHAT CB - CAFE DU PORT -')).toBe('CAFE DU PORT');
  });

  it('libellé de saisie manuelle', () => {
    expect(merchantKey('Boulangerie')).toBe('BOULANGERIE');
    expect(merchantKey('Café de Léa')).toBe('CAFE DE LEA');
  });

  it.each(['', '   ', 'ACHAT CB', 'ACHAT CB 03.10.26 APPLE PAY'])('un libellé vide après nettoyage donne null : « %s »', (label) => {
    expect(merchantKey(label)).toBeNull();
  });
});

describe('merchantKeyFor', () => {
  it('dépenses et revenus seulement', () => {
    expect(merchantKeyFor('expense', 'ACHAT CB MONOP4801')).toBe('MONOP');
    expect(merchantKeyFor('income', 'VIREMENT DE CLUB DE SPORT')).toBe('CLUB DE SPORT');
    expect(merchantKeyFor('transfer', 'ACHAT CB MONOP4801')).toBeNull();
    expect(merchantKeyFor('allocation', 'Budget')).toBeNull();
  });
});

describe('merchantFallbackName', () => {
  it.each([
    ['CARREFOUR EXPR', 'ACHAT CB CARREFOUR EXPR', 'Carrefour Expr'],
    ['LE PAIN DE LA', 'ACHAT CB LE PAIN DE LA', 'Le Pain de la'],
    ["L'EMBARCADERE", "ACHAT CB L'EMBARCADERE", 'L’Embarcadere'],
    ["MC DONALD'S", "ACHAT CB MC DONALD'S", 'Mc Donald’s'],
    ['SNCF-VOYAGEURS', 'ACHAT CB SNCF-VOYAGEURS', 'Sncf-Voyageurs'],
    ['BOLT.E', 'ACHAT CB PAYPAL *BOLT.E', 'Bolt.e'],
    ['LEO LE COLOC', 'VIREMENT DE LEO LE COLOC', 'Leo le Coloc'],
    ['APPLE.COM/BILL', 'ACHAT CB APPLE.COM/BILL', 'Apple.com/Bill'],
  ])('%s devient %s (préfixe bancaire connu : casse de titre de la clé)', (key, label, name) => {
    expect(merchantFallbackName(key, label)).toBe(name);
  });

  it('libellé saisi à la main avec minuscules et sans préfixe bancaire : gardé tel quel, accents compris', () => {
    expect(merchantFallbackName('CAFE DE LEA', 'Café de Léa')).toBe('Café de Léa');
  });

  it('espaces compactés dans le libellé gardé tel quel', () => {
    expect(merchantFallbackName('CAFE DE LEA', '  Café   de  Léa  ')).toBe('Café de Léa');
  });

  it('préfixe bancaire connu malgré les minuscules : casse de titre de la clé, pas le libellé', () => {
    expect(merchantFallbackName('UNIQLO', 'ACHAT CB Uniqlo')).toBe('Uniqlo');
  });

  it('libellé tout en majuscules sans minuscule : casse de titre de la clé', () => {
    expect(merchantFallbackName('BOULANGERIE', 'BOULANGERIE')).toBe('Boulangerie');
  });
});

describe('merchantDisplayName', () => {
  it('nom donné, sinon repli, null sans clé', () => {
    expect(merchantDisplayName(null, 'Monoprix', null)).toBeNull();
    expect(merchantDisplayName('CARREFOUR EXPR', null, 'ACHAT CB CARREFOUR EXPR')).toBe('Carrefour Expr');
    expect(merchantDisplayName('CARREFOUR EXPR', 'Carrefour Express', 'ACHAT CB CARREFOUR EXPR')).toBe('Carrefour Express');
  });

  it('repli à partir du libellé de saisie manuelle quand aucun nom n’est encore donné', () => {
    expect(merchantDisplayName('CAFE DE LEA', null, 'Café de Léa')).toBe('Café de Léa');
    expect(merchantDisplayName('UNIQLO', null, 'ACHAT CB Uniqlo')).toBe('Uniqlo');
  });
});
