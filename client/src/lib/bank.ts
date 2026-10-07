import type { BankSyncState } from '@shared/api-types';
import { plural } from './format';

const DAY_MS = 86_400_000;
/** Au-delà, la synchronisation est considérée en retard (elle tourne normalement à chaque ouverture). */
export const SYNC_STALE_MS = DAY_MS;
/** Le consentement bancaire est signalé quand il expire dans moins de ce nombre de jours. */
export const CONSENT_WARNING_DAYS = 7;

export type BankSyncTodo = { tone: 'alert' | 'normal'; text: string };

/** Ce qu'il faut signaler sur la synchronisation bancaire, ou null si tout va bien (ou si elle n'est pas utilisée). */
export function bankSyncTodo(state: BankSyncState, now: Date): BankSyncTodo | null {
  if (!state.configured) return null;
  const connection = state.connections.filter((c) => c.status === 'active' || c.status === 'expired').at(-1);
  if (!connection) return null;

  if (connection.status === 'expired') {
    return { tone: 'alert', text: 'Le consentement bancaire a expiré : renouvelle-le pour reprendre la synchronisation' };
  }

  const last = connection.lastSyncAt ? new Date(connection.lastSyncAt) : null;
  const age = last ? now.getTime() - last.getTime() : Number.POSITIVE_INFINITY;
  if (age > SYNC_STALE_MS) {
    const cause = connection.lastError ? ` : ${connection.lastError}` : '';
    const text = last ? `Pas de synchronisation bancaire depuis ${plural(Math.floor(age / DAY_MS), 'jour')}` : 'La synchronisation bancaire n’a encore jamais abouti';
    return { tone: 'alert', text: `${text}${cause}` };
  }

  if (connection.validUntil) {
    const days = Math.floor((new Date(connection.validUntil).getTime() - now.getTime()) / DAY_MS);
    if (days <= CONSENT_WARNING_DAYS) {
      return { tone: 'normal', text: `Le consentement bancaire expire ${days <= 0 ? 'aujourd’hui' : `dans ${plural(days, 'jour')}`} : pense à le renouveler` };
    }
  }
  return null;
}
