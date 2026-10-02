import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cleanPdfLabel, isPdf, parseLbpStatementText, reconcile } from '../src/parsers/lbp-pdf';

const text = readFileSync(fileURLToPath(new URL('./fixtures/lbp-statement.txt', import.meta.url)), 'utf8');

describe('parseLbpStatementText', () => {
  const { sections } = parseLbpStatementText(text);

  it('trouve les deux comptes avec leurs soldes', () => {
    expect(sections.map((s) => [s.accountName, s.bankAccountNumber])).toEqual([
      ['Compte courant', '1234567K890'],
      ['Livret A', '9998888777V'],
    ]);
    expect(sections[0]?.iban).toBe('FR0720041010091234567K89063');
    expect(sections[1]?.iban).toBe('FR5110011000209998888777V73');
    expect(sections[0]).toMatchObject({ openingDate: '2024-12-06', openingBalance: 607_17, closingDate: '2025-01-07', closingBalance: 617_14 });
    expect(sections[1]).toMatchObject({ openingBalance: 3520_80, closingBalance: 3528_81 });
  });

  it('lit les opérations sur plusieurs pages, avec le bon sens et la bonne année', () => {
    const ccp = sections[0]!;
    expect(ccp.rows.map((r) => [r.date, r.signedAmount])).toEqual([
      ['2024-12-09', -4_86],
      ['2024-12-10', -15_67],
      ['2024-12-13', -20_00],
      ['2024-12-18', 45_00],
      ['2025-01-02', -96_30],
      ['2025-01-06', -10_80],
      ['2025-01-06', 112_60],
    ]);
  });

  it('fusionne les lignes de suite dans le libellé et garde le brut en note', () => {
    const ccp = sections[0]!;
    expect(ccp.rows[0]?.label).toBe('ACHAT CB CARREFOUR CITY');
    expect(ccp.rows[2]?.label).toBe('VIREMENT INSTANTANE A Max PAYLIB LB45876922 merci');
    expect(ccp.rows[1]?.raw).toContain('MENSUALITE PRET ETUDIANT');
    expect(ccp.rows[1]?.label).not.toContain('IDENT');
    expect(sections[1]?.rows[0]?.label).toBe('VIREMENT POUR M DUPONT JEAN DEFAULT');
  });

  it('les soldes se recoupent', () => {
    for (const s of sections) expect(reconcile(s)).toMatchObject({ ok: true });
  });
});

describe('cleanPdfLabel', () => {
  it('retire le bruit bancaire', () => {
    expect(cleanPdfLabel('ACHAT CB MICROSOFT*SUBS 07.12.24 EUR 11,99 CARTE NO 844')).toBe('ACHAT CB MICROSOFT*SUBS');
    expect(cleanPdfLabel('CARTE X2089 26/12/25 A 15H41 RETRAIT DAB LA BANQUE POSTALE')).toBe('CARTE X2089 RETRAIT DAB LA BANQUE POSTALE');
    expect(cleanPdfLabel('CREDIT CARTE BANCAIRE HOTELCOM7207466 25.05.26 CANADA CARTE NUMERO 089 1CAD= 0,622736EUR')).toBe('CREDIT CARTE BANCAIRE HOTELCOM7207466 CANADA');
  });
});

describe('isPdf', () => {
  it('reconnaît la signature', () => {
    expect(isPdf(Buffer.from('%PDF-1.7 ...'))).toBe(true);
    expect(isPdf(Buffer.from('Date;Libellé'))).toBe(false);
  });
});
