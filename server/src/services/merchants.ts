import { and, eq, inArray, isNull } from 'drizzle-orm';
import { MERCHANT_KINDS, merchantKeyFor } from '@core/merchants';
import type { Db } from '../db/client';
import { transactions } from '../db/schema';
import { ensureMerchants } from '../repos/merchants';

/**
 * Calcule la clé des dépenses et revenus qui n'en ont pas (opérations d'avant la migration 0010) et crée leurs marchands.
 * Idempotent : une fois fait, seules les opérations dont la clé calculée est nulle sont relues, sans rien écrire.
 */
export function backfillMerchantKeys(db: Db): number {
  const rows = db
    .select({ id: transactions.id, kind: transactions.kind, label: transactions.label })
    .from(transactions)
    .where(and(inArray(transactions.kind, [...MERCHANT_KINDS]), isNull(transactions.merchantKey)))
    .all();
  return db.transaction((tx) => {
    const keys = new Set<string>();
    let updated = 0;
    for (const row of rows) {
      const key = merchantKeyFor(row.kind, row.label);
      if (key === null) continue;
      tx.update(transactions).set({ merchantKey: key }).where(eq(transactions.id, row.id)).run();
      keys.add(key);
      updated++;
    }
    ensureMerchants(tx as unknown as Db, keys);
    return updated;
  });
}
