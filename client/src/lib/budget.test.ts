import { describe, expect, it } from 'vitest';
import type { WatchedEnvelope } from '@shared/api-types';
import { budgetNeedsAttention, budgetOverIncome, watchTodo } from './budget';

const month = { start: '2026-10-01', end: '2026-10-31', spent: 0, budget: 0, variable: { spent: 0, budget: 0, daily: [] }, saved: 0, toFund: 0, income: 0, planned: 0 };

describe('budgetOverIncome', () => {
  it('mesure le dépassement du revenu par les enveloppes', () => {
    expect(budgetOverIncome({ income: 2450_00, planned: 2871_00 })).toBe(421_00);
    expect(budgetOverIncome({ income: 2450_00, planned: 2000_00 })).toBe(0);
  });

  it('ne compare rien sans revenu récurrent connu', () => {
    expect(budgetOverIncome({ income: 0, planned: 2871_00 })).toBe(0);
  });
});

describe('budgetNeedsAttention', () => {
  it('signale un budget qui dépasse le revenu', () => {
    expect(budgetNeedsAttention({ toAllocate: 0, month: { ...month, income: 2450_00, planned: 2871_00 } })).toBe(true);
    expect(budgetNeedsAttention({ toAllocate: 0, month: { ...month, income: 2450_00, planned: 2450_00 } })).toBe(false);
  });
});

describe('watchTodo', () => {
  const watched = (kind: WatchedEnvelope['kind'], name: string, amount: number, envelopeId = 1): WatchedEnvelope => ({ envelopeId, name, kind, amount });

  it('rien quand aucune enveloppe n’est à surveiller', () => {
    expect(watchTodo([])).toBeNull();
  });

  it('une seule enveloppe dépassée : ton alerte', () => {
    expect(watchTodo([watched('over', 'Restos', 12_40)])).toEqual({ text: 'Restos dépassée de 12,40 €', tone: 'alert' });
  });

  it('une seule enveloppe presque vide : ton normal', () => {
    expect(watchTodo([watched('low', 'Abonnements', 3_05)])).toEqual({ text: 'Plus que 3,05 € dans Abonnements' });
  });

  it('une seule enveloppe sans rien de libre : texte dédié plutôt que « Plus que 0,00 € »', () => {
    expect(watchTodo([watched('low', 'Abonnements', 0)])).toEqual({ text: 'Plus rien de libre dans Abonnements' });
  });

  it('plusieurs : le nombre et les noms, en alerte si l’une est dépassée', () => {
    expect(watchTodo([watched('over', 'Restos', 12_40, 1), watched('low', 'Sorties', 1_00, 2), watched('low', 'Abonnements', 3_05, 3)])).toEqual({
      text: '3 enveloppes à surveiller',
      detail: 'Restos, Sorties, Abonnements',
      tone: 'alert',
    });
    expect(watchTodo([watched('low', 'Sorties', 1_00, 2), watched('low', 'Abonnements', 3_05, 3)])).toEqual({ text: '2 enveloppes à surveiller', detail: 'Sorties, Abonnements' });
  });
});
