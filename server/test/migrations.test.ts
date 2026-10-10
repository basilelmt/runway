import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { monthlyEquivalent } from '@core/recurrence';

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

type RuleSeed = { name: string; kind: 'expense' | 'income' | 'transfer'; amount: number; envelope: string; frequency?: 'daily' | 'weekly' | 'monthly' | 'yearly'; interval?: number; endDate?: string | null; active?: 0 | 1 };

/** Base au niveau 0008 avec des budgets et des charges, puis la migration 0009. */
function migrateBudgets(envelopes: [string, number | null][], rules: RuleSeed[]) {
  const db = new Database(':memory:');
  for (const tag of journalTags(8)) applyMigration(db, tag);
  const ids = new Map<string, number>();
  const insertEnvelope = db.prepare('INSERT INTO envelopes (name, monthly_target) VALUES (?, ?)');
  for (const [name, target] of envelopes) ids.set(name, Number(insertEnvelope.run(name, target).lastInsertRowid));
  const insertRule = db.prepare(
    `INSERT INTO recurring_rules (name, kind, amount, label, envelope_id, frequency, \`interval\`, day_of_month, start_date, end_date, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, '2026-01-01', ?, ?)`,
  );
  for (const r of rules) {
    insertRule.run(r.name, r.kind, r.amount, r.name, ids.get(r.envelope)!, r.frequency ?? 'monthly', r.interval ?? 1, r.endDate ?? null, r.active ?? 1);
  }

  // La migration à tester.
  applyMigration(db, '0009_envelope_monthly_extra');

  const columns = (db.prepare("PRAGMA table_info('envelopes')").all() as { name: string }[]).map((c) => c.name);
  const rows = db.prepare('SELECT name, monthly_extra AS extra FROM envelopes ORDER BY id').all() as { name: string; extra: number | null }[];
  db.close();
  return { columns, rows };
}

describe('migration 0009 (complément des enveloppes)', () => {
  it('renomme monthly_target et ne garde que ce qui dépasse les charges fixes', () => {
    const { columns, rows } = migrateBudgets(
      [
        ['Logement', 986_00],
        ['Prêt étudiant', 485_00],
        ['Transports', 130_00],
        ['Santé et assurances', 20_00],
        ['Courses', 300_00],
        ['Divers', null],
      ],
      [
        { name: 'Loyer', kind: 'expense', amount: 986_00, envelope: 'Logement' },
        { name: 'Prêt', kind: 'expense', amount: 484_72, envelope: 'Prêt étudiant' },
        { name: 'Navigo', kind: 'expense', amount: 40_00, envelope: 'Transports' },
        { name: 'Mutuelle', kind: 'expense', amount: 14_35, envelope: 'Santé et assurances' },
        // Trimestrielle : 3,60 € par mois, soit 17,95 € de charges avec la mutuelle.
        { name: 'Cotisation compte LBP', kind: 'expense', amount: 10_80, envelope: 'Santé et assurances', interval: 3 },
        // Ignorées : terminée avant ce mois, en pause, revenu.
        { name: 'Ancienne assurance', kind: 'expense', amount: 50_00, envelope: 'Courses', endDate: '2020-01-31' },
        { name: 'Drive', kind: 'expense', amount: 100_00, envelope: 'Courses', active: 0 },
        { name: 'Remboursement', kind: 'income', amount: 20_00, envelope: 'Courses' },
      ],
    );
    expect(columns).toContain('monthly_extra');
    expect(columns).not.toContain('monthly_target');
    expect(rows).toEqual([
      { name: 'Logement', extra: null },
      // 0,28 € d'écart : sous 1 €, le complément est écarté.
      { name: 'Prêt étudiant', extra: null },
      { name: 'Transports', extra: 90_00 },
      { name: 'Santé et assurances', extra: 2_05 },
      { name: 'Courses', extra: 300_00 },
      { name: 'Divers', extra: null },
    ]);
  });

  it('ramène les charges au mois comme monthlyEquivalent, au centime près', () => {
    const { rows } = migrateBudgets(
      [
        ['Sport', 100_00],
        ['Habitation', 20_00],
        ['Café', 50_00],
        ['Assurance', 10_00],
      ],
      [
        { name: 'Salle', kind: 'expense', amount: 10_00, envelope: 'Sport', frequency: 'weekly' },
        { name: 'Assurance habitation', kind: 'expense', amount: 120_00, envelope: 'Habitation', frequency: 'yearly' },
        { name: 'Expresso', kind: 'expense', amount: 1_00, envelope: 'Café', frequency: 'daily', interval: 2 },
        { name: 'Assurance auto', kind: 'expense', amount: 30_00, envelope: 'Assurance' },
      ],
    );
    expect(rows).toEqual([
      { name: 'Sport', extra: 100_00 - monthlyEquivalent({ frequency: 'weekly', interval: 1, amount: 10_00 }) },
      { name: 'Habitation', extra: 20_00 - monthlyEquivalent({ frequency: 'yearly', interval: 1, amount: 120_00 }) },
      { name: 'Café', extra: 50_00 - monthlyEquivalent({ frequency: 'daily', interval: 2, amount: 1_00 }) },
      // Budget inférieur aux charges : pas de complément.
      { name: 'Assurance', extra: null },
    ]);
  });
});

