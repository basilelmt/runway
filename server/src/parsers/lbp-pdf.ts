import { spawn } from 'node:child_process';
import { fromParts, type ISODate } from '@shared/dates';
import { BadRequestError } from '../errors';
import type { ParsedRow } from './types';

/**
 * Relevé mensuel PDF de La Banque Postale, lu via `pdftotext -layout`.
 * Un relevé couvre plusieurs comptes (CCP, livrets) : chaque compte devient une section,
 * avec son ancien solde, son nouveau solde et ses opérations datées `jj/mm` (année déduite
 * de la période du relevé). Le sens d'une opération vient de sa colonne, Débit ou Crédit.
 */

export type StatementSection = {
  accountName: string;
  bankAccountNumber: string;
  /** IBAN compact (sans espaces), utile pour reconnaître les virements entre comptes propres. */
  iban: string | null;
  openingDate: ISODate | null;
  openingBalance: number | null;
  closingDate: ISODate | null;
  closingBalance: number | null;
  rows: PdfRow[];
};

export type PdfRow = ParsedRow & {
  /** Texte complet de l'opération (ligne principale et suites), pour la note. */
  raw: string;
};

export type PdfStatement = {
  sections: StatementSection[];
};

const SECTION_RE = /^\s*(?:Vos opérations\s+)?(Compte Courant Postal|CCP|Livret A|Livret Jeune Swing|Livret Jeune|LDDS|Livret de Développement Durable et Solidaire|LEP|Livret d'Épargne Populaire|PEL|CEL)\s+n°\s*([\d\s]+[A-Z]?[\d\s]*[A-Z]?)\s*(?:\(suite\))?\s*$/i;
const HEADER_RE = /Débit\s*\(¤\)/;
const OPENING_RE = /Ancien solde au (\d{2})\/(\d{2})\/(\d{4})\s+(-?[\d\s]*\d,\d{2})\s*$/;
const CLOSING_RE = /Nouveau solde au (\d{2})\/(\d{2})\/(\d{4})\s+(-?[\d\s]*\d,\d{2})\s*$/;
const OP_RE = /^\s*(\d{2})\/(\d{2})\s+(.*?)\s{2,}(-?[\d\s]*\d,\d{2})\s*$/;
const SKIP_RE = /Total des opérations|^\s*Page \d+\/\d+|Relevé n°|LA BANQUE POSTALE - S\.A\.|^\s*n°\d{3} \d{3} \d{3}|Situation de vos comptes|IBAN :|Frais et cotisations|Comptes d'Épargne/;

/** Nettoie un libellé bancaire : retire les numéros de carte, références et dates internes. */
export function cleanPdfLabel(raw: string): string {
  return raw
    .replace(/\bCARTE (NUMERO|NO) \d+\b/gi, ' ')
    .replace(/\bEUR \d[\d\s]*,\d{2}\b/g, ' ')
    .replace(/\b1[A-Z]{3}= ?[\d,]+EUR\b/g, ' ')
    .replace(/\b(REFERENCE|REF|IDENT|MANDAT)\s*:\s*\S+/gi, ' ')
    .replace(/\bDATE DE VALEUR\s*:?\s*\d{2} \d{2} \d{4}/gi, ' ')
    .replace(/\bCOMPTE FR\d{2}[A-Z0-9]{10,}\b/g, ' ')
    .replace(/\b\d{2}\.\d{2}\.\d{2}\b/g, ' ')
    .replace(/\b\d{2}\/\d{2}\/\d{2}(?:\d{2})? A \d{2}H\d{2}\b/g, ' ')
    .replace(/\b\d{12,}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

function parseAmount(raw: string): number {
  return Math.round(Number(raw.replace(/\s/g, '').replace(',', '.')) * 100);
}

function normalizeNumber(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}

function accountLabel(kind: string): string {
  const k = kind.toLowerCase();
  if (k === 'ccp' || k.startsWith('compte courant')) return 'Compte courant';
  if (k.startsWith('livret jeune')) return 'Livret Jeune';
  if (k.startsWith('livret a')) return 'Livret A';
  return kind;
}

export function parseLbpStatementText(text: string): PdfStatement {
  const lines = text.split(/\r?\n/);
  const sections = new Map<string, StatementSection>();
  let current: StatementSection | null = null;
  let debitEnd = 0;
  let creditEnd = 0;
  let open: { row: PdfRow; parts: string[] } | null = null;

  const flush = () => {
    if (!open) return;
    const raw = open.parts.join(' ').replace(/\s+/g, ' ').trim();
    open.row.raw = raw;
    open.row.label = cleanPdfLabel(raw) || raw.slice(0, 200);
    open = null;
  };

  for (const line of lines) {
    if (!line.trim()) {
      flush();
      continue;
    }

    const section = SECTION_RE.exec(line);
    if (section && !line.includes('¤')) {
      flush();
      const number = normalizeNumber(section[2]!);
      current = sections.get(number) ?? {
        accountName: accountLabel(section[1]!),
        bankAccountNumber: number,
        iban: null,
        openingDate: null,
        openingBalance: null,
        closingDate: null,
        closingBalance: null,
        rows: [],
      };
      sections.set(number, current);
      continue;
    }

    if (HEADER_RE.test(line)) {
      flush();
      debitEnd = line.indexOf('Débit') + 'Débit (¤)'.length;
      creditEnd = line.indexOf('Crédit') + 'Crédit (¤)'.length;
      continue;
    }

    if (!current) continue;

    const iban = /IBAN\s*:\s*([A-Z]{2}[\d\s]+[A-Z0-9\s]+?)\s*\|/.exec(line);
    if (iban) {
      current.iban = normalizeNumber(iban[1]!);
      continue;
    }

    const opening = OPENING_RE.exec(line);
    if (opening) {
      flush();
      current.openingDate = fromParts(Number(opening[3]), Number(opening[2]), Number(opening[1]));
      current.openingBalance = parseAmount(opening[4]!);
      continue;
    }
    const closing = CLOSING_RE.exec(line);
    if (closing) {
      flush();
      current.closingDate = fromParts(Number(closing[3]), Number(closing[2]), Number(closing[1]));
      current.closingBalance = parseAmount(closing[4]!);
      continue;
    }
    if (SKIP_RE.test(line)) {
      flush();
      continue;
    }

    const op = OP_RE.exec(line);
    if (op) {
      flush();
      const day = Number(op[1]);
      const month = Number(op[2]);
      const amount = parseAmount(op[4]!);
      const end = line.trimEnd().length;
      const isCredit = debitEnd && creditEnd ? Math.abs(end - creditEnd) < Math.abs(end - debitEnd) : false;
      const row: PdfRow = { date: resolveDate(current, day, month), label: op[3]!.trim(), signedAmount: isCredit ? amount : -amount, raw: '' };
      current.rows.push(row);
      open = { row, parts: [op[3]!.trim()] };
      continue;
    }

    if (open && /^\s{4,}\S/.test(line)) open.parts.push(line.trim());
  }
  flush();

  const result = [...sections.values()].filter((s) => s.rows.length > 0 || s.openingBalance !== null);
  if (result.length === 0) throw new BadRequestError('Aucun compte trouvé dans ce relevé PDF');
  return { sections: result };
}

/** Année d'une opération `jj/mm` : celle de l'ancien solde si le mois ne recule pas, sinon celle du nouveau solde. */
function resolveDate(section: StatementSection, day: number, month: number): ISODate {
  const openingYear = section.openingDate ? Number(section.openingDate.slice(0, 4)) : new Date().getFullYear();
  const openingMonth = section.openingDate ? Number(section.openingDate.slice(5, 7)) : 1;
  const closingYear = section.closingDate ? Number(section.closingDate.slice(0, 4)) : openingYear + (month < openingMonth ? 1 : 0);
  const year = month >= openingMonth ? openingYear : closingYear;
  return fromParts(year, month, day);
}

/** Vérifie qu'ancien solde + crédits - débits = nouveau solde, pour chaque section. */
export function reconcile(section: StatementSection): { ok: boolean; expected: number | null; computed: number | null } {
  if (section.openingBalance === null || section.closingBalance === null) return { ok: false, expected: section.closingBalance, computed: null };
  const computed = section.rows.reduce((s, r) => s + r.signedAmount, section.openingBalance);
  return { ok: computed === section.closingBalance, expected: section.closingBalance, computed };
}

export function isPdf(buffer: Buffer): boolean {
  return buffer.subarray(0, 5).toString('latin1') === '%PDF-';
}

/** Texte en mode `-layout` via pdftotext (poppler), requis sur la machine. */
export function extractPdfText(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('pdftotext', ['-layout', '-enc', 'UTF-8', '-', '-'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d: Buffer) => (out += d.toString('utf8')));
    child.stderr.on('data', (d: Buffer) => (err += d.toString()));
    child.on('error', (e: NodeJS.ErrnoException) => {
      reject(new BadRequestError(e.code === 'ENOENT' ? "pdftotext est introuvable : installe poppler pour lire les relevés PDF" : e.message));
    });
    child.on('close', (code) => {
      if (code !== 0) return reject(new BadRequestError(`Lecture du PDF impossible${err ? ` : ${err.trim().slice(0, 200)}` : ''}`));
      resolve(out);
    });
    child.stdin.end(buffer);
  });
}
