import { describe, expect, it } from 'vitest';
import { matchAdvanceSuggestions } from './advances';

describe('matchAdvanceSuggestions', () => {
  it('propose quand le libellé et le nom partagent un mot, et que le montant correspond à une avance ouverte', () => {
    const suggestions = matchAdvanceSuggestions(
      [{ id: 1, label: 'VIREMENT INSTANTANE WERO DE MAX CEKANOWSKI', amount: 41_50, date: '2026-07-28' }],
      [{ id: 10, person: 'Max', amount: 41_50 }],
      '2026-07-30',
    );
    expect(suggestions).toEqual([{ incomeId: 1, person: 'Max', advanceIds: [10], amount: 41_50 }]);
  });

  it('propose la somme de plusieurs avances ouvertes de la même personne', () => {
    const suggestions = matchAdvanceSuggestions(
      [{ id: 1, label: 'WERO DE MAX', amount: 60_00, date: '2026-07-28' }],
      [
        { id: 10, person: 'Max', amount: 41_50 },
        { id: 11, person: 'Max', amount: 18_50 },
      ],
      '2026-07-30',
    );
    expect(suggestions).toEqual([{ incomeId: 1, person: 'Max', advanceIds: [10, 11], amount: 60_00 }]);
  });

  it('ne propose rien sans mot en commun, sans montant exact, ou trop longtemps après', () => {
    const advances = [{ id: 10, person: 'Max', amount: 41_50 }];
    // Aucun mot en commun.
    expect(matchAdvanceSuggestions([{ id: 1, label: 'VIREMENT SNCF', amount: 41_50, date: '2026-07-28' }], advances, '2026-07-30')).toEqual([]);
    // Montant différent.
    expect(matchAdvanceSuggestions([{ id: 1, label: 'WERO DE MAX', amount: 10_00, date: '2026-07-28' }], advances, '2026-07-30')).toEqual([]);
    // Plus de 60 jours.
    expect(matchAdvanceSuggestions([{ id: 1, label: 'WERO DE MAX', amount: 41_50, date: '2026-05-01' }], advances, '2026-07-30')).toEqual([]);
  });

  it('un mot de 2 lettres ou moins ne compte pas comme mot en commun', () => {
    // "Al" (2 lettres) seul en commun avec le libellé ne suffit pas.
    expect(matchAdvanceSuggestions([{ id: 1, label: 'VIR DE AL', amount: 41_50, date: '2026-07-28' }], [{ id: 10, person: 'Al', amount: 41_50 }], '2026-07-30')).toEqual([]);
  });
});
