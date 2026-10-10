import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnvelopeWithBalance } from '@shared/api-types';
import { EnvelopeDetailDialog } from './EnvelopeDetailDialog';

const sorties: EnvelopeWithBalance = {
  id: 14,
  name: 'Sorties',
  color: '#9a4f9a',
  monthlyExtra: 220_00,
  monthlyCharges: 0,
  monthlyBudget: 220_00,
  sortOrder: 0,
  archived: false,
  isSavings: false,
  balance: 159_80,
  allocatedThisMonth: 220_00,
  spentThisMonth: 60_20,
  toFundThisMonth: 0,
};

const expense = (id: number, date: string, label: string, amount: number) => ({
  id,
  date,
  label,
  amount,
  kind: 'expense',
  status: 'confirmed',
  accountId: 1,
  envelopeId: 14,
  merchantKey: null,
  merchantName: null,
  note: null,
  splits: [],
});

const income = (id: number, date: string, label: string, amount: number) => ({
  id,
  date,
  label,
  amount,
  kind: 'income',
  status: 'confirmed',
  accountId: 1,
  envelopeId: 14,
  merchantKey: null,
  merchantName: null,
  note: null,
  splits: [],
});

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

/** Réponses retenues jusqu'à ce que le test les libère, pour observer l'état de chargement. */
let pending: (() => void)[] = [];
const fetchMock = vi.fn((url: string) => {
  const september = url.includes('from=2026-09-01');
  const body = september ? [expense(3, '2026-09-12', 'Cinéma', 12_00)] : [expense(1, '2026-10-05', 'Bolt', 13_90), expense(2, '2026-10-02', 'Occhio', 15_00)];
  return new Promise<Response>((resolve) => pending.push(() => resolve(json(body))));
});
const release = async () => {
  const waiting = pending;
  pending = [];
  waiting.forEach((r) => r());
  await new Promise((r) => setTimeout(r, 0));
};

beforeEach(() => {
  pending = [];
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-09T12:00:00'));
});
afterEach(() => vi.useRealTimers());

function renderDialog() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <EnvelopeDetailDialog envelope={sorties} onClose={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return screen.getByRole('dialog', { name: 'Sorties', hidden: true });
}

describe('EnvelopeDetailDialog', () => {
  it('n’affiche pas de faux montant pendant le chargement, puis les dépenses', async () => {
    const dialog = renderDialog();
    const stats = dialog.querySelector('dl')!;
    expect(within(stats).queryByText('0,00 €')).not.toBeInTheDocument();
    expect(within(stats).getByText('159,80 €')).toBeInTheDocument();

    await release();
    expect(await within(dialog).findByText('2 dépenses')).toBeInTheDocument();
    expect(within(stats).getByText('28,90 €')).toBeInTheDocument();
  });

  it('garde la liste affichée pendant le chargement d’une autre période', async () => {
    const dialog = renderDialog();
    await release();
    expect(await within(dialog).findByText('Bolt')).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('radio', { name: 'Mois dernier', hidden: true }));
    // La période d'avant reste visible tant que la nouvelle n'est pas arrivée.
    expect(within(dialog).getByText('Bolt')).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Voir dans Opérations', hidden: true })).toHaveAttribute('href', '/operations?envelope=14&period=last-month');

    await release();
    expect(await within(dialog).findByText('Cinéma')).toBeInTheDocument();
    expect(within(dialog).queryByText('Bolt')).not.toBeInTheDocument();
  });

  it('déduit un remboursement rangé dans l’enveloppe du dépensé affiché', async () => {
    fetchMock.mockImplementationOnce((_url: string) =>
      Promise.resolve(json([expense(1, '2026-10-05', 'Bolt', 13_90), expense(2, '2026-10-02', 'Occhio', 15_00), income(3, '2026-10-03', 'WERO DE MAX', 5_00)])),
    );
    const dialog = renderDialog();
    const stats = dialog.querySelector('dl')!;
    await release();

    expect(await within(dialog).findByText('WERO DE MAX')).toBeInTheDocument();
    expect(within(dialog).getByText('Remboursement')).toBeInTheDocument();
    // 13,90 + 15,00 - 5,00 = 23,90 €.
    expect(within(stats).getByText('23,90 €')).toBeInTheDocument();
  });
});
