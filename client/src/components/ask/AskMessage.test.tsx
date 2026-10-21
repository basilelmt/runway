import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AskAnswerEvent } from '@shared/api-types';
import type { AskTurn } from './ask-context';
import { AskMessage } from './AskMessage';

const answer = (overrides: Partial<AskAnswerEvent> = {}): AskAnswerEvent => ({
  sessionId: 's',
  answer: 'Tu as dépensé 20 €.',
  highlight: null,
  chart: null,
  actions: [],
  notices: [],
  ...overrides,
});

const turnDone = (a: AskAnswerEvent): AskTurn => ({ id: 1, question: 'Combien ?', refs: [], page: null, status: 'done', step: null, sources: [], answer: a, error: null });

describe('AskMessage', () => {
  it('affiche le motif d’une action refusée sous la réponse', () => {
    render(<AskMessage turn={turnDone(answer({ notices: ['Le budget de Courses ne peut pas descendre sous ses charges fixes (40,00 €)'] }))} onRetry={vi.fn()} />);
    expect(screen.getByText('Le budget de Courses ne peut pas descendre sous ses charges fixes (40,00 €)')).toBeInTheDocument();
  });

  it('n’affiche rien quand il n’y a aucun motif', () => {
    render(<AskMessage turn={turnDone(answer())} onRetry={vi.fn()} />);
    expect(screen.queryByText(/charges fixes/)).not.toBeInTheDocument();
  });
});
