import type { BankSyncState } from '@shared/api-types';
import { plural } from './format';

const DAY_MS = 86_400_000;
/** Le consentement bancaire est signalé quand il expire dans moins de ce nombre de jours. */
export const CONSENT_WARNING_DAYS = 7;

export type BankSyncTodo = { tone: 'alert' | 'normal'; text: string };

/**
 * Ce qu'il faut signaler sur la synchronisation bancaire, ou null si tout va bien (ou si elle n'est pas utilisée).
 * Les échecs de synchro (`lastError`, retard prolongé) ne sont plus traités ici : le signal `sync_error`
 * les reprend après 2 échecs consécutifs ou 24 h sans synchro réussie. Ce bandeau ne garde que l'état en cours :
 * consentement expiré ou qui approche de l'expiration.
 */
export function bankSyncTodo(state: BankSyncState, now: Date): BankSyncTodo | null {
  if (!state.configured) return null;
  const connection = state.connections.filter((c) => c.status === 'active' || c.status === 'expired').at(-1);
  if (!connection) return null;

  if (connection.status === 'expired') {
    return { tone: 'alert', text: 'Le consentement bancaire a expiré : renouvelle-le pour reprendre la synchronisation' };
  }

  if (connection.validUntil) {
    const days = Math.floor((new Date(connection.validUntil).getTime() - now.getTime()) / DAY_MS);
    if (days <= CONSENT_WARNING_DAYS) {
      return { tone: 'normal', text: `Le consentement bancaire expire ${days <= 0 ? 'aujourd’hui' : `dans ${plural(days, 'jour')}`} : pense à le renouveler` };
    }
  }
  return null;
}
