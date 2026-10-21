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
let lastPut: unknown;
beforeEach(() => {
  let name = 'Carrefour Express';
  let description = 'Supérette de quartier';
  lastPut = undefined;
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (url === '/api/merchants/CARREFOUR%20EXPR') {
      if (init?.method === 'PUT') {
        lastPut = JSON.parse(String(init.body));
        name = (lastPut as { name: string }).name;
        description = (lastPut as { description?: string }).description ?? description;
      }
      return json({
        key: 'CARREFOUR EXPR',
        name,
        source: 'user',
        transactionCount: 52,
        description,
        descriptionSource: 'claude',
        describedAt: '2026-10-20T10:00:00Z',
        total12Months: -4500,
        firstDate: '2025-03-01',
      });
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

    // « Modifier le marchand » est sur la ligne du titre, dans l'en-tête du dialogue, pas dans le corps.
    const dialog = screen.getByRole('dialog', { name: 'Carrefour Express', hidden: true });
    const renameButton = screen.getByRole('button', { name: 'Modifier le marchand', hidden: true });
    expect(dialog.querySelector('header')!.contains(renameButton)).toBe(true);
    // Quand un long titre le pousse sur sa propre ligne, son icône doit retomber sous le titre, pas sous son rembourrage.
    expect(renameButton.className).toMatch(/renameButton/);

    await user.click(renameButton);
    expect(await screen.findByText(/52 opérations/)).toBeInTheDocument();
    const input = screen.getByLabelText('Nom du marchand');
    await user.clear(input);
    await user.type(input, 'Carrefour');
    await user.click(screen.getByRole('button', { name: 'Enregistrer le marchand', hidden: true }));

    expect(lastPut).toEqual({ name: 'Carrefour', description: 'Supérette de quartier' });
    expect(await screen.findByRole('heading', { name: 'Carrefour', hidden: true })).toBeInTheDocument();
  });

  it('modifie nom et description du marchand', async () => {
    renderDialog({ ...expense, status: 'planned' });
    await userEvent.click(await screen.findByRole('button', { name: 'Modifier le marchand' }));
    const description = screen.getByLabelText('Description');
    expect(description).toHaveValue('Supérette de quartier');
    await userEvent.clear(description);
    await userEvent.type(description, 'Supérette, Paris 11e');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le marchand' }));
    expect(lastPut).toEqual({ name: 'Carrefour Express', description: 'Supérette, Paris 11e' });
  });

  it('Échap pendant le renommage annule et rend le focus à Modifier le marchand, sans soumettre ni fermer le dialogue', async () => {
    const user = userEvent.setup();
    renderDialog(expense);
    await user.click(screen.getByRole('button', { name: 'Modifier le marchand', hidden: true }));
    const input = await screen.findByLabelText('Nom du marchand');
    await user.clear(input);
    await user.type(input, 'Un autre nom');

    expect(fireEvent.keyDown(input, { key: 'Escape' })).toBe(false); // false : preventDefault() a été appelé

    expect(screen.queryByLabelText('Nom du marchand')).not.toBeInTheDocument();
    const renameButton = screen.getByRole('button', { name: 'Modifier le marchand', hidden: true });
    expect(renameButton).toHaveFocus();
    expect(screen.getByRole('dialog', { name: 'Carrefour Express', hidden: true })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/merchants/CARREFOUR%20EXPR', expect.objectContaining({ method: 'PUT' }));
  });

  it('un virement garde son titre et n’a pas de marchand à renommer', () => {
    renderDialog({ ...expense, kind: 'transfer', toAccountId: 2, label: 'Épargne', merchantKey: null, merchantName: null });
    expect(screen.getByRole('heading', { name: 'Modifier : virement', hidden: true })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Modifier le marchand', hidden: true })).not.toBeInTheDocument();
  });
});
