import { describe, expect, it } from 'vitest';
import type { AskRef } from '@shared/schemas';
import { buildAskContext } from '../src/ask/context';

const ref = (over: Partial<AskRef> = {}): AskRef => ({ kind: 'section', id: null, label: 'Idées en cours', snapshot: '', ...over });

describe('buildAskContext', () => {
  it('renvoie la question seule sans page ni refs', () => {
    expect(buildAskContext(null, [], 'Combien ai-je dépensé ?')).toBe('Combien ai-je dépensé ?');
  });

  it('ajoute le contexte d’écran seul, sans bloc', () => {
    expect(buildAskContext('Investir', [], 'Et le S&P 500 ?')).toBe('[Contexte : écran Investir]\n[Question]\nEt le S&P 500 ?');
  });

  it('numérote un bloc avec id et conserve son snapshot', () => {
    const context = buildAskContext(
      'Investir',
      [
        ref({ label: 'Idées en cours', snapshot: 'Ensemble, les 5 idées en cours font -4,0 %…' }),
        ref({ kind: 'holding', id: 12, label: 'Ligne NVDA', snapshot: 'NVIDIA · Trade Republic · 1 240,00 € · -18,2 %' }),
      ],
      "c'est faux non ? je perds beaucoup plus",
    );
    expect(context).toBe(
      [
        '[Contexte : écran Investir]',
        '[Bloc désigné : Idées en cours (section)]',
        'Ensemble, les 5 idées en cours font -4,0 %…',
        '[Bloc désigné : Ligne NVDA (holding 12)]',
        'NVIDIA · Trade Republic · 1 240,00 € · -18,2 %',
        '[Question]',
        "c'est faux non ? je perds beaucoup plus",
      ].join('\n'),
    );
  });

  it('omet la ligne de snapshot vide', () => {
    const context = buildAskContext(null, [ref({ kind: 'envelope', id: 4, label: 'Courses' })], 'Pourquoi ce dépassement ?');
    expect(context).toBe('[Bloc désigné : Courses (envelope 4)]\n[Question]\nPourquoi ce dépassement ?');
  });

  it('conserve plusieurs refs dans l’ordre et les sauts de ligne du snapshot', () => {
    const context = buildAskContext(
      null,
      [ref({ kind: 'account', id: 1, label: 'Courant', snapshot: 'Courant\n1 234,56 €' }), ref({ kind: 'transaction', id: 9, label: 'Op du 3' })],
      'Détail ?',
    );
    expect(context).toBe('[Bloc désigné : Courant (account 1)]\nCourant\n1 234,56 €\n[Bloc désigné : Op du 3 (transaction 9)]\n[Question]\nDétail ?');
  });
});
