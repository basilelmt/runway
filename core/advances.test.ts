import { describe, expect, it } from 'vitest';
import { matchAdvanceSuggestions } from './advances';

describe('matchAdvanceSuggestions', () => {
  it('propose quand le libellé et le nom partagent un mot, et que le montant correspond à une avance ouverte', () => {
    const suggestions = matchAdvanceSuggestions(
      [{ id: 1, label: 'VIREMENT INSTANTANE WERO DE MAX CEKANOWSKI', amount: 41_50, date: '2026-07-28' }],
      [{ id: 10, person: 'Max', amount: 41_50, expenseDate: '2026-07-26' }],
    );
    expect(suggestions).toEqual([{ incomeId: 1, person: 'Max', advanceIds: [10], amount: 41_50 }]);
  });

  it('propose la somme de plusieurs avances ouvertes de la même personne', () => {
    const suggestions = matchAdvanceSuggestions(
      [{ id: 1, label: 'WERO DE MAX', amount: 60_00, date: '2026-07-28' }],
      [
        { id: 10, person: 'Max', amount: 41_50, expenseDate: '2026-07-26' },
        { id: 11, person: 'Max', amount: 18_50, expenseDate: '2026-07-26' },
      ],
    );
    expect(suggestions).toEqual([{ incomeId: 1, person: 'Max', advanceIds: [10, 11], amount: 60_00 }]);
  });

  it('cas réel : une dépense vieille de plus de 60 jours reste proposée si le remboursement est le même jour', () => {
    // Aujourd'hui (hors de matchAdvanceSuggestions, qui ne connaît pas la date du jour) est bien après les deux.
    const suggestions = matchAdvanceSuggestions(
      [{ id: 1, label: 'VIREMENT INSTANTANE WERO DE MAX CEKANOWSKI bowling', amount: 41_50, date: '2026-07-27' }],
      [{ id: 10, person: 'Max', amount: 41_50, expenseDate: '2026-07-27' }],
    );
    expect(suggestions).toEqual([{ incomeId: 1, person: 'Max', advanceIds: [10], amount: 41_50 }]);
  });

  it('la fenêtre est relative à la dépense : quelques jours avant, jusqu’à 60 jours après', () => {
    const advance = { id: 10, person: 'Max', amount: 41_50, expenseDate: '2026-07-27' };
    // 7 jours avant : encore proposé.
    expect(matchAdvanceSuggestions([{ id: 1, label: 'WERO DE MAX', amount: 41_50, date: '2026-07-20' }], [advance])).toHaveLength(1);
    // 8 jours avant : plus proposé.
    expect(matchAdvanceSuggestions([{ id: 1, label: 'WERO DE MAX', amount: 41_50, date: '2026-07-19' }], [advance])).toEqual([]);
    // 60 jours après : encore proposé.
    expect(matchAdvanceSuggestions([{ id: 1, label: 'WERO DE MAX', amount: 41_50, date: '2026-09-25' }], [advance])).toHaveLength(1);
    // 61 jours après : plus proposé.
    expect(matchAdvanceSuggestions([{ id: 1, label: 'WERO DE MAX', amount: 41_50, date: '2026-09-26' }], [advance])).toEqual([]);
  });

  it('ne propose rien sans mot en commun ou sans montant exact', () => {
    const advances = [{ id: 10, person: 'Max', amount: 41_50, expenseDate: '2026-07-26' }];
    // Aucun mot en commun.
    expect(matchAdvanceSuggestions([{ id: 1, label: 'VIREMENT SNCF', amount: 41_50, date: '2026-07-28' }], advances)).toEqual([]);
    // Montant différent.
    expect(matchAdvanceSuggestions([{ id: 1, label: 'WERO DE MAX', amount: 10_00, date: '2026-07-28' }], advances)).toEqual([]);
  });

  it('un mot de 2 lettres ou moins ne compte pas comme mot en commun', () => {
    // "Al" (2 lettres) seul en commun avec le libellé ne suffit pas.
    expect(
      matchAdvanceSuggestions([{ id: 1, label: 'VIR DE AL', amount: 41_50, date: '2026-07-28' }], [{ id: 10, person: 'Al', amount: 41_50, expenseDate: '2026-07-26' }]),
    ).toEqual([]);
  });
});
