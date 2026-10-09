import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { openIdea } from './idea-fixture';
import { IdeaDialog } from './IdeaDialog';

describe('IdeaDialog', () => {
  it('montre l’événement, les sources, la déduction et ce qui est déjà dans les prix', () => {
    render(<IdeaDialog idea={openIdea} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'La fête des nouilles fait vendre des baguettes' })).toBeInTheDocument();
    expect(screen.getByText(/La fête des nouilles a lieu le 20 octobre\./)).toBeInTheDocument();
    const source = screen.getByRole('link', { name: /exemple\.fr/ });
    expect(source).toHaveAttribute('href', 'https://www.exemple.fr/fete');
    expect(source).toHaveAttribute('target', '_blank');
    expect(source).toHaveAttribute('rel', 'noreferrer');
    expect(screen.getByRole('link', { name: /news\.exemple\.jp/ })).toHaveAttribute('href', 'https://news.exemple.jp/men');
    expect(screen.getByRole('list', { name: 'Déduction' }).querySelectorAll('li')).toHaveLength(3);
    expect(screen.getByText('Déjà dans les prix ?')).toBeInTheDocument();
    expect(screen.getByText(/En partie\./)).toBeInTheDocument();
  });

  it('montre le risque et ce que le cours avait déjà fait', () => {
    render(<IdeaDialog idea={{ ...openIdea, risk: 'La fête peut être annulée.', marketContext: { perf3m: 0.18, benchPerf3m: 0.04 } }} onClose={vi.fn()} />);
    expect(screen.getByText('Ce qui peut mal tourner')).toBeInTheDocument();
    expect(screen.getByText(/La fête peut être annulée\./)).toBeInTheDocument();
    expect(screen.getByText('Avant l’idée : +18,0 % sur 3 mois (S&P 500 +4,0 %)')).toBeInTheDocument();
  });

  it('une idée d’avant la critique n’a ni risque ni contexte de marché', () => {
    render(<IdeaDialog idea={openIdea} onClose={vi.fn()} />);
    expect(screen.queryByText('Ce qui peut mal tourner')).not.toBeInTheDocument();
    expect(screen.queryByText(/sur 3 mois/)).not.toBeInTheDocument();
  });

  it('reste fermé sans idée et se ferme avec le bouton', async () => {
    const onClose = vi.fn();
    const { rerender } = render(<IdeaDialog idea={null} onClose={onClose} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    rerender(<IdeaDialog idea={openIdea} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
