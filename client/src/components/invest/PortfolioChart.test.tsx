import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { HoldingView } from '@shared/api-types';
import { PortfolioChart } from './PortfolioChart';

const holding = (id: number, name: string, quantity = '1'): HoldingView => ({
  id,
  platform: 'trade_republic',
  ticker: name,
  name,
  source: 'manual',
  quantity,
  costBasis: 100_00,
  realized: 0,
  price: null,
  value: null,
  gain: null,
  gainPct: null,
  dayChangePct: null,
  unpricedQuantity: null,
  missingQuantity: null,
  trades: [],
  series: [],
});

const props = { series: [], range: '6m' as const, onRange: () => {} };

describe('PortfolioChart', () => {
  it('propose de tracer une seule position, parmi celles encore détenues', async () => {
    render(<PortfolioChart {...props} holdings={[holding(1, 'S&P 500'), holding(2, 'Bitcoin'), holding(3, 'Vendue', '0')]} />);
    const pick = screen.getByRole('combobox', { name: 'Position à tracer' });
    expect([...pick.querySelectorAll('option')].map((o) => o.textContent)).toEqual(['Tout le portefeuille', 'S&P 500', 'Bitcoin']);
    await userEvent.selectOptions(pick, 'Bitcoin');
    expect(pick).toHaveValue('2');
    await userEvent.click(screen.getByRole('button', { name: 'Effacer le filtre Position à tracer' }));
    expect(pick).toHaveValue('all');
  });

  it('pas de choix avec une seule position', () => {
    render(<PortfolioChart {...props} holdings={[holding(1, 'S&P 500'), holding(2, 'Vendue', '0')]} />);
    expect(screen.queryByRole('combobox', { name: 'Position à tracer' })).not.toBeInTheDocument();
  });
});
