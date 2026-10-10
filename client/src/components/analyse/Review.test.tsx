import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Envelope } from '@shared/schemas';
import type { MonthReview } from '@shared/api-types';
import { ToastProvider } from '@/components/ui';
import { Review } from './Review';

const askApi = { open: false, setOpen: vi.fn(), toggle: vi.fn(), turns: [], pending: false, send: vi.fn(), stop: vi.fn(), retry: vi.fn(), reset: vi.fn() };
vi.mock('@/components/ask/ask-context', () => ({ useAsk: () => askApi }));

const envelope = (partial: Partial<Envelope> & { id: number; name: string }): Envelope => ({
  color: '#4f8a5b',
  monthlyExtra: null,
  sortOrder: 0,
  archived: false,
  isSavings: false,
  ...partial,
});

const envelopes: Envelope[] = [
  envelope({ id: 1, name: 'Restos', color: '#c2703d' }),
  envelope({ id: 2, name: 'Courses', color: '#4f8a5b' }),
  envelope({ id: 3, name: 'Bourse', color: '#3f6fae', isSavings: true }),
];

const baseReview: MonthReview = {
  month: '2026-09',
  figures: { income: 2800_00, spent: 1200_00, saved: 300_00 },
  envelopes: [
    { envelopeId: 1, name: 'Restos', color: '#c2703d', budget: 180_00, spent: 300_00, gap: 120_00 },
    { envelopeId: 2, name: 'Courses', color: '#4f8a5b', budget: 400_00, spent: 200_00, gap: -200_00 },
  ],
  proposals: [{ envelopeId: 1, name: 'Restos', currentExtra: 180_00, proposedExtra: 360_00, monthsSpent: [352_00, 325_00, 681_00] }],
  control: {
    envelopes: [
      { envelopeId: 1, monthlyCharges: 0, monthlyBudget: 180_00 },
      { envelopeId: 2, monthlyCharges: 0, monthlyBudget: 400_00 },
    ],
    medianIncome: 2850_00,
  },
  remainders: [{ envelopeId: 2, name: 'Courses', color: '#4f8a5b', amount: 100_00 }],
  status: { validated: false, reviewedAt: null, applied: null },
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

let review: MonthReview = baseReview;
const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  review = baseReview;
  askApi.setOpen.mockReset();
  askApi.send.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.startsWith('/api/reviews/2026-09') && (!init || init.method === undefined)) return json(review);
    if (url.startsWith('/api/envelopes')) return json(envelopes);
    if (url.startsWith('/api/reviews/2026-09') && init?.method === 'POST') return json({ ...review, status: { validated: true, reviewedAt: '2026-10-02T08:00:00.000Z', applied: { budgets: [], allocationIds: [] } } });
    if (url.startsWith('/api/reviews/2026-09') && init?.method === 'DELETE') return json({ skipped: [] });
    return json(null, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
});

function renderReview(path = '/analyse?vue=bilan&mois=2026-09') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/analyse" element={<Review />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('Review', () => {
  it('affiche les chiffres du mois et les enveloppes, dépassement compris', async () => {
    renderReview();
    expect(await screen.findByText('1 200,00 €')).toBeInTheDocument();
    expect(screen.getByText('300,00 € sur 180,00 €')).toBeInTheDocument();
    expect(screen.getByText('dépassement')).toBeInTheDocument();
  });

  it('affiche la marge en clair pour une enveloppe sous son budget, sans nombre négatif', async () => {
    renderReview();
    await screen.findByText('Courses');
    expect(screen.getByText('200,00 €')).toBeInTheDocument();
    expect(screen.getByText('de marge')).toBeInTheDocument();
    expect(screen.queryByText(/^-/)).not.toBeInTheDocument();
  });

  it('ouvre Demander avec la question préremplie sur une enveloppe dépassée', async () => {
    renderReview();
    await screen.findByText('Restos');
    await userEvent.click(screen.getByRole('button', { name: 'Demander pourquoi' }));
    expect(askApi.setOpen).toHaveBeenCalledWith(true);
    expect(askApi.send).toHaveBeenCalledWith('Pourquoi Restos a dépassé en septembre 2026 ?');
  });

  it('propose un nouveau complément avec le détail des 3 mois, ignoré par défaut', async () => {
    renderReview();
    const hint = await screen.findByText(/352,00 €, 325,00 €, 681,00 €/);
    expect(hint).toHaveTextContent('352,00 €, 325,00 €, 681,00 € sur 3 mois. Proposé 360,00 € au lieu de 180,00 €.');
    const checkbox = screen.getByRole('checkbox', { name: 'Accepter pour Restos' });
    expect(checkbox).not.toBeChecked();
    const input = screen.getByRole('textbox', { name: 'Nouveau complément de Restos' });
    expect(input).toBeDisabled();
    expect(screen.getByText('Budgets 580,00 € pour un revenu médian de 2 850,00 €')).toBeInTheDocument();

    await userEvent.click(checkbox);
    expect(input).toBeEnabled();
    expect(screen.getByText('Budgets 760,00 € pour un revenu médian de 2 850,00 €')).toBeInTheDocument();
  });

  it('alerte quand le total des budgets dépasse le revenu médian', async () => {
    review = { ...baseReview, control: { ...baseReview.control, medianIncome: 500_00 } };
    renderReview();
    const line = await screen.findByText('Budgets 580,00 € pour un revenu médian de 500,00 €');
    expect(line).toHaveAttribute('role', 'alert');
  });

  it('propose de verser le reste vers l’unique enveloppe d’épargne, en gardant par défaut', async () => {
    renderReview();
    const checkbox = await screen.findByRole('checkbox', { name: 'Verser le reste de Courses (100,00 €)' });
    expect(checkbox).not.toBeChecked();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    await userEvent.click(checkbox);
    const select = screen.getByRole('combobox', { name: 'Enveloppe d’épargne pour le reste de Courses' });
    expect(select).toHaveValue('3');
  });

  it('valide le bilan avec les propositions acceptées et les restes versés', async () => {
    renderReview();
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Accepter pour Restos' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Verser le reste de Courses (100,00 €)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Valider le bilan' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/reviews/2026-09',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ budgets: [{ envelopeId: 1, monthlyExtra: 360_00 }], transfers: [{ fromEnvelopeId: 2, toEnvelopeId: 3, amount: 100_00 }] }),
        }),
      ),
    );
    expect(await screen.findByText('Bilan validé')).toBeInTheDocument();
    expect(screen.getByText('Annuler')).toBeInTheDocument();
  });

  it('mois déjà validé : affiche ce qui a été appliqué et permet d’annuler', async () => {
    review = {
      ...baseReview,
      status: {
        validated: true,
        reviewedAt: '2026-10-02T08:00:00.000Z',
        applied: { budgets: [{ envelopeId: 1, before: 180_00, after: 360_00 }], allocationIds: [42] },
      },
    };
    renderReview();
    expect(await screen.findByText(/1 complément modifié, 1 versement/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Valider le bilan' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Annuler ce bilan' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/reviews/2026-09', expect.objectContaining({ method: 'DELETE' })));
    expect(await screen.findByText('Bilan annulé')).toBeInTheDocument();
  });
});
