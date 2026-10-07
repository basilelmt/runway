import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AllocationForm } from './AllocationForm';

const envelopes = [
  { id: 10, name: 'Courses', color: '#4f8a5b', monthlyTarget: null, sortOrder: 0, archived: false, isSavings: false },
  { id: 11, name: 'Restos', color: '#c2703d', monthlyTarget: null, sortOrder: 1, archived: false, isSavings: false },
];

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => new Response(JSON.stringify(url.startsWith('/api/envelopes') ? envelopes : []), { status: 200 })),
  );
});

function renderForm(onSubmit = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <AllocationForm submitLabel="Ajouter" onSubmit={onSubmit} onCancel={vi.fn()} />
    </QueryClientProvider>,
  );
  return onSubmit;
}

describe('AllocationForm', () => {
  it('répartit depuis « Pas encore réparti » vers une enveloppe', async () => {
    const onSubmit = renderForm();
    const to = await screen.findByRole('radiogroup', { name: 'Vers' });
    await userEvent.type(screen.getByLabelText('Montant'), '50');
    await userEvent.click(within(to).getByRole('radio', { name: 'Courses' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ kind: 'allocation', amount: 5000, fromEnvelopeId: null, envelopeId: 10, accountId: null, label: 'Répartition' }));
  });

  it('exige une enveloppe de destination et un montant', async () => {
    const onSubmit = renderForm();
    await screen.findByRole('radiogroup', { name: 'Vers' });
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    expect(await screen.findByText('Indique un montant')).toBeInTheDocument();
    expect(screen.getByText('Enveloppe requise')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('refuse deux enveloppes identiques', async () => {
    const onSubmit = renderForm();
    const from = await screen.findByRole('radiogroup', { name: 'De' });
    await userEvent.type(screen.getByLabelText('Montant'), '20');
    await userEvent.click(within(from).getByRole('radio', { name: 'Restos' }));
    await userEvent.click(within(screen.getByRole('radiogroup', { name: 'Vers' })).getByRole('radio', { name: 'Restos' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    expect(await screen.findByText('Les deux enveloppes doivent être différentes')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
