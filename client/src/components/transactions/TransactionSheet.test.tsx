import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Transaction } from '@shared/schemas';
import { TransactionSheet } from './TransactionSheet';

const accounts = [
  { id: 1, name: 'Courant', initialBalance: 0, onBudget: true, bankAccountNumber: null, archived: false, createdAt: '' },
  { id: 2, name: 'Livret', initialBalance: 0, onBudget: false, bankAccountNumber: null, archived: false, createdAt: '' },
];
const envelopes = [{ id: 10, name: 'Courses', color: '#4f8a5b', monthlyExtra: null, sortOrder: 0, archived: false, isSavings: false }];

function tx(partial: Partial<Transaction> & Pick<Transaction, 'id' | 'kind' | 'amount' | 'label' | 'date'>): Transaction {
  return {
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
    ...partial,
  };
}

const expense = tx({
  id: 7,
  kind: 'expense',
  date: '2026-10-03',
  amount: 1250,
  label: 'ACHAT CB CARREFOUR EXPR 03.10.26 CARTE NUMERO 123',
  envelopeId: 10,
  merchantKey: 'CARREFOUR EXPR',
  merchantName: 'Carrefour Express',
});

const other8 = tx({ id: 8, kind: 'expense', date: '2026-09-20', amount: 1100, label: 'ACHAT CB CARREFOUR EXPR 20.09.26', merchantKey: 'CARREFOUR EXPR', merchantName: 'Carrefour Express' });
const other9 = tx({ id: 9, kind: 'expense', date: '2026-09-10', amount: 900, label: 'ACHAT CB CARREFOUR EXPR 10.09.26', merchantKey: 'CARREFOUR EXPR', merchantName: 'Carrefour Express' });
const sncf = tx({ id: 20, kind: 'expense', date: '2026-10-03', amount: 2200, label: 'SNCF VOYAGEURS', accountId: 2, merchantKey: 'SNCF', merchantName: 'SNCF' });

let detail: { description: string | null; descriptionSource: 'claude' | 'web' | 'user' | null; describedAt: string | null };

beforeEach(() => {
  detail = { description: 'Supérette de quartier', descriptionSource: 'claude', describedAt: '2026-10-20T10:00:00Z' };
  const fetchMock = vi.fn(async (url: string) => {
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (url.startsWith('/api/merchants/CARREFOUR%20EXPR/describe')) {
      detail = { description: 'Supérette de quartier, Paris', descriptionSource: 'web', describedAt: '2026-10-21T10:00:00Z' };
      return json({ key: 'CARREFOUR EXPR', name: 'Carrefour Express', source: 'user', transactionCount: 14, total12Months: -18240, firstDate: '2025-03-01', ...detail });
    }
    if (url.startsWith('/api/merchants/CARREFOUR%20EXPR')) {
      return json({ key: 'CARREFOUR EXPR', name: 'Carrefour Express', source: 'user', transactionCount: 14, total12Months: -18240, firstDate: '2025-03-01', ...detail });
    }
    if (url.startsWith('/api/transactions') && url.includes('merchant=')) return json([expense, other8, other9]);
    if (url.startsWith('/api/transactions') && url.includes('from=2026-10-03')) return json([expense, sncf]);
    if (url.startsWith('/api/accounts')) return json(accounts);
    if (url.startsWith('/api/envelopes')) return json(envelopes);
    return json([]);
  });
  vi.stubGlobal('fetch', fetchMock);
});

function renderSheet(t: Transaction, opts: { onOpen?: (t: Transaction) => void; onEdit?: () => void } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <TransactionSheet transaction={t} onEdit={opts.onEdit ?? vi.fn()} onOpen={opts.onOpen ?? vi.fn()} />
    </QueryClientProvider>,
  );
}

describe('TransactionSheet', () => {
  it('montre qui est le marchand, l’historique et le même jour, sans répéter l’opération ouverte', async () => {
    renderSheet(expense);
    expect(await screen.findByText('Supérette de quartier')).toBeInTheDocument();
    expect(screen.getByText('d’après Claude')).toBeInTheDocument();
    expect(await screen.findByText(/14 passages depuis mars 2025/)).toBeInTheDocument();
    expect(screen.getByText(/182,40 € sur 12 mois/)).toBeInTheDocument();
    const history = screen.getByRole('region', { name: 'Chez ce marchand' });
    expect(within(history).getAllByRole('listitem')).toHaveLength(2);
    const sameDay = screen.getByRole('region', { name: 'Le même jour' });
    expect(within(sameDay).getByText('SNCF')).toBeInTheDocument();
    expect(screen.getByText(expense.label)).toBeInTheDocument();
  });

  it('marchand pas reconnu : recherche web, attente puis résultat', async () => {
    detail.description = null;
    detail.descriptionSource = 'claude';
    detail.describedAt = '2026-10-20T10:00:00Z';
    renderSheet(expense);
    expect(await screen.findByText('Claude n’a pas reconnu ce marchand.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Chercher sur le web' }));
    expect(await screen.findByText('Supérette de quartier, Paris')).toBeInTheDocument();
    expect(screen.getByText('d’après le web')).toBeInTheDocument();
  });

  it('pas de bouton web pour une description donnée à la main', async () => {
    detail.descriptionSource = 'user';
    renderSheet(expense);
    await screen.findByText('Supérette de quartier');
    expect(screen.queryByRole('button', { name: 'Chercher sur le web' })).toBeNull();
  });

  it('un clic sur une opération voisine demande son ouverture', async () => {
    const onOpen = vi.fn();
    renderSheet(expense, { onOpen });
    const sameDay = await screen.findByRole('region', { name: 'Le même jour' });
    await userEvent.click(within(sameDay).getByRole('button', { name: /SNCF/ }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 20 }));
  });
});
