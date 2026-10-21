import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Overview } from '@shared/api-types';
import type { Transaction } from '@shared/schemas';
import { ToastProvider } from '@/components/ui';
import { HomePage } from './Home';

const base: Overview = {
  today: '2026-10-08',
  toAllocate: 0,
  netWorth: 1500_00,
  accounts: [{ id: 1, name: 'Courant', initialBalance: 0, onBudget: true, bankAccountNumber: null, archived: false, createdAt: '2026-01-01T00:00:00.000Z', balance: 1500_00, lastImport: null }],
  envelopes: [],
  // Budget dépassé : l'ancien Accueil affichait « Budget dépassé de ».
  month: { start: '2026-10-01', end: '2026-10-31', spent: 1200_00, budget: 1000_00, variable: { spent: 300_00, budget: 400_00, daily: [0, 0, 50_00, 100_00, 100_00, 150_00, 250_00, 300_00] }, saved: 200_00, toFund: 0, income: 0, planned: 0 },
  alerts: [],
  unsortedCount: 0,
  latePlanned: [],
  latestFunding: null,
  watch: [],
  signalCount: 0,
  pendingReview: null,
};

const velib: Transaction = {
  id: 7,
  kind: 'expense',
  date: '2026-10-07',
  amount: 2_00,
  label: 'Velib',
  note: null,
  accountId: 1,
  toAccountId: null,
  envelopeId: null,
  fromEnvelopeId: null,
  status: 'confirmed',
  recurringRuleId: null,
  importId: null,
  fingerprint: null,
  fundingId: null,
  merchantKey: null,
  merchantName: null,
  createdAt: '',
};

let overview: Overview = base;
let recent: Transaction[] = [velib];
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const fetchMock = vi.fn(async (path: string) => {
  if (path === '/api/overview') return json(overview);
  if (path.startsWith('/api/transactions?')) return json(recent);
  if (path.startsWith('/api/accounts')) return json(base.accounts);
  if (path.startsWith('/api/envelopes')) return json([]);
  return new Response(JSON.stringify({ error: 'Introuvable' }), { status: 404 });
});
beforeEach(() => {
  recent = [velib];
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

  it('nomme correctement la ligne « enveloppes au-dessus du revenu », espace avant le détail compris', async () => {
    renderHome({ month: { ...base.month, income: 500_00, planned: 800_00 } });
    expect(await screen.findByRole('link', { name: 'Tes enveloppes prévoient 300,00 € de plus que ton revenu · 800,00 € pour 500,00 € par mois' })).toHaveAttribute('href', '/budget');
  });

  it('nomme correctement la ligne d’alerte de solde, espace avant le détail compris', async () => {
    renderHome({ alerts: [{ kind: 'envelope', id: 1, name: 'Courses', firstNegativeDate: '2026-10-15', daysUntil: 0, minBalance: -12_30, minBalanceDate: '2026-10-20' }] });
    expect(await screen.findByRole('link', { name: 'L’enveloppe Courses passe dans le rouge dès aujourd’hui · point bas -12,30 €' })).toHaveAttribute('href', '/analyse?vue=a-venir');
  });

  it('ne répète pas une enveloppe déjà signalée dépassée dans la ligne de surveillance', async () => {
    renderHome({
      watch: [{ envelopeId: 1, name: 'Restos', kind: 'over', amount: 12_40 }],
      alerts: [{ kind: 'envelope', id: 1, name: 'Restos', firstNegativeDate: '2026-10-08', daysUntil: 0, minBalance: -12_40, minBalanceDate: '2026-10-08' }],
    });
    await screen.findByRole('link', { name: 'Restos dépassée de 12,40 €' });
    expect(screen.queryByRole('link', { name: /passe dans le rouge/ })).not.toBeInTheDocument();
  });

  it('nomme correctement la ligne d’opération prévue en retard, espace avant le détail compris', async () => {
    const late: Transaction = {
      id: 1,
      kind: 'expense',
      date: '2026-10-05',
      amount: 750_00,
      label: 'Loyer',
      note: null,
      accountId: 1,
      toAccountId: null,
      envelopeId: null,
      fromEnvelopeId: null,
      status: 'planned',
      recurringRuleId: null,
      importId: null,
      fingerprint: null,
      fundingId: null,
      merchantKey: null,
      merchantName: null,
      createdAt: '',
    };
    renderHome({ latePlanned: [late] });
    expect(await screen.findByRole('link', { name: 'Le prélèvement « Loyer » de 750,00 € prévu le 5 oct. n’est pas passé · confirme-le ou supprime-le' })).toHaveAttribute(
      'href',
      '/operations?status=planned&period=all',
    );
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

  it('trace la courbe des dépenses courantes à la place des barres', async () => {
    renderHome();
    // Le 8 octobre, rythme de 400 € × 8 / 31 = 103,23 € ; 300 € dépensés.
    expect(await screen.findByRole('img', { name: /^Dépenses courantes : 300,00 € au 8 oct\., 196,77 € au-dessus du rythme prévu/ })).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('sans budget de dépenses courantes, pas de courbe', async () => {
    renderHome({ month: { ...base.month, variable: { spent: 0, budget: 0, daily: [0] } } });
    await screen.findByText('Mis de côté');
    expect(screen.queryByRole('img', { name: /^Dépenses courantes/ })).not.toBeInTheDocument();
  });

  it('montre les dernières opérations confirmées, sans les répartitions, et un lien vers toutes', async () => {
    renderHome();
    const section = await screen.findByRole('region', { name: 'Dernières opérations' });
    expect(await within(section).findByRole('button', { name: 'Ouvrir Velib' })).toBeInTheDocument();
    expect(section).toHaveTextContent('7 oct.');
    expect(within(section).getByRole('link', { name: 'Tout voir' })).toHaveAttribute('href', '/operations');
    expect(fetchMock).toHaveBeenCalledWith('/api/transactions?status=confirmed&excludeAllocations=true&limit=5', expect.anything());
  });

  it('liste les comptes, l’épargne signalée à côté du nom', async () => {
    renderHome({ accounts: [...base.accounts, { ...base.accounts[0]!, id: 2, name: 'Livret A', onBudget: false, balance: 2009_56 }] });
    const section = await screen.findByRole('region', { name: 'Comptes' });
    expect(within(section).getByText('Livret A').closest('li')).toHaveTextContent('Livret AÉpargne2 009,56 €');
  });

  it('invite au bilan du mois précédent tant qu’il n’est pas validé', async () => {
    renderHome({ pendingReview: { month: '2026-09', spent: 3154_00, overspentCount: 2 } });
    const banner = await screen.findByRole('group', { name: 'Bilan du mois précédent' });
    expect(banner).toHaveTextContent('Bilan de septembre : 3 154,00 € dépensés, 2 enveloppes dépassées');
    expect(screen.getByRole('link', { name: 'Faire le bilan' })).toHaveAttribute('href', '/analyse?vue=bilan&mois=2026-09');
  });

  it('n’affiche aucune carte de bilan une fois celui-ci validé', async () => {
    renderHome({ pendingReview: null });
    await screen.findByText('Mis de côté');
    expect(screen.queryByText(/Bilan de/)).not.toBeInTheDocument();
  });
});
