import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ForecastResponse, SpendingReport } from '@shared/api-types';
import { AnalysePage } from './Analyse';

const spending: SpendingReport = {
  from: '2026-10-01',
  to: '2026-10-31',
  total: 1200_00,
  monthlyBudget: 2000_00,
  byEnvelope: [
    { envelopeId: 3, name: 'Logement', color: '#4a8a5c', amount: 1000_00, monthlyBudget: 1000_00 },
    { envelopeId: 14, name: 'Sorties', color: '#9a4f9a', amount: 200_00, monthlyBudget: 400_00 },
  ],
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

function renderPage(path = '/analyse') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/analyse" element={<AnalysePage />} />
          <Route path="/operations" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Analyse', () => {
  it('rapporte les barres à la plus grosse enveloppe et ouvre ses opérations au clic', async () => {
    fetchMock.mockImplementation(async (url: string) => (url.startsWith('/api/reports/spending') ? json(spending) : json([])));
    renderPage();

    expect(await screen.findByRole('region', { name: 'Dépensé sur la période' })).toHaveTextContent(/800,00\s€ sous le budget de 2\s000,00\s€/);
    const bars = screen.getAllByRole('progressbar');
    expect(bars.map((b) => b.getAttribute('aria-valuenow'))).toEqual(['100', '20']);

    await userEvent.click(screen.getByRole('button', { name: 'Voir les opérations de Sorties' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/operations?period=custom&from=2026-10-01&to=2026-10-31&envelope=14');
  });

  it('signale l’échec du chargement des plus grosses dépenses', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/reports/spending')) return json(spending);
      if (url.startsWith('/api/transactions')) return json({ error: 'Base indisponible' }, 500);
      return json([]);
    });
    renderPage();

    const section = (await screen.findByRole('heading', { name: 'Plus grosses dépenses' })).closest('section')!;
    expect(await within(section).findByText('Impossible de charger les plus grosses dépenses')).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });

  it('signale l’échec du taux d’épargne au lieu de ne rien afficher', async () => {
    fetchMock.mockImplementation(async () => json({ error: 'Base indisponible' }, 500));
    renderPage('/analyse?vue=evolution');

    expect(await screen.findByText('Impossible de calculer le taux d’épargne')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Taux d’épargne sur 12 mois' })).not.toBeInTheDocument();
  });

  it('affiche le taux d’épargne et les moyennes mensuelles', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/reports/monthly')) return json([{ month: '2026-10', income: 3000_00, expense: 2000_00, saved: 600_00 }]);
      return json({ error: 'Base indisponible' }, 500);
    });
    renderPage('/analyse?vue=evolution');

    const figure = await screen.findByRole('region', { name: 'Taux d’épargne sur 12 mois' });
    expect(within(figure).getByLabelText('20 %')).toBeInTheDocument();
    expect(within(figure).getByText('Mis de côté par mois')).toBeInTheDocument();
    expect(within(figure).getByText('Dépensé par mois, hors épargne')).toBeInTheDocument();
  });

  it('annonce le découvert tracé et en change au clic', async () => {
    const days = ['2026-10-09', '2026-10-10', '2026-10-11'].map((date, i) => ({ date, accounts: { 1: 100_00 - i * 80_00 }, envelopes: { 5: 20_00 - i * 15_00 } }));
    const forecast: ForecastResponse = {
      today: '2026-10-09',
      horizonDays: 90,
      days,
      events: [],
      alerts: [
        { kind: 'account', id: 1, name: 'Compte courant', firstNegativeDate: '2026-10-11', daysUntil: 2, minBalance: -60_00, minBalanceDate: '2026-10-11' },
        { kind: 'envelope', id: 5, name: 'Sorties', firstNegativeDate: '2026-10-11', daysUntil: 2, minBalance: -10_00, minBalanceDate: '2026-10-11' },
      ],
      accounts: [{ id: 1, name: 'Compte courant', onBudget: true }],
      envelopes: [{ id: 5, name: 'Sorties', color: '#9a4f9a' }],
    };
    fetchMock.mockImplementation(async (url: string) => (url.startsWith('/api/forecast') ? json(forecast) : json({ forecastHorizonDays: 90 })));
    renderPage('/analyse?vue=a-venir');

    const account = await screen.findByRole('button', { name: 'Tracer le solde projeté de Compte courant' });
    const envelope = screen.getByRole('button', { name: 'Tracer le solde projeté de Sorties' });
    expect(account).toHaveAttribute('aria-pressed', 'true');
    expect(envelope).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(envelope);
    expect(envelope).toHaveAttribute('aria-pressed', 'true');
    expect(account).toHaveAttribute('aria-pressed', 'false');
  });
});
