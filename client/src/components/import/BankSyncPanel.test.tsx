import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BankSyncState } from '@shared/api-types';
import { ToastProvider } from '@/components/ui';
import { BankSyncPanel } from './BankSyncPanel';

let state: BankSyncState;
const fetchMock = vi.fn();

beforeEach(() => {
  state = {
    configured: true,
    redirectUrl: 'https://localhost:3000/bank-sync/callback',
    syncStartByAccount: {},
    connections: [
      {
        id: 7,
        aspspName: 'La Banque Postale',
        status: 'active',
        validUntil: '2027-03-01T00:00:00.000Z',
        lastSyncAt: '2026-10-08T08:00:00.000Z',
        lastError: null,
        accounts: [{ id: 1, uid: 'u1', iban: null, bankName: 'Compte courant', accountId: 1, syncFrom: null, linkedAt: '2026-09-01', lastSyncedDate: '2026-10-07' }],
      },
    ],
  };
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === '/api/bank-sync' && !init?.method) return new Response(JSON.stringify(state), { status: 200 });
    if (url === '/api/bank-sync/connections/7' && init?.method === 'DELETE') {
      state = { ...state, connections: [] };
      return new Response(null, { status: 204 });
    }
    if (url.startsWith('/api/accounts')) return new Response(JSON.stringify([{ id: 1, name: 'Compte courant', archived: false }]), { status: 200 });
    return new Response('null', { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function renderPanel() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <BankSyncPanel />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('BankSyncPanel', () => {
  it('déconnecte la banque seulement après confirmation', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole('button', { name: 'Déconnecter' }));
    const dialog = screen.getByRole('dialog', { name: 'Déconnecter La Banque Postale ?' });
    expect(fetchMock).not.toHaveBeenCalledWith('/api/bank-sync/connections/7', expect.anything());

    await user.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/bank-sync/connections/7', expect.anything());

    await user.click(screen.getByRole('button', { name: 'Déconnecter' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Déconnecter' }));
    expect(fetchMock).toHaveBeenCalledWith('/api/bank-sync/connections/7', expect.objectContaining({ method: 'DELETE' }));
    expect(await screen.findByText('Banque déconnectée')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Connecter La Banque Postale/ })).toBeInTheDocument();
  });

  it('montre une erreur de chargement avec « Réessayer »', async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: 'Serveur injoignable' }), { status: 500 }));
    renderPanel();
    expect(await screen.findByText('Impossible de charger la synchronisation bancaire')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });
});
