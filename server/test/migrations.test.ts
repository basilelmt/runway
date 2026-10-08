import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationsDir = fileURLToPath(new URL('../src/db/migrations', import.meta.url));

type JournalEntry = { idx: number; tag: string };

function journalTags(maxIdx: number): string[] {
  const journal = JSON.parse(readFileSync(`${migrationsDir}/meta/_journal.json`, 'utf8')) as { entries: JournalEntry[] };
  return journal.entries
    .filter((e) => e.idx <= maxIdx)
    .sort((a, b) => a.idx - b.idx)
    .map((e) => e.tag);
}

/** Applique un fichier de migration brut, en coupant sur les marqueurs posés par drizzle-kit. */
function applyMigration(db: Database.Database, tag: string): void {
  const sql = readFileSync(`${migrationsDir}/${tag}.sql`, 'utf8');
  for (const statement of sql.split('--> statement-breakpoint')) {
    const trimmed = statement.trim();
    if (trimmed) db.exec(trimmed);
  }
}

describe('migrations 0007/0008 (critique des idées)', () => {
  it('migre une fournée et une idée héritées sans perte, et retire source_url', () => {
    const db = new Database(':memory:');
    // Base au niveau de la dernière migration avant le critique.
    for (const tag of journalTags(6)) applyMigration(db, tag);

    db.prepare(`INSERT INTO idea_runs (\`trigger\`, status, started_at) VALUES ('manual', 'done', '2026-10-01T00:00:00.000Z')`).run();
    const runId = (db.prepare('SELECT id FROM idea_runs').get() as { id: number }).id;

    const url = 'https://exemple.fr/article?q="citation"';
    db.prepare(
      `INSERT INTO ideas (run_id, created_on, title, event, source_url, reasoning, priced_in, ticker, asset_name, where_to_buy, horizon, start_price_eur, bench_start_price_eur)
       VALUES (?, '2026-10-01', 'Titre', 'Événement', ?, '[]', 'déjà dans les prix', 'BAG.PA', 'Baguettes SA', 'trade_republic', '2026-10-28', 10, 700)`,
    ).run(runId, url);

    // La migration à tester.
    applyMigration(db, '0007_idea_critique');
    applyMigration(db, '0008_drop_idea_source_url');

    const run = db.prepare('SELECT * FROM idea_runs').get() as Record<string, unknown>;
    expect(run.failed_angles).toBe('[]');
    expect(run.candidate_count).toBe(0);

    const idea = db.prepare('SELECT * FROM ideas').get() as Record<string, unknown>;
    expect(JSON.parse(idea.sources as string)).toEqual([url]);
    expect(idea.verdict).toBeNull();

    const columns = (db.prepare("PRAGMA table_info('ideas')").all() as { name: string }[]).map((c) => c.name);
    expect(columns).not.toContain('source_url');

    db.close();
  });
});
