import type { Db } from '../db/client';
import { listAccounts } from '../repos/accounts';
import { listEnvelopes } from '../repos/envelopes';
import { listFundings } from '../repos/fundings';
import { listImports } from '../repos/imports';
import { listMerchants } from '../repos/merchants';
import { listRules } from '../repos/recurring-rules';
import { listSortingRules } from '../repos/sorting-rules';
import { getSettings } from '../repos/settings';
import { allTransactions } from '../repos/transactions';

/** Export complet des données saisies, sans les valeurs calculées (soldes, budgets). */
export function exportJson(db: Db) {
  return {
    exportedAt: new Date().toISOString(),
    version: 1,
    accounts: listAccounts(db, { includeArchived: true }),
    envelopes: listEnvelopes(db, { includeArchived: true }),
    transactions: allTransactions(db),
    recurringRules: listRules(db),
    sortingRules: listSortingRules(db),
    imports: listImports(db),
    fundings: listFundings(db),
    merchants: listMerchants(db),
    // La clé privée Enable Banking ne sort jamais de la base : l'utilisateur garde le fichier .pem.
    settings: { ...getSettings(db), enableBankingPrivateKey: '' },
  };
}

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV des opérations, séparateur `;`, montants en euros avec virgule, lisible par un tableur français. */
export function exportCsv(db: Db): string {
  const accountName = new Map(listAccounts(db, { includeArchived: true }).map((a) => [a.id, a.name]));
  const envelopeName = new Map(listEnvelopes(db, { includeArchived: true }).map((e) => [e.id, e.name]));
  const header = ['date', 'type', 'statut', 'libellé', 'montant', 'compte', 'compte destination', 'enveloppe', 'enveloppe source', 'note'];
  const lines = [header.join(';')];
  for (const t of allTransactions(db)) {
    const signed = t.kind === 'expense' ? -t.amount : t.amount;
    lines.push(
      [
        t.date,
        t.kind,
        t.status,
        t.label,
        (signed / 100).toFixed(2).replace('.', ','),
        t.accountId == null ? '' : accountName.get(t.accountId) ?? '',
        t.toAccountId == null ? '' : accountName.get(t.toAccountId) ?? '',
        t.envelopeId == null ? '' : envelopeName.get(t.envelopeId) ?? '',
        t.fromEnvelopeId == null ? '' : envelopeName.get(t.fromEnvelopeId) ?? '',
        t.note ?? '',
      ]
        .map(csvCell)
        .join(';'),
    );
  }
  return `\ufeff${lines.join('\r\n')}\r\n`;
}
