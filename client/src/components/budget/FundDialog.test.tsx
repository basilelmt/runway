import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { EnvelopeWithBalance } from '@shared/api-types';
import { ToastProvider } from '@/components/ui';
import { FundDialog } from './FundDialog';

const base = { archived: false, isSavings: false, balance: 0, allocatedThisMonth: 0, spentThisMonth: 0 };
const envelopes: EnvelopeWithBalance[] = [
  // Budget venu d'une charge fixe, sans complément.
  { ...base, id: 10, name: 'Courses', color: '#4f8a5b', monthlyExtra: null, monthlyCharges: 15000, monthlyBudget: 15000, sortOrder: 0, toFundThisMonth: 15000 },
  { ...base, id: 11, name: 'Restos', color: '#c2703d', monthlyExtra: null, monthlyCharges: 0, monthlyBudget: 0, sortOrder: 1, toFundThisMonth: 0 },
];

describe('FundDialog', () => {
  it('garde le récapitulatif et le bouton dans le pied du dialogue', async () => {
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <FundDialog open onClose={vi.fn()} envelopes={envelopes} toAllocate={20000} />
        </ToastProvider>
      </QueryClientProvider>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Répartir l’argent du mois', hidden: true });
    const footer = dialog.querySelector('footer')!;
    expect(await within(footer).findByText('À répartir')).toBeInTheDocument();
    expect(within(footer).getByRole('button', { name: /Répartir 150,00/, hidden: true })).toBeInTheDocument();
    expect(within(footer).getByText('Restera non réparti')).toBeInTheDocument();
    expect(screen.getByText('il manque 150,00 € sur 150,00 €')).toBeInTheDocument();
    expect(screen.getByText('sans budget mensuel')).toBeInTheDocument();
  });
});
