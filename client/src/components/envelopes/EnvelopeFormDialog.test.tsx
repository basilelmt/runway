import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Envelope } from '@shared/schemas';
import type { RecurringRuleView } from '@/api/hooks';
import { ToastProvider } from '@/components/ui';
import { EnvelopeFormDialog } from './EnvelopeFormDialog';

const transports: Envelope = { id: 5, name: 'Transports', color: '#3f6fae', monthlyExtra: 90_00, sortOrder: 0, archived: false, isSavings: false };

const charge: Omit<RecurringRuleView, 'id' | 'name' | 'amount' | 'monthlyEquivalent'> = {
  kind: 'expense',
  label: 'PRLV',
  accountId: 1,
  toAccountId: null,
  envelopeId: 5,
  fromEnvelopeId: null,
  frequency: 'monthly',
  interval: 1,
  dayOfMonth: 5,
  startDate: '2026-01-05',
  endDate: null,
  lastGeneratedDate: null,
  active: true,
  triggersFunding: false,
  fundsNextMonth: false,
  nextDate: null,
};

const rules: RecurringRuleView[] = [
  { ...charge, id: 1, name: 'Navigo', amount: 40_00, monthlyEquivalent: 40_00 },
  { ...charge, id: 2, name: 'Cotisation compte LBP', amount: 10_80, interval: 3, monthlyEquivalent: 3_60 },
  // Ignorées : en pause, terminée, autre enveloppe, revenu.
  { ...charge, id: 3, name: 'Vélib', amount: 3_10, active: false, monthlyEquivalent: 3_10 },
  { ...charge, id: 4, name: 'Ancien forfait', amount: 20_00, endDate: '2020-01-31', monthlyEquivalent: 20_00 },
  { ...charge, id: 5, name: 'Loyer', amount: 986_00, envelopeId: 6, monthlyEquivalent: 986_00 },
  { ...charge, id: 6, name: 'Remboursement', kind: 'income', amount: 15_00, monthlyEquivalent: 15_00 },
];

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === '/api/recurring-rules') return new Response(JSON.stringify(rules), { status: 200 });
    return new Response(JSON.stringify({ ...transports, ...JSON.parse(String(init?.body ?? '{}')) }), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function renderForm(envelope?: Envelope) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <EnvelopeFormDialog open envelope={envelope} onClose={vi.fn()} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const chargeLines = async () => {
  const list = await screen.findByRole('list', { name: 'Charges de l’enveloppe', hidden: true });
  return within(list).getAllByRole('listitem', { hidden: true });
};

describe('EnvelopeFormDialog', () => {
  it('détaille les charges sous le complément, avec le rythme des charges non mensuelles', async () => {
    renderForm(transports);
    expect((await chargeLines()).map((li) => li.textContent)).toEqual([
      'Navigo 40,00 €',
      'Cotisation compte LBP 3,60 € (10,80 € tous les 3 mois)',
      '+ 90,00 € = 133,60 € par mois',
    ]);
    expect(screen.getByLabelText('En plus des charges')).toHaveValue('90,00');
    expect(screen.queryByLabelText('Budget mensuel')).not.toBeInTheDocument();
    expect(screen.queryByText(/Ce que tu prévois d’y mettre chaque mois/)).not.toBeInTheDocument();
  });

  it('met le total à jour pendant la frappe et enregistre le complément', async () => {
    renderForm(transports);
    await chargeLines();
    const input = screen.getByLabelText('En plus des charges');
    await userEvent.clear(input);
    await userEvent.type(input, '100');
    expect((await chargeLines()).at(-1)).toHaveTextContent('+ 100,00 € = 143,60 € par mois');

    await userEvent.click(await screen.findByRole('button', { name: 'Enregistrer', hidden: true }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/envelopes/5', expect.objectContaining({ method: 'PATCH' })));
    const [, init] = fetchMock.mock.calls.find(([url]) => url === '/api/envelopes/5')!;
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ name: 'Transports', color: '#3f6fae', monthlyExtra: 100_00, isSavings: false });
  });

  it('sans complément, le total est celui des charges', async () => {
    renderForm({ ...transports, monthlyExtra: null });
    expect((await chargeLines()).at(-1)).toHaveTextContent('= 43,60 € par mois');
    expect((await chargeLines()).at(-1)).not.toHaveTextContent('+');
  });

  it('sans charge, garde le champ « Budget mensuel » et son aide', async () => {
    renderForm({ ...transports, id: 7 });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/recurring-rules', expect.anything()));
    expect(screen.getByLabelText('Budget mensuel')).toHaveValue('90,00');
    expect(screen.queryByLabelText('En plus des charges')).not.toBeInTheDocument();
    expect(screen.getByText(/Ce que tu prévois d’y mettre chaque mois/)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Charges de l’enveloppe', hidden: true })).not.toBeInTheDocument();
  });

  it('une nouvelle enveloppe n’a pas encore de charges, le champ reste « Budget mensuel »', () => {
    renderForm();
    expect(screen.getByLabelText('Budget mensuel')).toHaveValue('');
    expect(screen.queryByLabelText('En plus des charges')).not.toBeInTheDocument();
    expect(screen.getByText(/Ce que tu prévois d’y mettre chaque mois/)).toBeInTheDocument();
  });
});
