import type { SortingRule } from '@shared/schemas';

export function normalizeLabel(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Renvoie l'enveloppe de la première règle (par priorité croissante) dont le motif est contenu dans le libellé. */
export function applySortingRules(label: string, rules: Pick<SortingRule, 'pattern' | 'envelopeId' | 'priority'>[]): number | null {
  const normalized = normalizeLabel(label);
  const sorted = [...rules].sort((a, b) => a.priority - b.priority);
  for (const rule of sorted) {
    const pattern = normalizeLabel(rule.pattern);
    if (pattern && normalized.includes(pattern)) return rule.envelopeId;
  }
  return null;
}

const BANK_PREFIXES = /^(CB|CARTE|PRLV|PRELEVEMENT|VIR|VIREMENT|SEPA|INST|DE|VERS|M|MME|MR|MLLE|RETRAIT|DAB|ACHAT|PAIEMENT|FACTURE|ECH|ECHEANCE)\.?(\s+|$)/i;
const NOISE = /\b(\d{1,2}\/\d{1,2}(\/\d{2,4})?|\d{4,}|X\d{4}|[A-Z]{2}\d{2}[A-Z0-9]{10,})\b/g;

/** Propose un motif de règle lisible à partir d'un libellé bancaire. */
export function suggestPattern(label: string): string {
  let s = label.trim();
  let previous = '';
  while (s !== previous) {
    previous = s;
    s = s.replace(BANK_PREFIXES, '');
  }
  s = s.replace(NOISE, ' ').replace(/[^\p{L}\p{N} '&.-]/gu, ' ').replace(/\s+/g, ' ').trim();
  const letters = (s.match(/\p{L}/gu) ?? []).length;
  return letters >= 2 ? s : label.trim();
}
