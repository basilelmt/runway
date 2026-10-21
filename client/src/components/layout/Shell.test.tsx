import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
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
  const router = createMemoryRouter(
    [
      {
        path: '/',
        Component: Shell,
        children: [
          { index: true, element: null },
          { path: 'budget', element: <p>Budget</p> },
          { path: 'reglages', element: null, children: [{ path: '*', element: null }] },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return router;
}

describe('Shell', () => {
  it('rejoue le fondu en changeant d’écran, pas en changeant seulement de filtres ou d’onglet des Réglages', async () => {
    const router = renderShell('/');
    const content = () => document.getElementById('main')!.firstElementChild;
    const home = content();
    await act(() => router.navigate('/?vue=semaine'));
    expect(content()).toBe(home);
    await act(() => router.navigate('/budget'));
    expect(content()).not.toBe(home);
    await act(() => router.navigate('/reglages/comptes'));
    const settings = content();
    await act(() => router.navigate('/reglages/banque'));
    expect(content()).toBe(settings);
  });

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

  it('ouvert avec N ou K, ne rend pas le focus au bouton d’ouverture cliqué plus tôt (pas d’anneau après Échap)', async () => {
    renderShell('/');
    const user = userEvent.setup();
    // La barre latérale et le bouton flottant mobile portent le même nom : on prend celui de la barre latérale.
    const nav = screen.getByRole('navigation', { name: 'Navigation principale' });
    const add = within(nav).getByRole('button', { name: /Nouvelle opération/ });
    add.focus();
    await user.keyboard('n');
    await user.keyboard('{Escape}');
    expect(add).not.toHaveFocus();
    const ask = within(nav).getByRole('button', { name: /Demander/ });
    ask.focus();
    await user.keyboard('k');
    await user.keyboard('{Escape}');
    expect(ask).not.toHaveFocus();
  });
});
