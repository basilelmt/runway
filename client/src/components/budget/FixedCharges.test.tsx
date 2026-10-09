import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account } from '@shared/schemas';
import type { RecurringRuleView } from '@/api/hooks';
import { ToastProvider } from '@/components/ui';
import { FixedCharges } from './FixedCharges';

const salaire: RecurringRuleView = {
  id: 1,
  name: 'Salaire',
  label: 'VIR SALAIRE',
  kind: 'income',
  amount: 2450_00,
  accountId: 1,
  toAccountId: null,
  envelopeId: null,
  fromEnvelopeId: null,
  frequency: 'monthly',
  interval: 1,
  dayOfMonth: 28,
  startDate: '2026-01-01',
  endDate: null,
  lastGeneratedDate: null,
  active: true,
  triggersFunding: false,
  fundsNextMonth: false,
  nextDate: '2026-10-28',
  monthlyEquivalent: 2450_00,
};
const loyer: RecurringRuleView = { ...salaire, id: 2, name: 'Loyer', label: 'PRLV LOYER', kind: 'expense', amount: 986_00, dayOfMonth: 5, nextDate: '2026-11-05', monthlyEquivalent: 986_00 };
const courant: Account = { id: 1, name: 'Courant', initialBalance: 0, onBudget: true, bankAccountNumber: null, archived: false, createdAt: '2026-01-01T00:00:00.000Z' };

let rules: RecurringRuleView[] = [];
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const fetchMock = vi.fn(async (path: string) =>
  path === '/api/recurring-rules' ? json(rules) : path === '/api/accounts?archived=true' ? json([courant]) : path === '/api/envelopes?archived=true' ? json([]) : new Response(null, { status: 404 }),
);
beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});

function renderCharges(list: RecurringRuleView[]) {
  rules = list;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter>
          <FixedCharges />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('FixedCharges', () => {
  it('liste revenus et charges sans bloc de totaux', async () => {
    renderCharges([salaire, loyer]);
    expect(await screen.findByText('Salaire')).toBeInTheDocument();
    expect(screen.getByText('Loyer')).toBeInTheDocument();
    expect(screen.queryByText('Revenus par mois')).not.toBeInTheDocument();
    expect(screen.queryByText('Charges par mois')).not.toBeInTheDocument();
    expect(screen.queryByText('Virements programmés')).not.toBeInTheDocument();
    expect(screen.queryByText('Reste pour vivre et investir')).not.toBeInTheDocument();
  });

  it('explique que les charges comptent dans le budget quand la liste est vide', async () => {
    renderCharges([]);
    expect(await screen.findByText('Ajoute ton salaire, ton loyer et tes abonnements : leurs montants comptent dans le budget de leur enveloppe.')).toBeInTheDocument();
    expect(screen.getByText(/Ce qui revient tout seul/)).toBeInTheDocument();
  });
});
