import { describe, expect, it } from 'vitest';
import { cardPaymentDate, effectiveDate } from './payment-date';

describe('cardPaymentDate', () => {
  it('lit la date d’achat d’un paiement carte', () => {
    expect(cardPaymentDate('ACHAT CB SC-FOURTEEN CA 15.10.26 CARTE NUMERO 089', '2026-10-19')).toBe('2026-10-15');
    expect(cardPaymentDate('ACHAT CB Riot* 17.10.26 EUR 4,99 CARTE NO 089', '2026-10-19')).toBe('2026-10-17');
  });

  it('passe d’une année à l’autre', () => {
    expect(cardPaymentDate('ACHAT CB MONOP 31.12.25 CARTE NUMERO 089', '2026-01-02')).toBe('2025-12-31');
  });

  it('ignore ce qui n’est pas un paiement carte, sans date, ou une date invraisemblable', () => {
    expect(cardPaymentDate('PRELEVEMENT DE EDF 15.10.26', '2026-10-19')).toBeNull();
    expect(cardPaymentDate('ACHAT CB BOLT.EU/O/2512', '2026-10-19')).toBeNull();
    expect(cardPaymentDate('ACHAT CB X 20.10.26', '2026-10-19')).toBeNull();
    expect(cardPaymentDate('ACHAT CB X 01.08.26', '2026-10-19')).toBeNull();
    expect(cardPaymentDate('ACHAT CB X 31.02.26', '2026-03-02')).toBeNull();
  });
});

describe('effectiveDate', () => {
  it('prend la date d’achat si elle existe, sinon la date de l’opération', () => {
    expect(effectiveDate({ label: 'ACHAT CB SNCF 13.10.26 CARTE NUMERO 089', date: '2026-10-14' })).toBe('2026-10-13');
    expect(effectiveDate({ label: 'VIREMENT DE LEO', date: '2026-10-14' })).toBe('2026-10-14');
  });
});
