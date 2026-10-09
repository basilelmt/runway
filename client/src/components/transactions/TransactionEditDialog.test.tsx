import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Transaction } from '@shared/schemas';
import { ToastProvider } from '@/components/ui';
import { TransactionEditDialog } from './TransactionEditDialog';

const accounts = [
  { id: 1, name: 'Courant', initialBalance: 0, onBudget: true, bankAccountNumber: null, archived: false, createdAt: '' },
  { id: 2, name: 'Livret', initialBalance: 0, onBudget: false, bankAccountNumber: null, archived: false, createdAt: '' },
];
const envelopes = [{ id: 10, name: 'Courses', color: '#4f8a5b', monthlyExtra: null, sortOrder: 0, archived: false, isSavings: false }];

const expense: Transaction = {
  id: 7,
  kind: 'expense',
  date: '2026-10-03',
  amount: 1250,
  label: 'ACHAT CB CARREFOUR EXPR 03.10.26 CARTE NUMERO 123',
  note: null,
  accountId: 1,
  toAccountId: null,
  envelopeId: null,
  fromEnvelopeId: null,
  status: 'confirmed',
  recurringRuleId: null,
  importId: 3,
  fingerprint: null,
  fundingId: null,
  merchantKey: 'CARREFOUR EXPR',
  merchantName: 'Carrefour Express',
  createdAt: '',
};

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  let name = 'Carrefour Express';
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (url === '/api/merchants/CARREFOUR%20EXPR') {
      if (init?.method === 'PUT') name = (JSON.parse(String(init.body)) as { name: string }).name;
      return json({ key: 'CARREFOUR EXPR', name, source: 'user', transactionCount: 52 });
    }
    if (url.startsWith('/api/accounts')) return json(accounts);
    if (url.startsWith('/api/envelopes')) return json(envelopes);
    return json([]);
  });
  vi.stubGlobal('fetch', fetchMock);
});

function renderDialog(transaction: Transaction) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <TransactionEditDialog transaction={transaction} onClose={vi.fn()} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('TransactionEditDialog', () => {
  it('montre le marchand en titre, le libellé brut une seule fois dans le champ libellé, et renomme le marchand pour toutes ses opérations', async () => {
    const user = userEvent.setup();
    renderDialog(expense);
    expect(screen.getByRole('heading', { name: 'Carrefour Express', hidden: true })).toBeInTheDocument();
    // Le libellé brut n'apparaît qu'une fois, dans le champ éditable du formulaire, pas sous le titre.
    expect(screen.getAllByDisplayValue(expense.label)).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Renommer', hidden: true }));
    expect(await screen.findByText(/52 opérations/)).toBeInTheDocument();
    const input = screen.getByLabelText('Nom du marchand');
    await user.clear(input);
    await user.type(input, 'Carrefour');
    await user.click(screen.getByRole('button', { name: 'Enregistrer le nom', hidden: true }));

    expect(fetchMock).toHaveBeenCalledWith('/api/merchants/CARREFOUR%20EXPR', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ name: 'Carrefour' }) }));
    expect(await screen.findByRole('heading', { name: 'Carrefour', hidden: true })).toBeInTheDocument();
  });

  it('Échap pendant le renommage annule et rend le focus à Renommer, sans soumettre ni fermer le dialogue', async () => {
    const user = userEvent.setup();
    renderDialog(expense);
    await user.click(screen.getByRole('button', { name: 'Renommer', hidden: true }));
    const input = await screen.findByLabelText('Nom du marchand');
    await user.clear(input);
    await user.type(input, 'Un autre nom');

    expect(fireEvent.keyDown(input, { key: 'Escape' })).toBe(false); // false : preventDefault() a été appelé

    expect(screen.queryByLabelText('Nom du marchand')).not.toBeInTheDocument();
    const renameButton = screen.getByRole('button', { name: 'Renommer', hidden: true });
    expect(renameButton).toHaveFocus();
    expect(screen.getByRole('dialog', { name: 'Carrefour Express', hidden: true })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/merchants/CARREFOUR%20EXPR', expect.objectContaining({ method: 'PUT' }));
  });

  it('un virement garde son titre et n’a pas de marchand à renommer', () => {
    renderDialog({ ...expense, kind: 'transfer', toAccountId: 2, label: 'Épargne', merchantKey: null, merchantName: null });
    expect(screen.getByRole('heading', { name: 'Modifier : virement', hidden: true })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Renommer', hidden: true })).not.toBeInTheDocument();
  });
});
