import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TransactionForm } from './TransactionForm';

const accounts = [
  { id: 1, name: 'Courant', initialBalance: 0, onBudget: true, bankAccountNumber: null, archived: false, createdAt: '' },
  { id: 2, name: 'Livret', initialBalance: 0, onBudget: false, bankAccountNumber: null, archived: false, createdAt: '' },
];

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const body = url.startsWith('/api/accounts') ? accounts : [];
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  );
});

function renderForm(onSubmit = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <TransactionForm onSubmit={onSubmit} />
    </QueryClientProvider>,
  );
  return onSubmit;
}

describe('TransactionForm', () => {
  it('refuse un transfert vers le même compte et affiche le message', async () => {
    const onSubmit = renderForm();
    await userEvent.click(screen.getByRole('radio', { name: 'Virement' }));
    await userEvent.type(screen.getByLabelText('Montant'), '10');
    await userEvent.type(screen.getByLabelText('Libellé'), 'Épargne');
    const from = await screen.findByLabelText('Depuis le compte');
    await userEvent.selectOptions(from, '1');
    await userEvent.selectOptions(screen.getByLabelText('Vers le compte'), '1');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Les deux comptes doivent être différents')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('soumet une dépense sans enveloppe', async () => {
    const onSubmit = renderForm();
    await screen.findByRole('option', { name: 'Courant' });
    await userEvent.type(screen.getByLabelText('Montant'), '12,30');
    await userEvent.type(screen.getByLabelText('Libellé'), 'Boulangerie');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ kind: 'expense', amount: 1230, label: 'Boulangerie', accountId: 1, envelopeId: null }));
  });

  it('signale un montant manquant', async () => {
    const onSubmit = renderForm();
    await userEvent.type(screen.getByLabelText('Libellé'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Montant requis')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
