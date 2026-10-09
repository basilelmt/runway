import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Overview } from '@shared/api-types';
import { ToastProvider } from '@/components/ui';
import { HomePage } from './Home';

const base: Overview = {
  today: '2026-10-08',
  toAllocate: 0,
  netWorth: 1500_00,
  accounts: [{ id: 1, name: 'Courant', initialBalance: 0, onBudget: true, bankAccountNumber: null, archived: false, createdAt: '2026-01-01T00:00:00.000Z', balance: 1500_00, lastImport: null }],
  envelopes: [],
  // Budget dépassé : l'ancien Accueil affichait « Budget dépassé de ».
  month: { start: '2026-10-01', end: '2026-10-31', spent: 1200_00, budget: 1000_00, variable: { spent: 300_00, budget: 400_00 }, saved: 200_00, toFund: 0, income: 0, planned: 0 },
  alerts: [],
  unsortedCount: 0,
  latePlanned: [],
  latestFunding: null,
  watch: [],
};

let overview: Overview = base;
const fetchMock = vi.fn(async (path: string) =>
  path === '/api/overview' ? new Response(JSON.stringify(overview), { status: 200 }) : new Response(JSON.stringify({ error: 'Introuvable' }), { status: 404 }),
);
beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});

function renderHome(over: Partial<Overview> = {}) {
  overview = { ...base, ...over };
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('Accueil', () => {
  it('signale les enveloppes à surveiller dans « À faire », vers le Budget', async () => {
    renderHome({ watch: [{ envelopeId: 3, name: 'Restos', kind: 'over', amount: 12_40 }] });
    const line = await screen.findByRole('link', { name: 'Restos dépassée de 12,40 €' });
    expect(line).toHaveAttribute('href', '/budget');
  });

  it('montre plusieurs enveloppes en une seule ligne', async () => {
    renderHome({
      watch: [
        { envelopeId: 3, name: 'Restos', kind: 'over', amount: 12_40 },
        { envelopeId: 4, name: 'Sorties', kind: 'low', amount: 1_00 },
      ],
    });
    expect(await screen.findByRole('link', { name: '2 enveloppes à surveiller · Restos, Sorties' })).toHaveAttribute('href', '/budget');
  });

  it('ne répète plus le budget : ni marge restante, ni section des enveloppes', async () => {
    renderHome();
    expect(await screen.findByText('Mis de côté')).toBeInTheDocument();
    expect(screen.getByText(/Rien à faire/)).toBeInTheDocument();
    expect(screen.queryByText('Marge restante')).not.toBeInTheDocument();
    expect(screen.queryByText('Budget dépassé de')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Enveloppes' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Voir les|Voir le budget/)).not.toBeInTheDocument();
  });
});