describe('migration 0010 (marchands)', () => {
  it('ajoute la table merchants et la colonne merchant_key, vides, sans toucher aux opérations', () => {
    const db = new Database(':memory:');
    for (const tag of journalTags(9)) applyMigration(db, tag);
    db.prepare(`INSERT INTO transactions (kind, date, amount, label) VALUES ('expense', '2026-10-01', 1250, 'ACHAT CB BOULANGERIE DU COIN')`).run();

    applyMigration(db, '0010_merchants');

    expect(db.prepare('SELECT label, merchant_key FROM transactions').get()).toEqual({ label: 'ACHAT CB BOULANGERIE DU COIN', merchant_key: null });
    const columns = (db.prepare("PRAGMA table_info('merchants')").all() as { name: string }[]).map((c) => c.name);
    expect(columns).toEqual(['key', 'name', 'source', 'updated_at']);
    const indexes = (db.prepare("PRAGMA index_list('transactions')").all() as { name: string }[]).map((i) => i.name);
    expect(indexes).toContain('transactions_merchant_idx');

    db.prepare(`INSERT INTO merchants (key) VALUES ('BOULANGERIE DU COIN')`).run();
    expect(db.prepare('SELECT name, source, updated_at FROM merchants').get()).toMatchObject({ name: null, source: null, updated_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) });
    db.close();
  });
});

describe('migration 0014 (avances)', () => {
  it('ajoute la table advances, vide, référençant les opérations', () => {
    const db = new Database(':memory:');
    for (const tag of journalTags(11)) applyMigration(db, tag);
    db.prepare(`INSERT INTO transactions (kind, date, amount, label) VALUES ('expense', '2026-07-26', 8250, 'Bowling')`).run();
    const expenseId = (db.prepare('SELECT id FROM transactions').get() as { id: number }).id;

    applyMigration(db, '0014_advances');

    const columns = (db.prepare("PRAGMA table_info('advances')").all() as { name: string }[]).map((c) => c.name);
    expect(columns).toEqual(['id', 'expense_id', 'person', 'amount', 'refund_id', 'settled_at', 'created_at']);

    db.prepare(`INSERT INTO advances (expense_id, person, amount) VALUES (?, 'Max', 4150)`).run(expenseId);
    expect(db.prepare('SELECT person, amount, refund_id, settled_at FROM advances').get()).toEqual({ person: 'Max', amount: 4150, refund_id: null, settled_at: null });

    db.close();
  });
});

describe('migration 0011 (espaces compactés)', () => {
  it('compacte les espaces multiples des libellés et notes existants, sans toucher la clé marchand', () => {
    const db = new Database(':memory:');
    for (const tag of journalTags(10)) applyMigration(db, tag);

    const noisy = 'ACHAT CB CARREFOUR EXPR 03.10.26 CARTE NUMERO                089';
    const compact = 'ACHAT CB CARREFOUR EXPR 03.10.26 CARTE NUMERO 089';
    db.prepare(`INSERT INTO transactions (kind, date, amount, label, note, merchant_key) VALUES ('expense', '2026-10-03', 4556, ?, ?, 'CARREFOUR EXPR')`).run(noisy, noisy);
    // Une opération déjà propre, et une note vide : ne doivent pas changer ni planter.
    db.prepare(`INSERT INTO transactions (kind, date, amount, label, note) VALUES ('expense', '2026-10-01', 1000, 'ACHAT CB BOULANGERIE', NULL)`).run();
    db.prepare(
      `INSERT INTO recurring_rules (name, kind, amount, label, frequency, start_date) VALUES ('Loyer', 'expense', 80000, ?, 'monthly', '2026-01-01')`,
    ).run('PRELEVEMENT DE   AGENCE IMMO   LOYER');

    // La migration à tester.
    applyMigration(db, '0011_compact_label_spaces');

    expect(db.prepare('SELECT label, note, merchant_key FROM transactions WHERE date = ?').get('2026-10-03')).toEqual({ label: compact, note: compact, merchant_key: 'CARREFOUR EXPR' });
    expect(db.prepare('SELECT label, note FROM transactions WHERE date = ?').get('2026-10-01')).toEqual({ label: 'ACHAT CB BOULANGERIE', note: null });
    expect(db.prepare('SELECT label FROM recurring_rules').get()).toEqual({ label: 'PRELEVEMENT DE AGENCE IMMO LOYER' });

    db.close();
  });
});
