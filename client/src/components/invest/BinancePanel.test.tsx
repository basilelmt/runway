import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
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
});
