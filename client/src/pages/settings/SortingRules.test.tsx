import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SortingRule } from '@shared/schemas';
import { ToastProvider } from '@/components/ui';
import { SortingRulesSettings } from './SortingRules';

let rules: SortingRule[];
const fetchMock = vi.fn();

beforeEach(() => {
  rules = [
    { id: 1, pattern: 'carrefour', envelopeId: 10, priority: 0 },
    { id: 2, pattern: 'sncf', envelopeId: 11, priority: 1 },
    { id: 3, pattern: 'uber', envelopeId: 11, priority: 2 },
  ];
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (url === '/api/sorting-rules' && method === 'GET') return new Response(JSON.stringify(rules), { status: 200 });
    if (url.startsWith('/api/sorting-rules/') && method === 'DELETE') {
      rules = rules.filter((r) => r.id !== Number(url.split('/').at(-1)));
      return new Response(null, { status: 204 });
    }
    if (url === '/api/sorting-rules/reorder' && method === 'PUT') {
      const { ids } = JSON.parse(String(init?.body)) as { ids: number[] };
      rules = ids.map((id, priority) => ({ ...rules.find((r) => r.id === id)!, priority }));
      return new Response(JSON.stringify(rules), { status: 200 });
    }
    if (url.startsWith('/api/envelopes')) {
      return new Response(
        JSON.stringify([
          { id: 10, name: 'Courses', color: '#2f7d5b', archived: false },
          { id: 11, name: 'Transports', color: '#b8731a', archived: false },
        ]),
        { status: 200 },
      );
    }
    return new Response('null', { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function renderPage() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <SortingRulesSettings />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const order = () => within(screen.getByRole('list', { name: 'Règles par priorité' })).getAllByRole('button', { name: /^Modifier la règle/ }).map((b) => b.getAttribute('aria-label'));

describe('SortingRulesSettings', () => {
  it('supprime une règle depuis le menu ⋯, après confirmation', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Actions pour « sncf »' }));
    await user.click(screen.getByRole('menuitem', { name: 'Supprimer' }));
    const dialog = screen.getByRole('dialog', { name: 'Supprimer cette règle ?' });
    expect(fetchMock).not.toHaveBeenCalledWith('/api/sorting-rules/2', expect.anything());
    await user.click(within(dialog).getByRole('button', { name: 'Supprimer' }));
    expect(fetchMock).toHaveBeenCalledWith('/api/sorting-rules/2', expect.objectContaining({ method: 'DELETE' }));
    await waitFor(() => expect(screen.queryByText('sncf')).not.toBeInTheDocument());
  });

  it('monte et descend une règle depuis le menu ⋯, sans monter la première ni descendre la dernière', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Actions pour « carrefour »' }));
    expect(screen.getByRole('menuitem', { name: 'Monter' })).toBeDisabled();
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Actions pour « uber »' }));
    expect(screen.getByRole('menuitem', { name: 'Descendre' })).toBeDisabled();
    await user.click(screen.getByRole('menuitem', { name: 'Monter' }));
    await waitFor(() => expect(order()).toEqual(['Modifier la règle « carrefour »', 'Modifier la règle « uber »', 'Modifier la règle « sncf »']));

    await user.click(screen.getByRole('button', { name: 'Actions pour « carrefour »' }));
    await user.click(screen.getByRole('menuitem', { name: 'Descendre' }));
    await waitFor(() => expect(order()).toEqual(['Modifier la règle « uber »', 'Modifier la règle « carrefour »', 'Modifier la règle « sncf »']));
  });

  it('ouvre la règle en modification d’un clic sur la ligne', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Modifier la règle « sncf »' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByDisplayValue('sncf')).toBeInTheDocument();
  });

  it('montre une erreur de chargement avec « Réessayer » plutôt qu’une liste vide', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url === '/api/sorting-rules' ? new Response(JSON.stringify({ error: 'Base indisponible' }), { status: 500 }) : new Response('[]', { status: 200 }),
    );
    renderPage();
    expect(await screen.findByText('Impossible de charger les règles de tri')).toBeInTheDocument();
    expect(screen.getByText('Base indisponible')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
    expect(screen.queryByText('Aucune règle de tri')).not.toBeInTheDocument();
  });
});
