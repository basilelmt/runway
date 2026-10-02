import { createHash } from 'node:crypto';
import type { ISODate } from '@shared/dates';
import { normalizeLabel } from './sorting';

/** Empreinte d'une ligne de relevé, stable d'un export à l'autre. */
export function fingerprint(accountId: number, date: ISODate, signedAmount: number, label: string, occurrence: number): string {
  return createHash('sha1')
    .update([accountId, date, signedAmount, normalizeLabel(label), occurrence].join('|'))
    .digest('hex');
}
