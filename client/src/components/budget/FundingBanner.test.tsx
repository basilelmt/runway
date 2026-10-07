import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FundingView } from '@shared/api-types';
import { ToastProvider } from '@/components/ui';
import { FundingBanner } from './FundingBanner';

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetchMock);
});

const funding: FundingView = { id: 7, month: '2026-10', total: 2340_00, envelopeCount: 8, shortfallCount: 0, sourceLabel: 'VIR SALAIRE' };

function renderBanner(over: Partial<FundingView> = {}, budgetLink = false) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter>
          <FundingBanner funding={{ ...funding, ...over }} budgetLink={budgetLink} />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('FundingBanner', () => {
  it('annonce le total, les enveloppes et le mois', () => {
    renderBanner();
    expect(screen.getByRole('group', { name: 'Répartition du salaire' })).toHaveTextContent(/Salaire réparti : 2\s340,00\s€ dans 8 enveloppes pour octobre 2026/);
    expect(screen.queryByText(/incomplète/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Voir le budget' })).not.toBeInTheDocument();
  });

  it('signale les enveloppes incomplètes et propose le budget sur l’accueil', () => {
    renderBanner({ shortfallCount: 2 }, true);
    expect(screen.getByText(/2 enveloppes incomplètes faute d’argent/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voir le budget' })).toHaveAttribute('href', '/budget');
  });

  it('annule la répartition', async () => {
    renderBanner();
    await userEvent.click(screen.getByRole('button', { name: 'Annuler la répartition' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/fundings/7/undo', expect.objectContaining({ method: 'POST' })));
    expect(await screen.findByText('Répartition annulée')).toBeInTheDocument();
  });

  it('se ferme', async () => {
    renderBanner();
    await userEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/fundings/7/dismiss', expect.objectContaining({ method: 'POST' })));
  });
});
