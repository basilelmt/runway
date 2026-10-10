import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Account, Envelope, Transaction } from '@shared/schemas';
import { signedAmount } from './signed';
import { TransactionRow } from './TransactionRow';

const courant: Account = { id: 1, name: 'Courant', initialBalance: 0, onBudget: true, bankAccountNumber: null, archived: false, createdAt: '' };
const livret: Account = { id: 2, name: 'Livret', initialBalance: 0, onBudget: false, bankAccountNumber: null, archived: false, createdAt: '' };
const courses: Envelope = { id: 10, name: 'Courses', color: '#4f8a5b', monthlyExtra: null, sortOrder: 0, archived: false, isSavings: false };
const accounts = new Map([[courant.id, courant], [livret.id, livret]]);
const envelopes = new Map([[courses.id, courses]]);

function tx(partial: Partial<Transaction> & Pick<Transaction, 'kind' | 'amount'>): Transaction {
  return {
    id: 1, date: '2026-03-01', label: 'op', note: null, accountId: 1, toAccountId: null, envelopeId: null, fromEnvelopeId: null,
    status: 'confirmed', recurringRuleId: null, importId: null, fingerprint: null, fundingId: null, merchantKey: null, merchantName: null, createdAt: '',
    ...partial,
  };
}

describe('signedAmount', () => {
  it('dépense négative, revenu positif, allocation neutre', () => {
    expect(signedAmount(tx({ kind: 'expense', amount: 1230 }))).toBe(-1230);
    expect(signedAmount(tx({ kind: 'income', amount: 1230 }))).toBe(1230);
    expect(signedAmount(tx({ kind: 'allocation', amount: 1230 }))).toBe(1230);
  });

  it('un transfert est négatif, sauf vu depuis le compte crédité', () => {
    const t = tx({ kind: 'transfer', amount: 500, accountId: 1, toAccountId: 2 });
    expect(signedAmount(t)).toBe(-500);
    expect(signedAmount(t, 1)).toBe(-500);
    expect(signedAmount(t, 2)).toBe(500);
  });
});

describe('TransactionRow', () => {
  it('affiche une dépense en négatif avec son enveloppe', () => {
    render(
      <ul>
        <TransactionRow transaction={tx({ kind: 'expense', amount: 6230, label: 'Carrefour', envelopeId: 10 })} accounts={accounts} envelopes={envelopes} />
      </ul>,
    );
    expect(screen.getByText('-62,30 €')).toBeInTheDocument();
    expect(screen.getByText('Courses')).toBeInTheDocument();
    expect(screen.getByText('Courant')).toBeInTheDocument();
  });

  it('affiche un revenu avec un plus et une dépense sans enveloppe comme à trier', () => {
    render(
      <ul>
        <TransactionRow transaction={tx({ id: 1, kind: 'income', amount: 200000, label: 'Salaire' })} accounts={accounts} envelopes={envelopes} />
        <TransactionRow transaction={tx({ id: 2, kind: 'expense', amount: 100, label: 'Inconnu' })} accounts={accounts} envelopes={envelopes} />
      </ul>,
    );
    expect(screen.getByText('+2 000,00 €')).toBeInTheDocument();
    expect(screen.getByText('Revenu')).toBeInTheDocument();
    expect(screen.getByText('À ranger')).toBeInTheDocument();
  });

  it('un revenu rangé dans une enveloppe (remboursement) affiche l’enveloppe comme une dépense', () => {
    render(
      <ul>
        <TransactionRow transaction={tx({ kind: 'income', amount: 4000, label: 'WERO DE MAX', envelopeId: 10 })} accounts={accounts} envelopes={envelopes} />
      </ul>,
    );
    expect(screen.getByText('Courses')).toBeInTheDocument();
    expect(screen.queryByText('Revenu')).not.toBeInTheDocument();
  });

  it('une dépense avec une avance ouverte porte la pastille Avance', () => {
    render(
      <ul>
        <TransactionRow transaction={tx({ kind: 'expense', amount: 8250, label: 'Bowling', envelopeId: 10 })} accounts={accounts} envelopes={envelopes} hasOpenAdvance />
      </ul>,
    );
    expect(screen.getByText('Avance')).toBeInTheDocument();
  });

  it('masque une note qui ne fait que répéter le libellé, garde une vraie note', () => {
    render(
      <ul>
        <TransactionRow transaction={tx({ id: 1, kind: 'expense', amount: 300, label: 'ACHAT CB Smovengo 03.10.26', note: 'ACHAT CB  Smovengo 03.10.26 CARTE NUMERO 089' })} accounts={accounts} envelopes={envelopes} />
        <TransactionRow transaction={tx({ id: 2, kind: 'expense', amount: 500, label: 'Restaurant', note: 'Anniversaire de Léa' })} accounts={accounts} envelopes={envelopes} />
      </ul>,
    );
    expect(screen.queryByText(/CARTE NUMERO 089/)).not.toBeInTheDocument();
    expect(screen.getByText('Anniversaire de Léa')).toBeInTheDocument();
  });

  it('montre le badge Prévue et le bouton Confirmer', () => {
    render(
      <ul>
        <TransactionRow transaction={tx({ kind: 'expense', amount: 80000, label: 'Loyer', status: 'planned' })} accounts={accounts} envelopes={envelopes} onConfirm={() => {}} />
      </ul>,
    );
    expect(screen.getByText('Prévue')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmer' })).toBeInTheDocument();
  });

  it('affiche un virement par le compte crédité, sans répéter le couple de comptes en dessous', () => {
    render(
      <ul>
        <TransactionRow
          transaction={tx({ kind: 'transfer', amount: 20000, label: 'VIREMENT PERMANENT POUR MR X COMPTE FR21 REFERENCE : 42', accountId: 1, toAccountId: 2 })}
          accounts={accounts}
          envelopes={envelopes}
        />
      </ul>,
    );
    expect(screen.getByText('Virement vers Livret')).toBeInTheDocument();
    expect(screen.queryByText(/REFERENCE/)).not.toBeInTheDocument();
    expect(screen.queryByText('Courant → Livret')).not.toBeInTheDocument();
  });

  it('vu depuis le compte crédité, affiche un virement par le compte débité', () => {
    render(
      <ul>
        <TransactionRow
          transaction={tx({ kind: 'transfer', amount: 20000, label: 'VIREMENT PERMANENT', accountId: 1, toAccountId: 2 })}
          accounts={accounts}
          envelopes={envelopes}
          viewAccountId={2}
        />
      </ul>,
    );
    expect(screen.getByText('Virement depuis Courant')).toBeInTheDocument();
  });

  it('affiche le nom du marchand, avec le libellé brut au survol', () => {
    render(
      <ul>
        <TransactionRow
          transaction={tx({ kind: 'expense', amount: 1250, label: 'ACHAT CB CARREFOUR EXPR 03.10.26', merchantKey: 'CARREFOUR EXPR', merchantName: 'Carrefour Express' })}
          accounts={accounts}
          envelopes={envelopes}
        />
      </ul>,
    );
    expect(screen.getByText('Carrefour Express')).toHaveAttribute('title', 'ACHAT CB CARREFOUR EXPR 03.10.26');
    expect(screen.queryByText('ACHAT CB CARREFOUR EXPR 03.10.26')).not.toBeInTheDocument();
  });
});
