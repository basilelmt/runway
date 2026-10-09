import type { Db } from '../db/client';
import { merchants } from '../db/schema';

/** Au plus autant de lignes par insertion, loin de la limite de variables de SQLite. */
const INSERT_CHUNK = 500;

/** Crée la ligne des clés nouvelles, sans nom (`INSERT OR IGNORE`) : Claude les nommera. */
export function ensureMerchants(db: Db, keys: Iterable<string | null>): void {
  const fresh = [...new Set([...keys].filter((k): k is string => k !== null))];
  const updatedAt = new Date().toISOString();
  for (let i = 0; i < fresh.length; i += INSERT_CHUNK) {
    db.insert(merchants)
      .values(fresh.slice(i, i + INSERT_CHUNK).map((key) => ({ key, updatedAt })))
      .onConflictDoNothing()
      .run();
  }
}
