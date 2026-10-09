import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MerchantStatus } from '@shared/api-types';
import { ToastProvider } from '@/components/ui';
import { MerchantSettings } from './MerchantSettings';

let status: MerchantStatus;
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  status = { total: 412, named: 398, running: false, lastError: 'Claude Code n’est pas connecté : lance « claude » dans un terminal puis /login' };
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/merchants/name' && init?.method === 'POST') status = { ...status, running: true, lastError: null };
    return new Response(JSON.stringify(status), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
});

describe('MerchantSettings', () => {
  it('résume les marchands, montre la dernière erreur et lance le nommage', async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ToastProvider>
          <MerchantSettings />
        </ToastProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('412 marchands, 398 nommés')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Claude Code n’est pas connecté');

    await user.click(screen.getByRole('button', { name: 'Nommer avec Claude' }));
    expect(fetchMock).toHaveBeenCalledWith('/api/merchants/name', expect.objectContaining({ method: 'POST' }));
    expect(await screen.findByText('Claude nomme les nouveaux marchands…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nommer avec Claude' })).toBeDisabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
