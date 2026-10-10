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
    case 'consent_expiring':
      return `L’accès à ${signal.payload.aspspName} expire le ${formatDateShort(signal.payload.validUntil.slice(0, 10))}`;
    case 'sync_error':
      return `La synchro ${signal.payload.aspspName} échoue depuis le ${formatDateShort(signal.payload.since.slice(0, 10))}`;
  }
}

/** Texte secondaire d'un signal, sous la phrase principale (le message d'erreur brut de la synchro, par exemple). */
export function signalMeta(signal: AnySignal): string | null {
  return signal.kind === 'sync_error' ? signal.payload.lastError : null;
}

/** Lien de l'action principale, pour les signaux dont l'action est une navigation plutôt qu'une mutation. */
export function signalHref(signal: AnySignal): string | null {
  switch (signal.kind) {
    case 'unusual_expense':
      return `/operations?q=${encodeURIComponent(signal.payload.merchantName)}&period=all`;
    case 'sync_error':
      return '/reglages/banque';
    default:
      return null;
  }
}
