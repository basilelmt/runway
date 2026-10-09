import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui';
import { Shell } from './Shell';

const fetchMock = vi.fn((url: string) => {
  if (url === '/api/bank-sync/run') return Promise.resolve(new Response(JSON.stringify({ reason: 'fresh', connections: [] }), { status: 200 }));
  return Promise.resolve(new Response('null', { status: 200 }));
});

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function renderShell(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/*" element={<Shell />}>
              <Route index element={null} />
              <Route path="reglages/*" element={null} />
            </Route>
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('Shell', () => {
  it('met en évidence le bouton Réglages de l’en-tête mobile sur /reglages et ses sous-pages', () => {
    renderShell('/reglages/comptes');
    const header = screen.getByRole('banner');
    const link = within(header).getByRole('link', { name: 'Réglages' });
    expect(link).toHaveAttribute('aria-current', 'page');
  });

  it('ne met pas Réglages en évidence ailleurs', () => {
    renderShell('/');
    const header = screen.getByRole('banner');
    const link = within(header).getByRole('link', { name: 'Réglages' });
    expect(link).not.toHaveAttribute('aria-current');
  });
});
