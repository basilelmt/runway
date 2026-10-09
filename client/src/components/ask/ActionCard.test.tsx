import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AskActionView } from '@shared/api-types';
import { today } from '@shared/dates';
import { ActionCard } from './ActionCard';

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function renderCard(action: AskActionView) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ActionCard action={action} />
    </QueryClientProvider>,
  );
}

const lastCall = () => {
  const [url, init] = fetchMock.mock.calls.at(-1)!;
  return { url, method: (init as RequestInit).method, body: JSON.parse(String((init as RequestInit).body)) };
};

describe('ActionCard', () => {
  it('range des dépenses avec la règle proposée, puis affiche Fait', async () => {
    renderCard({ type: 'sort', transactionIds: [3, 4], envelopeId: 10, envelopeName: 'Loisirs', rulePattern: 'UBER', count: 2, total: 20_00 });
    expect(screen.getByText(/Ranger 2 dépenses \(20,00\s€\) dans Loisirs/)).toBeInTheDocument();
    expect(screen.getByLabelText('Créer aussi la règle « UBER »')).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Appliquer' }));
    expect(await screen.findByText('Fait')).toBeInTheDocument();
    expect(lastCall()).toEqual({
      url: '/api/sorting/apply',
      method: 'POST',
      body: { assignments: [{ transactionId: 3, envelopeId: 10 }, { transactionId: 4, envelopeId: 10 }], rules: [{ pattern: 'UBER', envelopeId: 10 }] },
    });
  });

  it('range sans règle quand la case est décochée', async () => {
    renderCard({ type: 'sort', transactionIds: [3], envelopeId: 10, envelopeName: 'Loisirs', rulePattern: 'UBER', count: 1, total: 12_00 });
    expect(screen.getByText(/Ranger 1 dépense \(12,00\s€\) dans Loisirs/)).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Créer aussi la règle « UBER »'));
    await userEvent.click(screen.getByRole('button', { name: 'Appliquer' }));
    await screen.findByText('Fait');
    expect(lastCall().body.rules).toEqual([]);
  });

  it('déplace de l’argent entre enveloppes ou depuis Pas encore réparti', async () => {
    renderCard({ type: 'move', fromEnvelopeId: 5, fromName: 'Shopping', toEnvelopeId: 4, toName: 'Restos', amount: 50_00 });
    expect(screen.getByText(/Déplacer 50,00\s€ de Shopping vers Restos/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Appliquer' }));
    await screen.findByText('Fait');
    expect(lastCall()).toEqual({
      url: '/api/transactions',
      method: 'POST',
      body: { kind: 'allocation', date: today(), amount: 50_00, label: 'Répartition', note: null, accountId: null, toAccountId: null, envelopeId: 4, fromEnvelopeId: 5 },
    });
  });

  it('répartit depuis Pas encore réparti', () => {
    renderCard({ type: 'move', fromEnvelopeId: null, fromName: 'Pas encore réparti', toEnvelopeId: 4, toName: 'Restos', amount: 10_00 });
    expect(screen.getByText(/Répartir 10,00\s€ vers Restos/)).toBeInTheDocument();
  });

  it('change un budget mensuel en enregistrant le complément', async () => {
    renderCard({ type: 'budget', envelopeId: 4, envelopeName: 'Transports', monthlyTarget: 150_00, monthlyExtra: 110_00, charges: 40_00, current: 130_00 });
    expect(screen.getByText(/Passer Transports à 150,00\s€ par mois/)).toBeInTheDocument();
    expect(screen.getByText(/au lieu de 130,00\s€/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Appliquer' }));
    await screen.findByText('Fait');
    expect(lastCall()).toEqual({ url: '/api/envelopes/4', method: 'PATCH', body: { monthlyExtra: 110_00 } });
  });

  it('annonce le retrait d’un budget sans charge', () => {
    renderCard({ type: 'budget', envelopeId: 4, envelopeName: 'Restos', monthlyTarget: null, monthlyExtra: null, charges: 0, current: 180_00 });
    expect(screen.getByText('Retirer le budget mensuel de Restos')).toBeInTheDocument();
  });

  it('retirer le complément ramène le budget aux charges fixes', async () => {
    renderCard({ type: 'budget', envelopeId: 4, envelopeName: 'Transports', monthlyTarget: null, monthlyExtra: null, charges: 40_00, current: 130_00 });
    expect(screen.getByText(/Ramener Transports à ses charges fixes, 40,00\s€ par mois/)).toBeInTheDocument();
    expect(screen.getByText(/au lieu de 130,00\s€/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Appliquer' }));
    await screen.findByText('Fait');
    expect(lastCall()).toEqual({ url: '/api/envelopes/4', method: 'PATCH', body: { monthlyExtra: null } });
  });

  it('crée une charge fixe avec sa fréquence et son compte', async () => {
    const rule = {
      name: 'Spotify', kind: 'expense' as const, amount: 11_99, label: 'Spotify', accountId: 1, toAccountId: null, envelopeId: 6, fromEnvelopeId: null,
      frequency: 'monthly' as const, interval: 1, dayOfMonth: 4, startDate: '2026-11-04', endDate: null, active: true, triggersFunding: false, fundsNextMonth: false,
    };
    renderCard({ type: 'recurring', rule, accountName: 'Compte courant' });
    expect(screen.getByText(/Créer la charge fixe Spotify : 11,99\s€/)).toBeInTheDocument();
    expect(screen.getByText('Tous les mois le 4 · Compte courant')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Appliquer' }));
    await screen.findByText('Fait');
    expect(lastCall()).toEqual({ url: '/api/recurring-rules', method: 'POST', body: rule });
  });

  it('affiche l’erreur du serveur et reste applicable', async () => {
    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ error: 'Enveloppe archivée' }), { status: 400 }));
    renderCard({ type: 'budget', envelopeId: 4, envelopeName: 'Restos', monthlyTarget: 150_00, monthlyExtra: 150_00, charges: 0, current: 0 });
    await userEvent.click(screen.getByRole('button', { name: 'Appliquer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Enveloppe archivée');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Appliquer' })).toBeEnabled());
  });
});
