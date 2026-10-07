import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Transaction } from '@shared/schemas';
import { QuickEntry } from './QuickEntry';

const accounts = [
  { id: 1, name: 'Courant', initialBalance: 0, onBudget: true, bankAccountNumber: null, archived: false, createdAt: '' },
  { id: 2, name: 'Livret', initialBalance: 0, onBudget: false, bankAccountNumber: null, archived: false, createdAt: '' },
];
const envelopes = [
  { id: 10, name: 'Courses', color: '#4f8a5b', monthlyTarget: null, sortOrder: 0, archived: false, isSavings: false },
  { id: 11, name: 'Restos', color: '#c2703d', monthlyTarget: null, sortOrder: 1, archived: false, isSavings: false },
];

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
      if (url.startsWith('/api/accounts')) return json(accounts);
      if (url.startsWith('/api/envelopes')) return json(envelopes);
      // Règle de tri : tout libellé contenant "carrefour" va dans Courses.
      if (url.startsWith('/api/sorting-rules/test')) return json({ envelopeId: 10 });
      return json([]);
    }),
  );
});

function renderEntry(onSubmit = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <QuickEntry onSubmit={onSubmit} />
    </QueryClientProvider>,
  );
  return onSubmit;
}

const planned: Transaction = {
  id: 42,
  kind: 'expense',
  amount: 1457,
  label: 'MAIF',
  accountId: 1,
  toAccountId: null,
  envelopeId: 11,
  fromEnvelopeId: null,
  date: '2026-11-07',
  note: 'Assurance habitation',
  status: 'planned',
  recurringRuleId: 3,
  importId: null,
  fingerprint: null,
  fundingId: null,
  createdAt: '',
};

function renderEdit(onSubmit = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <QuickEntry mode="edit" initial={planned} onSubmit={onSubmit} footerStart={<button type="button">Supprimer</button>} />
    </QueryClientProvider>,
  );
  return onSubmit;
}

describe('QuickEntry', () => {
  it('modifie une opération existante sans changer son type', async () => {
    const onSubmit = renderEdit();
    await screen.findByRole('option', { name: 'Courant' });
    expect(screen.getByLabelText('Montant')).toHaveValue('14,57');
    expect(screen.getByLabelText('Libellé')).toHaveValue('MAIF');
    expect(screen.getByLabelText('Note')).toHaveValue('Assurance habitation');
    expect(await screen.findByRole('radio', { name: 'Restos' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByRole('radiogroup', { name: 'Type d’opération' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /en saisir une autre/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Supprimer' })).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText('Libellé'));
    await userEvent.type(screen.getByLabelText('Libellé'), 'MAIF habitation');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'expense', amount: 1457, label: 'MAIF habitation', envelopeId: 11, date: '2026-11-07', note: 'Assurance habitation' }),
      false,
    );
  });

  it('ne propose pas d’enveloppe d’après les règles en modification', async () => {
    renderEdit();
    await screen.findByRole('option', { name: 'Courant' });
    await userEvent.clear(screen.getByLabelText('Libellé'));
    await userEvent.type(screen.getByLabelText('Libellé'), 'Carrefour');
    // Au-delà du délai de saisie (200 ms) : en création, la règle serait déjà interrogée.
    await new Promise((r) => setTimeout(r, 300));
    const urls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
    expect(urls.some((u) => u.startsWith('/api/sorting-rules/test'))).toBe(false);
    expect(urls.some((u) => u.startsWith('/api/transactions'))).toBe(false);
    expect(screen.queryByText('proposée par tes règles')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Restos' })).toHaveAttribute('aria-checked', 'true');
  });

  it('propose l’enveloppe d’après les règles de tri, puis enregistre', async () => {
    const onSubmit = renderEntry();
    await screen.findByRole('option', { name: 'Courant' });
    await userEvent.type(screen.getByLabelText('Montant'), '12,5');
    await userEvent.type(screen.getByLabelText('Libellé'), 'Carrefour');
    expect(await screen.findByText('proposée par tes règles')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Courses' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('button', { name: /Enregistrer la dépense de 12,50/ }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ kind: 'expense', amount: 1250, label: 'Carrefour', accountId: 1, envelopeId: 10 }), false);
  });

  it('un choix explicite l’emporte, et « une autre » est signalé', async () => {
    const onSubmit = renderEntry();
    await screen.findByRole('radio', { name: 'Restos' });
    await userEvent.type(screen.getByLabelText('Montant'), '8');
    await userEvent.click(screen.getByRole('radio', { name: 'Restos' }));
    await userEvent.type(screen.getByLabelText('Libellé'), 'Carrefour city');
    await userEvent.click(screen.getByRole('button', { name: /Enregistrer et en saisir une autre/ }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ amount: 800, envelopeId: 11 }), true);
  });

  it('exige un montant et refuse un virement vers le même compte', async () => {
    const onSubmit = renderEntry();
    await screen.findByRole('option', { name: 'Courant' });
    await userEvent.type(screen.getByLabelText('Libellé'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Indique un montant')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: 'Virement' }));
    await userEvent.type(screen.getByLabelText('Montant'), '50');
    await userEvent.selectOptions(screen.getByLabelText('Compte destination'), '1');
    await userEvent.click(screen.getByRole('button', { name: /Enregistrer le virement/ }));
    expect(await screen.findByText('Les deux comptes doivent être différents')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
