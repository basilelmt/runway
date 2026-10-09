import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HoldingView } from '@shared/api-types';
import { ToastProvider } from '@/components/ui';
import { HoldingDialog } from './HoldingDialog';

const holding: HoldingView = {
  id: 1,
  platform: 'trade_republic',
  ticker: 'SXR8.DE',
  name: 'iShares Core S&P 500',
  source: 'manual',
  quantity: '5',
  costBasis: 3001_00,
  realized: 0,
  price: { eur: 720, date: '2026-10-07', stale: false },
  value: 3600_00,
  gain: 599_00,
  gainPct: 599 / 3001,
  dayChangePct: 0.012,
  unpricedQuantity: null,
  missingQuantity: null,
  trades: [{ id: 7, date: '2026-03-02', side: 'buy', quantity: '5', amount: 3000_00, fees: 1_00, source: 'manual' }],
};

function renderDialog(onClose = () => {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <HoldingDialog holding={holding} onClose={onClose} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('HoldingDialog', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('supprimer un mouvement passe par une confirmation', async () => {
    renderDialog();
    await userEvent.click(screen.getByRole('button', { name: /^Actions du mouvement du 2 mars/, hidden: true }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Supprimer', hidden: true }));
    const confirm = screen.getByRole('dialog', { name: 'Supprimer ce mouvement ?', hidden: true });
    expect(confirm).toHaveTextContent(/Achat du 2 mars.* : 5 parts pour 3\s000,00\s€/);
    await userEvent.click(within(confirm).getByRole('button', { name: 'Annuler', hidden: true }));
    expect(screen.queryByRole('dialog', { name: 'Supprimer ce mouvement ?', hidden: true })).not.toBeInTheDocument();
  });

  it('supprimer la position passe par une confirmation', async () => {
    renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer la position', hidden: true }));
    expect(screen.getByRole('dialog', { name: 'Supprimer la position ?', hidden: true })).toHaveTextContent('La position et ses 1 mouvements seront effacés.');
  });

  it('referme la confirmation une fois la position supprimée', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    const onClose = vi.fn();
    renderDialog(onClose);
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer la position', hidden: true }));
    const confirm = screen.getByRole('dialog', { name: 'Supprimer la position ?', hidden: true });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Supprimer', hidden: true }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith('/api/invest/holdings/1', expect.objectContaining({ method: 'DELETE' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Supprimer la position ?', hidden: true })).not.toBeInTheDocument());
  });
});
