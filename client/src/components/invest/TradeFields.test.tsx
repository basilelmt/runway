import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { emptyTrade, parseTrade, TradeFields, type TradeDraft } from './TradeFields';

describe('parseTrade', () => {
  it('accepte une quantité à virgule et renvoie le mouvement à envoyer', () => {
    const r = parseTrade({ side: 'buy', date: '2025-10-07', quantity: '5,04', amount: 3000_00, fees: 1_00 });
    expect(r).toEqual({ ok: true, trade: { side: 'buy', date: '2025-10-07', quantity: '5.04', amount: 3000_00, fees: 1_00 } });
  });

  it('signale les champs manquants', () => {
    const r = parseTrade({ ...emptyTrade(), quantity: '', amount: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toMatchObject({ quantity: 'Quantité invalide', amount: 'Montant manquant' });
  });
});

function Harness({ unit }: { unit: string }) {
  const [draft, setDraft] = useState<TradeDraft>({ ...emptyTrade(1_00), date: '2025-10-07' });
  return <TradeFields draft={draft} errors={{}} onChange={setDraft} unit={unit} />;
}

describe('TradeFields', () => {
  it('affiche le prix par part pendant la saisie', async () => {
    render(<Harness unit="part" />);
    await userEvent.type(screen.getByLabelText('Nombre de parts'), '4');
    await userEvent.type(screen.getByLabelText('Montant payé, hors frais'), '2000');
    expect(screen.getByText('Soit 500,00 € par part')).toBeInTheDocument();
  });

  it('libellés de vente et unité crypto', async () => {
    render(<Harness unit="BTC" />);
    await userEvent.click(screen.getByRole('radio', { name: 'Vente' }));
    expect(screen.getByLabelText('Quantité (BTC)')).toBeInTheDocument();
    expect(screen.getByLabelText('Montant reçu, hors frais')).toBeInTheDocument();
  });
});
