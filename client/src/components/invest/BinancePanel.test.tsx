import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { BinanceState } from '@shared/api-types';
import { ToastProvider } from '@/components/ui';
import { BinancePanel } from './BinancePanel';

function renderPanel(state: BinanceState) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <BinancePanel state={state} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('BinancePanel', () => {
  it('invite à relier Binance', () => {
    renderPanel({ configured: false, apiKeyHint: null, lastSyncAt: null, lastError: null });
    expect(screen.getByRole('button', { name: 'Relier Binance' })).toBeInTheDocument();
  });

  it('affiche la dernière erreur avec « Réessayer »', () => {
    renderPanel({ configured: true, apiKeyHint: 'abcd', lastSyncAt: '2026-10-07T08:00:00Z', lastError: 'Binance : clé API refusée (révoquée ou IP non autorisée)' });
    expect(screen.getByRole('alert')).toHaveTextContent('Binance : clé API refusée');
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
    expect(screen.getByText('…abcd')).toBeInTheDocument();
  });

  it('demande confirmation avant de déconnecter', async () => {
    renderPanel({ configured: true, apiKeyHint: 'abcd', lastSyncAt: '2026-10-07T08:00:00Z', lastError: null });
    await userEvent.click(screen.getByRole('button', { name: 'Déconnecter' }));
    const dialog = screen.getByRole('dialog', { name: 'Déconnecter Binance ?', hidden: true });
    expect(dialog).toHaveTextContent('Les positions Binance seront retirées de Runway.');
    expect(within(dialog).getByRole('button', { name: 'Déconnecter', hidden: true })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Annuler', hidden: true }));
    expect(screen.queryByRole('dialog', { name: 'Déconnecter Binance ?', hidden: true })).not.toBeInTheDocument();
  });
});
