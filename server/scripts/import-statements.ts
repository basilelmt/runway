/**
 * Import en masse des relevés mensuels PDF La Banque Postale.
 *
 *   npx tsx server/scripts/import-statements.ts <dossier-des-pdf> [--db data/runway.db] [--dry-run]
 *
 * Pour chaque relevé : lit les sections (CCP, livrets), crée les comptes manquants (solde initial = ancien solde
 * du premier relevé), reconnaît les virements entre comptes propres (par IBAN) pour en faire des transferts,
 * ignore les opérations déjà importées (empreintes), puis vérifie que les soldes calculés par l'app sont
 * exactement ceux des derniers relevés.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { computeBalances } from '@core/balances';
import { fingerprint } from '@core/fingerprint';
import { daysBetween } from '@shared/dates';
import { formatEuros } from '@shared/money';
import { openDb } from '../src/db/client';
import { extractPdfText, parseLbpStatementText, reconcile, type PdfRow, type StatementSection } from '../src/parsers/lbp-pdf';
import { createAccount, findAccountByBankNumber } from '../src/repos/accounts';
import { createImport } from '../src/repos/imports';
import { createTransaction, findByFingerprints, type TransactionInsert } from '../src/repos/transactions';
import { loadState } from '../src/services/state';

type Args = { dir: string; db: string; dryRun: boolean };

function parseArgs(argv: string[]): Args {
  const args: Args = { dir: '', db: 'data/runway.db', dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--db') args.db = argv[++i] ?? args.db;
    else if (a === '--dry-run') args.dryRun = true;
    else args.dir = a;
  }
  if (!args.dir) throw new Error('Usage : import-statements.ts <dossier> [--db chemin] [--dry-run]');
  return args;
}

type Row = PdfRow & { section: StatementSection; file: string };

/** Associe un débit "virement pour <IBAN propre>" au crédit correspondant sur l'autre compte. */
function pairTransfers(rows: Row[], ibans: Map<string, string>): Map<Row, Row> {
  const pairs = new Map<Row, Row>();
  const used = new Set<Row>();
  const debits = rows.filter((r) => r.signedAmount < 0 && /VIREMENT/i.test(r.raw));
  const credits = rows.filter((r) => r.signedAmount > 0 && /VIREMENT/i.test(r.raw));
  for (const d of debits) {
    const target = [...ibans.entries()].find(([iban, number]) => number !== d.section.bankAccountNumber && d.raw.replace(/\s/g, '').includes(iban));
    if (!target) continue;
    const candidates = credits
      .filter((c) => !used.has(c) && c.section.bankAccountNumber === target[1] && c.signedAmount === -d.signedAmount && Math.abs(daysBetween(d.date, c.date)) <= 4)
      .sort((a, b) => Math.abs(daysBetween(d.date, a.date)) - Math.abs(daysBetween(d.date, b.date)));
    const c = candidates[0];
    if (!c) continue;
    used.add(c);
    pairs.set(d, c);
  }
  return pairs;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const files = readdirSync(args.dir)
    .filter((f) => f.toLowerCase().endsWith('.pdf'))
    .sort();
  if (files.length === 0) throw new Error(`Aucun PDF dans ${args.dir}`);
  console.log(`${files.length} relevés dans ${resolve(args.dir)}`);

  // 1. Lecture et contrôle de tous les relevés avant d'écrire quoi que ce soit.
  const rows: Row[] = [];
  const firstOpening = new Map<string, StatementSection>();
  const lastClosing = new Map<string, StatementSection>();
  const ibans = new Map<string, string>();
  for (const file of files) {
    const text = await extractPdfText(readFileSync(join(args.dir, file)));
    const { sections } = parseLbpStatementText(text);
    for (const s of sections) {
      const check = reconcile(s);
      if (!check.ok) throw new Error(`${file} ${s.accountName} : les soldes ne se recoupent pas (attendu ${check.expected}, calculé ${check.computed})`);
      if (s.iban) ibans.set(s.iban, s.bankAccountNumber);
      const first = firstOpening.get(s.bankAccountNumber);
      if (!first || (s.openingDate ?? '') < (first.openingDate ?? '')) firstOpening.set(s.bankAccountNumber, s);
      const last = lastClosing.get(s.bankAccountNumber);
      if (!last || (s.closingDate ?? '') > (last.closingDate ?? '')) lastClosing.set(s.bankAccountNumber, s);
      for (const r of s.rows) rows.push({ ...r, section: s, file });
    }
    console.log(`  ${file} : ${sections.map((s) => `${s.accountName} ${s.rows.length} ops`).join(', ')}`);
  }

  const pairs = pairTransfers(rows, ibans);
  console.log(`${rows.length} opérations, ${pairs.size} virements entre comptes propres reconnus`);
  if (args.dryRun) return;

  // 2. Comptes.
  const db = openDb(args.db);
  const accountIds = new Map<string, number>();
  for (const [number, s] of firstOpening) {
    let account = findAccountByBankNumber(db, number);
    if (!account) {
      account = createAccount(db, {
        name: s.accountName,
        initialBalance: s.openingBalance ?? 0,
        onBudget: s.accountName === 'Compte courant',
        bankAccountNumber: number,
      });
      console.log(`compte créé : ${account.name} (${number}), solde initial ${formatEuros(account.initialBalance)} au ${s.openingDate}`);
    }
    accountIds.set(number, account.id);
  }

  // 3. Opérations, fichier par fichier et compte par compte, en sautant ce qui existe déjà.
  const paired = new Set<Row>([...pairs.values()]);
  const occurrences = new Map<string, number>();
  let created = 0;
  let skipped = 0;
  for (const file of files) {
    for (const [number, accountId] of accountIds) {
      const mine = rows.filter((r) => r.file === file && r.section.bankAccountNumber === number && !paired.has(r));
      if (mine.length === 0) continue;
      const inputs: (TransactionInsert & { fingerprint: string })[] = mine.map((r) => {
        const key = `${accountId}|${r.date}|${r.signedAmount}|${r.label}`;
        const occurrence = occurrences.get(key) ?? 0;
        occurrences.set(key, occurrence + 1);
        const fp = fingerprint(accountId, r.date, r.signedAmount, r.label, occurrence);
        const counterpart = pairs.get(r);
        if (counterpart) {
          const toAccountId = accountIds.get(counterpart.section.bankAccountNumber)!;
          return {
            kind: 'transfer',
            date: r.date,
            amount: -r.signedAmount,
            label: `Virement ${r.section.accountName} → ${counterpart.section.accountName}`,
            note: r.raw,
            accountId,
            toAccountId,
            fingerprint: fp,
          };
        }
        return {
          kind: r.signedAmount < 0 ? 'expense' : 'income',
          date: r.date,
          amount: Math.abs(r.signedAmount),
          label: r.label,
          note: r.raw,
          accountId,
          fingerprint: fp,
        };
      });
      const existing = findByFingerprints(db, inputs.map((i) => i.fingerprint));
      const fresh = inputs.filter((i) => !existing.has(i.fingerprint));
      skipped += inputs.length - fresh.length;
      if (fresh.length === 0) continue;
      db.transaction((tx) => {
        const t = tx as unknown as typeof db;
        const record = createImport(t, { fileName: basename(file), accountId, rowCount: inputs.length, newCount: fresh.length, duplicateCount: inputs.length - fresh.length, matchedCount: 0 });
        for (const input of fresh) createTransaction(t, { ...input, importId: record.id });
      });
      created += fresh.length;
    }
  }
  console.log(`${created} opérations créées, ${skipped} déjà présentes`);

  // 4. Contrôle final : les soldes de l'app doivent être ceux des derniers relevés.
  const state = loadState(db);
  const balances = computeBalances(state);
  let allGood = true;
  for (const [number, s] of lastClosing) {
    const id = accountIds.get(number)!;
    const computed = balances.accounts[id] ?? 0;
    const ok = computed === s.closingBalance;
    allGood &&= ok;
    console.log(`${ok ? 'OK' : 'KO'} ${s.accountName} : app ${formatEuros(computed)}, relevé ${formatEuros(s.closingBalance ?? 0)} au ${s.closingDate}`);
  }
  if (!allGood) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
