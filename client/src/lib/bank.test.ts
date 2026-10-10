import { describe, expect, it } from 'vitest';
import type { BankConnectionView, BankSyncState } from '@shared/api-types';
import { bankSyncTodo } from './bank';

const now = new Date('2026-10-06T12:00:00Z');

function state(connection: Partial<BankConnectionView> | null, configured = true): BankSyncState {
  return {
    configured,
    redirectUrl: '',
    syncStartByAccount: {},
    connections: connection
      ? [{ id: 1, aspspName: 'La Banque Postale', status: 'active', validUntil: '2027-04-02T00:00:00Z', lastSyncAt: '2026-10-06T08:00:00Z', lastError: null, accounts: [], ...connection }]
      : [],
  };
}

describe('bankSyncTodo', () => {
  it('ne dit rien quand la synchro est récente, ou quand elle n’est pas utilisée', () => {
    expect(bankSyncTodo(state({}), now)).toBeNull();
    expect(bankSyncTodo(state(null), now)).toBeNull();
    expect(bankSyncTodo(state({ lastSyncAt: '2026-01-01T00:00:00Z' }, false), now)).toBeNull();
    expect(bankSyncTodo(state({ status: 'revoked', lastSyncAt: '2026-01-01T00:00:00Z' }), now)).toBeNull();
  });

  it('ne dit plus rien d’un simple retard ou d’une erreur de synchro : c’est repris par le signal sync_error', () => {
    expect(bankSyncTodo(state({ lastSyncAt: '2026-10-03T09:00:00Z' }), now)).toBeNull();
    expect(bankSyncTodo(state({ lastSyncAt: '2026-10-05T09:00:00Z', lastError: 'Banque indisponible' }), now)).toBeNull();
    expect(bankSyncTodo(state({ lastSyncAt: null }), now)).toBeNull();
  });

  it('signale un consentement expiré ou bientôt expiré', () => {
    expect(bankSyncTodo(state({ status: 'expired' }), now)?.text).toContain('a expiré');
    expect(bankSyncTodo(state({ validUntil: '2026-10-10T12:00:00Z' }), now)).toEqual({ tone: 'normal', text: 'Le consentement bancaire expire dans 4 jours : pense à le renouveler' });
  });
});
