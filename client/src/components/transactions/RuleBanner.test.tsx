import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui';
import { RuleBanner } from './RuleBanner';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}'));
    return new Response(JSON.stringify({ id: 1, priority: 0, ...body }), { status: 201 });
  });
  vi.stubGlobal('fetch', fetchMock);
});

function renderBanner(onDone = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <RuleBanner label="CB CARREFOUR MARKET 12/03/26" envelopeId={10} envelopeName="Courses" onDone={onDone} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return onDone;
}

describe('RuleBanner', () => {
  it('propose un motif nettoyé du préfixe bancaire et de la date', () => {
    renderBanner();
    expect(screen.getByLabelText('Motif de la règle')).toHaveValue('CARREFOUR MARKET');
    expect(screen.getByText('Courses')).toBeInTheDocument();
  });

  it('crée la règle avec le motif édité puis se ferme', async () => {
    const onDone = renderBanner();
    const input = screen.getByLabelText('Motif de la règle');
    await userEvent.clear(input);
    await userEvent.type(input, 'carrefour');
    await userEvent.click(screen.getByRole('button', { name: 'Créer la règle' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/sorting-rules');
    expect(JSON.parse(String(init.body))).toEqual({ pattern: 'carrefour', envelopeId: 10 });
  });

  it('"Non merci" ferme sans appel réseau', async () => {
    const onDone = renderBanner();
    await userEvent.click(screen.getByRole('button', { name: 'Non merci' }));
    expect(onDone).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
