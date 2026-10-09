import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui';
import { AccountsSettings } from './Accounts';

const courant = { id: 1, name: 'Compte courant', onBudget: true, archived: false, bankAccountNumber: null, initialBalance: 0, balance: 123_45, lastImport: null };
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === '/api/overview') return new Response(JSON.stringify({ accounts: [courant], netWorth: courant.balance }), { status: 200 });
    if (url === '/api/accounts/1' && init?.method === 'PATCH') return new Response(JSON.stringify({ ...courant, archived: true }), { status: 200 });
    if (url.startsWith('/api/accounts')) return new Response(JSON.stringify([courant]), { status: 200 });
    return new Response('null', { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('AccountsSettings', () => {
  it('archive un compte depuis le menu ⋯, après confirmation', async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ToastProvider>
          <AccountsSettings />
        </ToastProvider>
      </QueryClientProvider>,
    );
    await user.click(await screen.findByRole('button', { name: 'Actions pour Compte courant' }));
    await user.click(screen.getByRole('menuitem', { name: 'Archiver' }));
    const dialog = screen.getByRole('dialog', { name: 'Archiver ce compte ?' });
    expect(within(dialog).getByText('Compte courant')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/accounts/1', expect.anything());
    await user.click(within(dialog).getByRole('button', { name: 'Archiver' }));
    expect(fetchMock).toHaveBeenCalledWith('/api/accounts/1', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ archived: true }) }));
    expect(await screen.findByText('Compte archivé')).toBeInTheDocument();
  });
});
