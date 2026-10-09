import type { TransactionKind } from '@shared/schemas';

/** Seules les dépenses et les revenus ont un marchand ; virements et répartitions gardent leur libellé. */
export const MERCHANT_KINDS: readonly TransactionKind[] = ['expense', 'income'];

/** Préfixes bancaires retirés en tête du libellé normalisé ; le plus long qui correspond l'emporte. */
export const MERCHANT_PREFIXES = [
  'ACHAT CB',
  'CREDIT CARTE BANCAIRE',
  'PRELEVEMENT DE',
  'VIREMENT PERMANENT POUR',
  'VIREMENT INSTANTANE WERO A',
  'VIREMENT INSTANTANE WERO DE',
  'VIREMENT INSTANTANE A',
  'VIREMENT INSTANTANE DE',
  'VIREMENT DE',
  'VIREMENT POUR',
  'WERO A',
] as const;

/** Intermédiaires de paiement retirés en tête, après le préfixe : « SUMUP *OCCHIO » devient « OCCHIO ». */
export const PAYMENT_INTERMEDIARIES = ['SUMUP', 'PAYPAL', 'SNP', 'SQ', 'ZTL'] as const;

const MONTHS = 'JANVIER|FEVRIER|MARS|AVRIL|MAI|JUIN|JUILLET|AOUT|SEPTEMBRE|OCTOBRE|NOVEMBRE|DECEMBRE';

/** Bruit retiré du libellé, dans cet ordre : la référence d'abord (elle emporte tout ce qui la suit), les chiffres collés en dernier. */
export const MERCHANT_NOISE: readonly { name: string; pattern: RegExp }[] = [
  { name: 'référence', pattern: /\b(?:EX )?REF(?:ERENCE)? ?:.*$/ },
  { name: 'Apple Pay', pattern: /\bAPPLE PAY\b/g },
  { name: 'numéro de carte', pattern: /\bCARTE (?:NUMERO|NO) \d+\b/g },
  { name: 'carte masquée', pattern: /\bCARTE X\d{4}\b/g },
  { name: 'montant en devise', pattern: /\b[A-Z]{3} \d+,\d{2}\b/g },
  { name: 'montant', pattern: /\b\d+,\d{2} ?[¤€]/g },
  { name: 'date', pattern: /\b\d{2}[./]\d{2}[./](?:\d{4}|\d{2})\b/g },
  { name: 'date espacée', pattern: /\b\d{2} \d{2} \d{4}\b/g },
  { name: 'mois', pattern: new RegExp(`\\b(?:${MONTHS}) ?\\d{4}\\b`, 'g') },
  { name: 'mois numérique', pattern: /\b\d{2}\/\d{4}\b/g },
  { name: 'date courte', pattern: /\b\d{2}\/\d{2}\b/g },
  { name: 'chiffres collés', pattern: /(?<=[A-Z])\d+(?=\s|$)/g },
];

/** Après le premier mot, un mot d'au moins cette longueur qui contient un chiffre est une référence : il part avec tout ce qui suit. */
export const REFERENCE_MIN_LENGTH = 6;

const prefixes = [...MERCHANT_PREFIXES].sort((a, b) => b.length - a.length);
const intermediary = new RegExp(`^(?:${PAYMENT_INTERMEDIARIES.join('|')}) ?\\* ?`);
const EDGES = /^[\s\-*.:,;/+]+|[\s\-*.:,;/+]+$/g;

function normalize(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Vrai si un préfixe bancaire connu s'applique en tête du libellé (normalisé). */
function hasKnownPrefix(label: string): boolean {
  const s = normalize(label);
  return prefixes.some((p) => s === p || s.startsWith(`${p} `));
}

/**
 * Clé du marchand tirée d'un libellé bancaire, sans Claude : normalisation, préfixe, intermédiaire de paiement,
 * bruit (dates, carte, montants, références) et ponctuation de bord retirés. Null si rien ne reste.
 */
export function merchantKey(label: string): string | null {
  let s = normalize(label);
  const prefix = prefixes.find((p) => s === p || s.startsWith(`${p} `));
  if (prefix) s = s.slice(prefix.length).trim();
  s = s.replace(intermediary, '');
  for (const { pattern } of MERCHANT_NOISE) s = s.replace(pattern, ' ');
  const words = s.split(' ').filter(Boolean);
  const reference = words.findIndex((w, i) => i > 0 && w.length >= REFERENCE_MIN_LENGTH && /\d/.test(w));
  s = (reference > 0 ? words.slice(0, reference) : words).join(' ').replace(EDGES, '');
  return s === '' ? null : s;
}

/** Clé d'une opération : celle du libellé pour une dépense ou un revenu, null sinon. */
export function merchantKeyFor(kind: TransactionKind, label: string): string | null {
  return MERCHANT_KINDS.includes(kind) ? merchantKey(label) : null;
}

/** Mots de liaison laissés en minuscules après le premier mot : « Le Pain de la ». */
const MINOR_WORDS = new Set(['A', 'AU', 'AUX', 'D', 'DE', 'DES', 'DU', 'EN', 'ET', 'L', 'LA', 'LE', 'LES', 'SUR']);

function titleWord(word: string): string {
  return word
    .toLowerCase()
    .replace(/(^|[-/*])(\p{L})/gu, (_m, before: string, letter: string) => before + letter.toUpperCase())
    .replace(/^([LD]')(\p{L})/u, (_m, elision: string, letter: string) => elision + letter.toUpperCase());
}

function titleCaseKey(key: string): string {
  return key
    .split(' ')
    .map((word, i) => (i > 0 && MINOR_WORDS.has(word) ? word.toLowerCase() : titleWord(word)))
    .join(' ')
    .replace(/'/g, '’');
}

/**
 * Nom d'une clé que personne n'a encore nommée.
 * Un libellé saisi à la main (au moins une minuscule, aucun préfixe bancaire connu) garde ses accents tel quel,
 * espaces compactés : « Café de Léa » reste « Café de Léa ».
 * Sinon, la clé en casse de titre, apostrophes typographiques : « ACHAT CB Uniqlo » donne « Uniqlo ».
 */
export function merchantFallbackName(key: string, label: string): string {
  if (/\p{Ll}/u.test(label) && !hasKnownPrefix(label)) {
    return label.replace(/\s+/g, ' ').trim();
  }
  return titleCaseKey(key);
}

/** Nom affiché du marchand d'une opération : le nom donné, sinon le repli tiré du libellé et de la clé, null sans clé. */
export function merchantDisplayName(key: string | null, name: string | null, label: string | null): string | null {
  if (key === null) return null;
  return name ?? merchantFallbackName(key, label ?? '');
}
