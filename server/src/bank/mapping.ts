import type { SourceRow } from '../services/import';
import type { BankTransaction } from './provider';

/** « 12.34 » → 1234, « -12,5 » → -1250, sans passer par un flottant. */
export function parseAmountToCents(amount: string): number {
  const m = /^(-?)(\d+)(?:[.,](\d{1,2}))?$/.exec(amount.trim());
  if (!m) throw new Error(`Montant illisible : ${amount}`);
  const cents = Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0'));
  return m[1] === '-' ? -cents : cents;
}

export type MappedRow = { ok: true; row: SourceRow } | { ok: false; reason: string };

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Opération Enable Banking → ligne de source. Libellé : référence de paiement, sinon contrepartie,
 * sinon description du code bancaire. La note garde les détails annexes pour la recherche et les virements.
 */
export function toSourceRow(tx: BankTransaction): MappedRow {
  const date = [tx.booking_date, tx.value_date, tx.transaction_date].find((d): d is string => !!d && ISO_DATE_RE.test(d)) ?? null;
  if (!date) return { ok: false, reason: 'date absente' };

  let cents: number;
  try {
    cents = parseAmountToCents(tx.transaction_amount.amount);
  } catch {
    return { ok: false, reason: 'montant illisible' };
  }
  if (cents === 0) return { ok: false, reason: 'montant nul' };
  const signedAmount = tx.credit_debit_indicator === 'DBIT' ? -Math.abs(cents) : Math.abs(cents);

  const counterparty = (tx.credit_debit_indicator === 'DBIT' ? tx.creditor?.name : tx.debtor?.name)?.trim() || null;
  const remittance = (tx.remittance_information ?? []).map((s) => s.trim()).filter(Boolean).join(' ');
  const label = (remittance || counterparty || tx.bank_transaction_code?.description?.trim() || 'Opération').slice(0, 200);

  const extras = [
    counterparty && counterparty !== label ? counterparty : null,
    tx.entry_reference ? `Réf. ${tx.entry_reference}` : null,
    tx.value_date && tx.value_date !== date ? `Valeur ${tx.value_date}` : null,
  ].filter((s): s is string => s !== null);
  const note = extras.length > 0 ? `${label} · ${extras.join(' · ')}` : null;

  return { ok: true, row: { date, label, signedAmount, note } };
}
