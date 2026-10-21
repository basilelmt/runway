import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { openIdea as open } from './idea-fixture';
import { IdeaCard } from './IdeaCard';

describe('IdeaCard', () => {
  it('résume l’idée : titre, horizon, actif et performances', () => {
    render(<IdeaCard idea={open} onOpen={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'La fête des nouilles fait vendre des baguettes' })).toBeInTheDocument();
    expect(screen.getByText('D’ici le 28 oct.')).toBeInTheDocument();
    expect(screen.getByText('Baguettes SA')).toBeInTheDocument();
    expect(screen.getByText('BAG.PA')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Sur Trade Republic' })).toBeInTheDocument();
    expect(screen.getByText('+8,3 %')).toBeInTheDocument();
    expect(screen.getByText('+1,0 %')).toBeInTheDocument();
  });

  it('garde le raisonnement pour le dialogue', () => {
    render(<IdeaCard idea={{ ...open, risk: 'La fête peut être annulée.' }} onOpen={vi.fn()} />);
    expect(screen.queryByRole('list', { name: 'Déduction' })).not.toBeInTheDocument();
    expect(screen.queryByText(/La fête des nouilles a lieu/)).not.toBeInTheDocument();
    expect(screen.queryByText('Déjà dans les prix ?')).not.toBeInTheDocument();
    expect(screen.queryByText('Ce qui peut mal tourner')).not.toBeInTheDocument();
  });

  it('s’ouvre au clic', async () => {
    const onOpen = vi.fn();
    render(<IdeaCard idea={open} onOpen={onOpen} />);
    await userEvent.click(screen.getByRole('button', { name: 'Voir le raisonnement : La fête des nouilles fait vendre des baguettes' }));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('une idée close affiche son verdict', () => {
    const { rerender } = render(<IdeaCard idea={{ ...open, status: 'closed', return: 0.25, benchReturn: 0.05 }} onOpen={vi.fn()} />);
    expect(screen.getByText('A battu le S&P 500')).toBeInTheDocument();
    expect(screen.getByText('Close le 28 oct.')).toBeInTheDocument();
    rerender(<IdeaCard idea={{ ...open, status: 'closed', return: -0.1, benchReturn: 0.05 }} onOpen={vi.fn()} />);
    expect(screen.getByText('N’a pas battu le S&P 500')).toBeInTheDocument();
  });
});
