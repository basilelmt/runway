import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { detectParser } from '../src/parsers';
import { lbpParser, parseAmount, parseDate } from '../src/parsers/lbp';

const fixture = readFileSync(fileURLToPath(new URL('./fixtures/lbp.csv', import.meta.url)));

describe('lbpParser', () => {
  it('est détecté et refuse un CSV quelconque', () => {
    expect(detectParser(fixture)?.id).toBe('lbp');
    expect(detectParser(Buffer.from('a;b;c\n1;2;3\n'))).toBeNull();
  });

  it('lit l’en-tête et les opérations', () => {
    const s = lbpParser.parse(fixture);
    expect(s.bankAccountNumber).toBe('1234567A123');
    expect(s.statedBalance).toBe(1234_56);
    expect(s.rows).toHaveLength(8);
    expect(s.rows[0]).toEqual({ date: '2026-03-12', label: 'CARTE X1234 11/03 CARREFOUR MARKET', signedAmount: -62_30 });
    expect(s.rows[2]?.label).toBe('CARTE X1234 09/03 BOULANGERIE ÉLISE');
    expect(s.rows[3]?.signedAmount).toBe(120_00);
    expect(s.rows.at(-1)).toEqual({ date: '2026-02-28', label: 'VIREMENT SEPA EMPLOYEUR SA SALAIRE FEVRIER', signedAmount: 2000_00 });
  });

  it('tolère un fichier ré-encodé en UTF-8 avec BOM', () => {
    const utf8 = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('Numéro Compte ;42\nDate;Libellé;Montant(EUROS)\n01/01/2026;"Élan";-1,00\n', 'utf8')]);
    const s = lbpParser.parse(utf8);
    expect(s.bankAccountNumber).toBe('42');
    expect(s.rows[0]?.label).toBe('Élan');
  });

  it('parse dates et montants', () => {
    expect(parseDate('12/03/2026')).toBe('2026-03-12');
    expect(parseDate('2026-03-12')).toBeNull();
    expect(parseAmount('-62,30')).toBe(-62_30);
    expect(parseAmount('+1 234,5')).toBe(1234_50);
    expect(parseAmount('"12,00"')).toBe(12_00);
    expect(parseAmount('abc')).toBeNull();
  });
});
