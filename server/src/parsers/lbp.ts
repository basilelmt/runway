import iconv from 'iconv-lite';
import { fromParts } from '@shared/dates';
import { BadRequestError } from '../errors';
import type { BankParser, ParsedRow } from './types';

/**
 * Export CSV de La Banque Postale.
 * Encodage Windows-1252, séparateur `;`, en-tête clé/valeur (`Numéro Compte ;...`, `Solde (EUROS) ;...`),
 * puis une ligne de colonnes `Date;Libellé;Montant(EUROS)` suivie des opérations, dates `jj/mm/aaaa`,
 * montants à virgule décimale.
 */
export const lbpParser: BankParser = {
  id: 'lbp',
  name: 'La Banque Postale',

  detect(buffer) {
    const text = decode(buffer);
    return /num[ée]ro\s+compte/i.test(text) && /date\s*;\s*libell[ée]\s*;\s*montant/i.test(text);
  },

  parse(buffer) {
    const text = decode(buffer);
    const lines = text.split(/\r?\n/);

    let bankAccountNumber: string | null = null;
    let statedBalance: number | null = null;
    let headerIndex = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (/^\s*date\s*;\s*libell/i.test(line)) {
        headerIndex = i;
        break;
      }
      const [key, value] = splitKeyValue(line);
      if (!key) continue;
      if (/num[ée]ro\s+compte/i.test(key)) bankAccountNumber = value.replace(/\s+/g, '') || null;
      if (/^solde/i.test(key)) statedBalance = parseAmount(value);
    }

    if (headerIndex === -1) throw new BadRequestError("Ligne d'en-tête `Date;Libellé;Montant` introuvable");

    const rows: ParsedRow[] = [];
    for (const line of lines.slice(headerIndex + 1)) {
      if (!line.trim()) continue;
      const cells = splitCsvLine(line);
      const [rawDate, rawLabel, rawAmount] = cells;
      if (!rawDate || rawAmount === undefined) continue;
      const date = parseDate(rawDate);
      const signedAmount = parseAmount(rawAmount);
      if (date === null || signedAmount === null) continue;
      rows.push({ date, label: cleanLabel(rawLabel ?? ''), signedAmount });
    }

    return { bankAccountNumber, statedBalance, rows };
  },
};

function decode(buffer: Buffer): string {
  // Un export LBP n'est jamais en UTF-8, mais on tolère un fichier ré-enregistré en UTF-8 (avec ou sans BOM).
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) return buffer.subarray(3).toString('utf8');
  const asUtf8 = buffer.toString('utf8');
  if (!asUtf8.includes('�')) return asUtf8;
  return iconv.decode(buffer, 'win1252');
}

function splitKeyValue(line: string): [string, string] {
  const idx = line.indexOf(';');
  if (idx === -1) return ['', ''];
  return [line.slice(0, idx).trim(), stripQuotes(line.slice(idx + 1).trim())];
}

/** Découpe une ligne `;` en tenant compte des guillemets doubles. */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ';' && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells.map((c) => c.trim());
}

function stripQuotes(s: string): string {
  return s.replace(/^"(.*)"$/s, '$1').trim();
}

function cleanLabel(raw: string): string {
  return stripQuotes(raw).replace(/\s+/g, ' ').trim();
}

export function parseDate(raw: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw.trim());
  if (!m) return null;
  return fromParts(Number(m[3]), Number(m[2]), Number(m[1]));
}

export function parseAmount(raw: string): number | null {
  const cleaned = stripQuotes(raw).replace(/[\s  €]/g, '').replace(',', '.');
  if (!/^[+-]?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}
