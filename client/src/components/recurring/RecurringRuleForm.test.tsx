import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecurringRule } from '@shared/schemas';
import { RecurringRuleForm } from './RecurringRuleForm';

const accounts = [{ id: 1, name: 'Courant', initialBalance: 0, onBudget: true, bankAccountNumber: null, archived: false, createdAt: '' }];
const envelopes = [
  { id: 10, name: 'Logement', color: '#4f8a5b', monthlyExtra: null, sortOrder: 0, archived: false, isSavings: false },
  { id: 11, name: 'Restos', color: '#c2703d', monthlyExtra: null, sortOrder: 1, archived: false, isSavings: false },
];
const rule: RecurringRule = {
  id: 5,
  name: 'Loyer',
  kind: 'expense',
  amount: 98600,
  label: 'Loyer Max',
  accountId: 1,
  toAccountId: null,
  envelopeId: 10,
  fromEnvelopeId: null,
  frequency: 'monthly',
  interval: 1,
  dayOfMonth: 1,
  startDate: '2026-10-01',
  endDate: null,
  lastGeneratedDate: null,
  active: true,
  triggersFunding: false,
  fundsNextMonth: false,
};

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const body = url.startsWith('/api/accounts') ? accounts : url.startsWith('/api/envelopes') ? envelopes : [];
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  );
});

function renderForm(onSubmit = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <RecurringRuleForm initial={rule} onSubmit={onSubmit} onCancel={vi.fn()} />
    </QueryClientProvider>,
  );
  return onSubmit;
}

describe('RecurringRuleForm', () => {
  it('résume la fréquence et affiche une fin facultative', async () => {
    renderForm();
    expect(await screen.findByText('Tous les mois le 1er, à partir du 1 oct. 2026')).toBeInTheDocument();
    expect(screen.getByLabelText('Montant')).toHaveValue('986,00');
    expect(screen.getByRole('button', { name: 'Jusqu’au' })).toHaveTextContent('Sans fin');
    expect(screen.getByRole('group', { name: 'Quand' })).toBeInTheDocument();
  });

  it('change d’enveloppe en pastilles et enregistre', async () => {
    const onSubmit = renderForm();
    await screen.findByRole('option', { name: 'Courant' });
    await userEvent.click(screen.getByRole('radio', { name: 'Restos' }));
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: 'Loyer', amount: 98600, envelopeId: 11, accountId: 1, dayOfMonth: 1, endDate: null }));
  });

  it('un revenu peut déclencher la répartition, versé pour le mois suivant', async () => {
    const onSubmit = renderForm();
    await screen.findByRole('option', { name: 'Courant' });
    expect(screen.queryByLabelText('Déclenche la répartition')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Revenu' }));
    expect(screen.queryByLabelText('Versé pour le mois suivant')).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Déclenche la répartition'));
    await userEvent.click(screen.getByLabelText('Versé pour le mois suivant'));
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ kind: 'income', triggersFunding: true, fundsNextMonth: true }));
  });

  it('repasser en dépense retire le déclenchement', async () => {
    const onSubmit = renderForm();
    await screen.findByRole('option', { name: 'Courant' });
    await userEvent.click(screen.getByRole('radio', { name: 'Revenu' }));
    await userEvent.click(screen.getByLabelText('Déclenche la répartition'));
    await userEvent.click(screen.getByRole('radio', { name: 'Dépense' }));
    expect(screen.queryByLabelText('Déclenche la répartition')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ kind: 'expense', triggersFunding: false, fundsNextMonth: false }));
  });
});
