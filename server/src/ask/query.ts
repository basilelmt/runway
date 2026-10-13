import Database from 'better-sqlite3';

/** Connexion en lecture seule : toute écriture échoue au niveau de SQLite, quelle que soit la requête. */
export function openReadOnly(path: string): Database.Database {
  const db = new Database(path, { readonly: true, fileMustExist: true });
  db.pragma('query_only = ON');
  return db;
}

export type QueryResult = { rows: Record<string, unknown>[]; truncated: boolean };

/** Tables que Claude peut lire. Tout le reste (réglages, connexions bancaires, IBAN, tables futures) est refusé. */
export const ASK_TABLES = ['transactions', 'advances', 'envelopes', 'accounts', 'recurring_rules', 'sorting_rules', 'merchants', 'holdings', 'holding_trades', 'prices'] as const;
const ALLOWED = new Set<string>([...ASK_TABLES, 'sqlite_schema']);

/**
 * Vérifie chaque b-tree que SQLite ouvrira (plan `EXPLAIN`, opcode `OpenRead`) : sa page racine, rapprochée
 * de `sqlite_schema`, donne la table, y compris pour une lecture par index seul, une sous-requête ou un CTE.
 */
function assertAllowedTables(db: Database.Database, sql: string): void {
  const tableByRoot = new Map<number, string>([[1, 'sqlite_schema']]);
  for (const r of db.prepare('select rootpage, tbl_name from sqlite_schema where rootpage > 0').all() as { rootpage: number; tbl_name: string }[]) {
    tableByRoot.set(r.rootpage, r.tbl_name);
  }
  for (const op of db.prepare(`explain ${sql}`).all() as { opcode: string; p2: number }[]) {
    if (op.opcode !== 'OpenRead' && op.opcode !== 'ReopenIdx') continue;
    const table = tableByRoot.get(op.p2) ?? 'inconnue';
    if (!ALLOWED.has(table)) throw new Error(`Table non accessible : ${table}`);
  }
}

/**
 * Exécute une seule instruction de lecture et renvoie au plus `limit` lignes.
 * `prepare` refuse plusieurs instructions ; `reader` écarte tout ce qui ne renvoie pas de lignes.
 */
export function runReadOnlyQuery(db: Database.Database, sql: string, limit = 200): QueryResult {
  if (/^\s*pragma\b/i.test(sql)) throw new Error('PRAGMA non permis');
  const stmt = db.prepare(sql);
  if (!stmt.reader) throw new Error('Seules les requêtes de lecture (SELECT, WITH) sont permises');
  assertAllowedTables(db, sql);
  const rows: Record<string, unknown>[] = [];
  for (const row of stmt.iterate() as Iterable<Record<string, unknown>>) {
    if (rows.length === limit) return { rows, truncated: true };
    rows.push(row);
  }
  return { rows, truncated: false };
}
