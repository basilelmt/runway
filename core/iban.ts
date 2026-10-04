/**
 * Longueur des IBAN par pays (registre ISO 13616 tenu par SWIFT). Contraindre la longueur évite
 * de prendre pour un IBAN une référence collée au texte qui la suit une fois les espaces retirés.
 */
const IBAN_LENGTHS: Record<string, number> = {
  AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22, BI: 27, BR: 29, BY: 28,
  CH: 21, CR: 22, CY: 28, CZ: 24, DE: 22, DJ: 27, DK: 18, DO: 28, EE: 20, EG: 29, ES: 24, FI: 18,
  FK: 18, FO: 18, FR: 27, GB: 22, GE: 22, GI: 23, GL: 18, GR: 27, GT: 28, HR: 21, HU: 28, IE: 22,
  IL: 23, IQ: 23, IS: 26, IT: 27, JO: 30, KW: 30, KZ: 20, LB: 28, LC: 32, LI: 21, LT: 20, LU: 20,
  LV: 21, LY: 25, MC: 27, MD: 24, ME: 22, MK: 19, MN: 20, MR: 27, MT: 31, MU: 30, NI: 28, NL: 18,
  NO: 15, OM: 23, PK: 24, PL: 28, PS: 29, PT: 25, QA: 29, RO: 24, RS: 22, RU: 33, SA: 24, SC: 31,
  SD: 18, SE: 24, SI: 19, SK: 24, SM: 27, SO: 23, ST: 25, SV: 28, TL: 23, TN: 24, TR: 26, UA: 29,
  VA: 22, VG: 24, XK: 20, YE: 30,
};

/** Somme de contrôle ISO 13616 : quatre premiers caractères en fin, lettres en 10..35, reste modulo 97 égal à 1. */
export function isValidIban(iban: string): boolean {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban) || IBAN_LENGTHS[iban.slice(0, 2)] !== iban.length) return false;
  let rest = 0;
  for (const char of iban.slice(4) + iban.slice(0, 4)) {
    const value = Number.parseInt(char, 36);
    rest = value < 10 ? (rest * 10 + value) % 97 : (rest * 100 + value) % 97;
  }
  return rest === 1;
}

/**
 * IBAN valides cités dans un texte libre (libellé, note), renvoyés sans espaces.
 * Les espaces sont retirés avant la recherche car les banques groupent l'IBAN par quatre.
 */
export function extractIbans(text: string): string[] {
  const compact = text.replace(/\s/g, '').toUpperCase();
  const found: string[] = [];
  // Chaque position « code pays + 2 chiffres » est testée : une référence alphanumérique juste avant
  // l'IBAN ne doit pas le masquer.
  let next = 0;
  for (const match of compact.matchAll(/(?=[A-Z]{2}\d{2})/g)) {
    if (match.index < next) continue;
    const length = IBAN_LENGTHS[compact.slice(match.index, match.index + 2)];
    if (!length) continue;
    const candidate = compact.slice(match.index, match.index + length);
    if (isValidIban(candidate)) {
      found.push(candidate);
      next = match.index + length;
    }
  }
  return found;
}
