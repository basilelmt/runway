import type { AnySignal } from '@shared/api-types';
import { formatDateShort } from '@shared/dates';
import { formatEuros } from '@shared/money';

/** « 4 fois » ou « 2,5 fois », arrondi à une décimale. */
function formatMultiple(multiple: number): string {
  const rounded = Math.round(multiple * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace('.', ',');
  return `${text} fois`;
}

/** Phrase courte d'un signal, affichée dans sa ligne sur l'Accueil. */
export function signalPhrase(signal: AnySignal): string {
  switch (signal.kind) {
    case 'unusual_expense': {
      const { merchantName, amount, median } = signal.payload;
      return median === null
        ? `${merchantName} : ${formatEuros(amount)}, jamais vu chez ce marchand`
        : `${merchantName} : ${formatEuros(amount)}, ${formatMultiple(amount / median)} ta dépense habituelle`;
    }
    case 'new_recurring':
      return `${signal.payload.merchantName} revient tous les mois, autour de ${formatEuros(signal.payload.amount)}`;
    case 'price_change':
      return `${signal.payload.ruleName} passe de ${formatEuros(signal.payload.oldAmount)} à ${formatEuros(signal.payload.newAmount)}`;
    case 'missing_charge':
      return `${signal.payload.label} de ${formatEuros(signal.payload.amount)} prévu le ${formatDateShort(signal.payload.date)} n’est pas arrivé`;
    case 'consent_expiring':
      return `L’accès à ${signal.payload.aspspName} expire le ${formatDateShort(signal.payload.validUntil.slice(0, 10))}`;
    case 'sync_error':
      return `La synchronisation ${signal.payload.aspspName} est en échec${signal.payload.lastError ? ` : ${signal.payload.lastError}` : ''}`;
  }
}

/** Lien de l'action principale, pour les signaux dont l'action est une navigation plutôt qu'une mutation. */
export function signalHref(signal: AnySignal): string | null {
  switch (signal.kind) {
    case 'unusual_expense':
      return `/operations?q=${encodeURIComponent(signal.payload.merchantName)}&period=all`;
    case 'missing_charge':
      return '/operations?status=planned&period=all';
    case 'sync_error':
      return '/reglages/banque';
    default:
      return null;
  }
}
