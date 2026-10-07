import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { HoldingView } from '@shared/api-types';
import { HoldingList } from './HoldingList';

const base: HoldingView = {
  id: 1,
  platform: 'trade_republic',
  ticker: 'SXR8.DE',
  name: 'iShares Core S&P 500',
  source: 'manual',
  quantity: '5',
  costBasis: 3001_00,
  realized: 0,
  price: { eur: 720, date: '2026-10-07', stale: false },
  value: 3600_00,
  gain: 599_00,
  gainPct: 599 / 3001,
  dayChangePct: 0.012,
  unpricedQuantity: null,
  trades: [],
};

const btc: HoldingView = {
  ...base,
  id: 2,
  platform: 'binance',
  ticker: 'BTC-EUR',
  name: 'Bitcoin',
  source: 'binance',
  quantity: '0.04',
  value: 2800_00,
  gain: -200_00,
  gainPct: -0.0667,
  unpricedQuantity: '0.00002',
};

describe('HoldingList', () => {
  it('affiche valeur, plus-value, plateforme et quantité', () => {
    render(<HoldingList holdings={[base, btc]} onOpen={() => {}} />);
    expect(screen.getByText('iShares Core S&P 500')).toBeInTheDocument();
    expect(screen.getByText('3 600,00 €')).toBeInTheDocument();
    expect(screen.getByText('+599,00 €')).toBeInTheDocument();
    expect(screen.getByText('Trade Republic')).toBeInTheDocument();
    expect(screen.getByText('0,04 BTC')).toBeInTheDocument();
    expect(screen.getByText('0,00002 BTC sans prix d’achat')).toBeInTheDocument();
    expect(screen.getByText('-200,00 €')).toBeInTheDocument();
  });

  it('un clic ouvre le détail de la position', async () => {
    const onOpen = vi.fn();
    render(<HoldingList holdings={[base, btc]} onOpen={onOpen} />);
    await userEvent.click(screen.getByRole('button', { name: 'Voir le détail de Bitcoin' }));
    expect(onOpen).toHaveBeenCalledWith(2);
  });

  it('état vide', () => {
    render(<HoldingList holdings={[]} onOpen={() => {}} />);
    expect(screen.getByText('Aucune position')).toBeInTheDocument();
  });
});
