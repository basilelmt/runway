import Database from 'better-sqlite3';

/** Connexion en lecture seule : toute écriture échoue au niveau de SQLite, quelle que soit la requête. */
export function openReadOnly(path: string): Database.Database {
  const db = new Database(path, { readonly: true, fileMustExist: true });
  db.pragma('query_only = ON');
  return db;
}

export type QueryResult = { rows: Record<string, unknown>[]; truncated: boolean };

/**
 * Exécute une seule instruction de lecture et renvoie au plus `limit` lignes.
 * `prepare` refuse plusieurs instructions ; `reader` écarte tout ce qui ne renvoie pas de lignes.
 */
export function runReadOnlyQuery(db: Database.Database, sql: string, limit = 200): QueryResult {
  if (/^\s*pragma\b/i.test(sql)) throw new Error('PRAGMA non permis');
  const stmt = db.prepare(sql);
  if (!stmt.reader) throw new Error('Seules les requêtes de lecture (SELECT, WITH) sont permises');
  const rows: Record<string, unknown>[] = [];
  for (const row of stmt.iterate() as Iterable<Record<string, unknown>>) {
    if (rows.length === limit) return { rows, truncated: true };
    rows.push(row);
  }
  return { rows, truncated: false };
}
