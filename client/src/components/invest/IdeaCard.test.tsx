import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { IdeaView } from '@shared/api-types';
import { IdeaCard } from './IdeaCard';

const open: IdeaView = {
  id: 1,
  createdOn: '2026-10-07',
  title: 'La fête des nouilles fait vendre des baguettes',
  event: 'La fête des nouilles a lieu le 20 octobre.',
  sourceUrl: 'https://www.exemple.fr/fete',
  reasoning: ['La fête des nouilles approche', 'Les gens vont acheter des baguettes', 'Le fabricant de baguettes va vendre plus'],
  pricedIn: 'En partie.',
  ticker: 'BAG.PA',
  assetName: 'Baguettes SA',
  whereToBuy: 'trade_republic',
  horizon: '2026-10-28',
  startPriceEur: 12,
  status: 'open',
  return: 0.083,
  benchReturn: 0.01,
  priceDate: '2026-10-10',
};

describe('IdeaCard', () => {
  it('montre la déduction, la source et les performances', () => {
    render(<IdeaCard idea={open} />);
    expect(screen.getByRole('list', { name: 'Déduction' }).querySelectorAll('li')).toHaveLength(3);
    expect(screen.getByRole('link', { name: /exemple\.fr/ })).toHaveAttribute('href', 'https://www.exemple.fr/fete');
    expect(screen.getByText('+8,3 %')).toBeInTheDocument();
    expect(screen.getByText('+1,0 %')).toBeInTheDocument();
    expect(screen.getByText('Sur Trade Republic')).toBeInTheDocument();
    expect(screen.queryByText(/battu/)).not.toBeInTheDocument();
  });

  it('une idée close affiche son verdict', () => {
    const { rerender } = render(<IdeaCard idea={{ ...open, status: 'closed', return: 0.25, benchReturn: 0.05 }} />);
    expect(screen.getByText('A battu le S&P 500')).toBeInTheDocument();
    rerender(<IdeaCard idea={{ ...open, status: 'closed', return: -0.1, benchReturn: 0.05 }} />);
    expect(screen.getByText('N’a pas battu le S&P 500')).toBeInTheDocument();
  });
});
