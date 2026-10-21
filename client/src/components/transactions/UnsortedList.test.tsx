import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Transaction } from '@shared/schemas';
import { ToastProvider } from '@/components/ui';
import { UnsortedList } from './UnsortedList';

const accounts = [{ id: 1, name: 'Courant', initialBalance: 0, onBudget: true, bankAccountNumber: null, archived: false, createdAt: '' }];
const envelopes = [{ id: 10, name: 'Courses', color: '#4f8a5b', monthlyExtra: null, sortOrder: 0, archived: false, isSavings: false }];

const sc14: Transaction = {
  id: 7,
  kind: 'expense',
  date: '2026-10-19',
  amount: 1350,
  label: 'ACHAT CB SC-FOURTEEN CA 15.10.26 CARTE NUMERO 089',
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
  merchantKey: 'SC-FOURTEEN CA',
  merchantName: 'SC-Fourteen',
  createdAt: '',
};

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
      if (url.startsWith('/api/transactions?unsorted')) return json([sc14]);
      if (url.startsWith('/api/merchants/')) {
        return json({ key: 'SC-FOURTEEN CA', name: 'SC-Fourteen', source: 'claude', transactionCount: 1, description: 'Bar-restaurant, Paris (14e)', descriptionSource: 'web', describedAt: '2026-10-21T10:00:00Z', total12Months: -1350, firstDate: '2026-10-19' });
      }
      if (url.startsWith('/api/accounts')) return json(accounts);
      if (url.startsWith('/api/envelopes')) return json(envelopes);
      return json([]);
    }),
  );
});

function renderList() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <UnsortedList />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('UnsortedList', () => {
  it('un clic sur une opération à ranger ouvre sa fiche, le choix d’enveloppe reste à côté', async () => {
    renderList();
    expect(await screen.findByRole('combobox', { name: 'Enveloppe pour SC-Fourteen' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ouvrir SC-Fourteen' }));
    expect(await screen.findByRole('region', { name: 'Qui c\'est', hidden: true })).toBeInTheDocument();
    expect(await screen.findByText('Bar-restaurant, Paris (14e)')).toBeInTheDocument();
  });
});
