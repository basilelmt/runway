import { addDays, compareISODate, fromParts, isValidISODate, type ISODate } from '@shared/dates';

/** Au-delà, une date du libellé n'est plus crédible comme date d'achat (paiement différé, carte étrangère comprise). */
export const CARD_DEBIT_MAX_DELAY_DAYS = 31;

/**
 * Date d'achat d'un paiement par carte, lue dans le libellé (« ACHAT CB SNCF 13.10.26 CARTE NUMERO 089 ») ;
 * la banque débite souvent plusieurs jours après. `null` hors paiement carte, sans date lisible,
 * ou si la date lue est après le débit ou plus d'un mois avant.
 */
export function cardPaymentDate(label: string, bookingDate: ISODate): ISODate | null {
  if (!/^\s*ACHAT CB\b/i.test(label)) return null;
  const m = /\b(\d{2})\.(\d{2})\.(\d{2})\b/.exec(label);
  if (!m) return null;
  const date = fromParts(2000 + Number(m[3]), Number(m[2]), Number(m[1]));
  if (!isValidISODate(date)) return null;
  if (compareISODate(date, bookingDate) > 0 || compareISODate(date, addDays(bookingDate, -CARD_DEBIT_MAX_DELAY_DAYS)) < 0) return null;
  return date;
}

/** Le jour où l'opération a vraiment eu lieu : la date d'achat pour une carte, sinon la date de l'opération. */
export function effectiveDate(t: { label: string; date: ISODate }): ISODate {
  return cardPaymentDate(t.label, t.date) ?? t.date;
}
