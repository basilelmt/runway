import type { Db } from '../db/client';
import { listImports } from '../repos/imports';
import { listSortingRules } from '../repos/sorting-rules';
import { getSettings } from '../repos/settings';
import { loadState } from './state';

export function exportJson(db: Db) {
  const state = loadState(db);
  return {
    exportedAt: new Date().toISOString(),
    version: 1,
    accounts: state.accounts,
    envelopes: state.envelopes,
    transactions: state.transactions,
    recurringRules: state.rules,
    sortingRules: listSortingRules(db),
    imports: listImports(db),
    settings: getSettings(db),
  };
}

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV des opérations, séparateur `;`, montants en euros avec virgule, lisible par un tableur français. */
export function exportCsv(db: Db): string {
  const state = loadState(db);
  const accountName = new Map(state.accounts.map((a) => [a.id, a.name]));
  const envelopeName = new Map(state.envelopes.map((e) => [e.id, e.name]));
  const header = ['date', 'type', 'statut', 'libellé', 'montant', 'compte', 'compte destination', 'enveloppe', 'enveloppe source', 'note'];
  const lines = [header.join(';')];
  for (const t of state.transactions) {
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
  return `﻿${lines.join('\r\n')}\r\n`;
}
