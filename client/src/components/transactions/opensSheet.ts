import type { Transaction } from '@shared/schemas';

/** La fiche s'ouvre pour ce qu'on a vraiment dépensé ou reçu ; prévues et répartitions vont droit au formulaire. */
export const opensSheet = (t: Pick<Transaction, 'status' | 'kind'>) => t.status === 'confirmed' && t.kind !== 'allocation';
