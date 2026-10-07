import { describe, expect, it } from 'vitest';
import {
  addQty, cmpQty, hasOversell, normalizeQty, fromUnits, ideasSummary, isZeroQty, portfolioSeries, position, priceOn, qtyToNumber,
  simpleReturn, subQty, toEur, toUnits, valueCents, type Trade,
} from './invest';

const buy = (date: string, quantity: string, amount: number, fees = 0): Trade => ({ side: 'buy', date, quantity, amount, fees });
const sell = (date: string, quantity: string, amount: number, fees = 0): Trade => ({ side: 'sell', date, quantity, amount, fees });

describe('quantités décimales', () => {
  it('additionne et soustrait sans perte', () => {
    expect(addQty('0.1', '0.2')).toBe('0.3');
    expect(subQty('1', '0.00000001')).toBe('0.99999999');
    expect(subQty('0.5', '0.5')).toBe('0');
  });
  it('compare et convertit', () => {
    expect(cmpQty('2', '10')).toBe(-1);
    expect(cmpQty('1.50', '1.5')).toBe(0);
    expect(isZeroQty('0.000')).toBe(true);
    expect(qtyToNumber('0.04512')).toBeCloseTo(0.04512);
    expect(fromUnits(toUnits('12.3400'))).toBe('12.34');
    expect(normalizeQty('0.01000000')).toBe('0.01');
  });
  it('ne descend jamais sous zéro', () => {
    expect(subQty('1', '2')).toBe('0');
  });
});

describe('position (PMP)', () => {
  it('cumule les achats, frais compris', () => {
    const p = position([buy('2025-10-01', '4', 2000_00, 1_00), buy('2025-11-01', '1', 1000_00, 1_00)]);
    expect(p).toEqual({ quantity: '5', costBasis: 3002_00, realized: 0 });
  });
  it('une vente sort au prix moyen et dégage une plus-value réalisée', () => {
    const p = position([buy('2025-10-01', '4', 2000_00), sell('2025-12-01', '1', 700_00, 1_00)]);
    expect(p.quantity).toBe('3');
    expect(p.costBasis).toBe(1500_00);
    expect(p.realized).toBe(700_00 - 1_00 - 500_00);
  });
  it("trie par date et s'arrête à la date demandée", () => {
    const trades = [buy('2025-11-01', '1', 100_00), buy('2025-10-01', '1', 50_00)];
    expect(position(trades, '2025-10-15')).toEqual({ quantity: '1', costBasis: 50_00, realized: 0 });
  });
  it('une vente plus grande que la position ne compte que la part détenue', () => {
    const p = position([buy('2025-10-01', '0.01', 600_00), sell('2025-11-01', '0.05', 3500_00)]);
    expect(p).toEqual({ quantity: '0', costBasis: 0, realized: 700_00 - 600_00 });
  });
  it('une toute petite vente sort bien une part du coût', () => {
    const p = position([buy('2025-10-01', '100000', 100_000_00), sell('2025-11-01', '0.5', 1_00)]);
    expect(p.costBasis).toBe(100_000_00 - 50);
  });
  it('tout vendre remet le coût à zéro', () => {
    const p = position([buy('2025-10-01', '0.3', 300_00), sell('2025-10-02', '0.3', 330_00)]);
    expect(p).toEqual({ quantity: '0', costBasis: 0, realized: 30_00 });
  });
});

describe('cours et devises', () => {
  const series = [
    { date: '2026-10-01', close: 100 },
    { date: '2026-10-02', close: 110 },
    { date: '2026-10-05', close: 120 },
  ];
  it('priceOn prend la dernière clôture connue à la date', () => {
    expect(priceOn(series, '2026-10-04')).toEqual({ date: '2026-10-02', close: 110 });
    expect(priceOn(series, '2026-09-30')).toBeNull();
  });
  it('toEur divise par le taux EURXXX et gère les pence', () => {
    expect(toEur(110, 'USD', 1.1)).toBeCloseTo(100);
    expect(toEur(5000, 'GBp', 0.85)).toBeCloseTo(50 / 0.85);
    expect(toEur(42, 'EUR', null)).toBe(42);
    expect(toEur(42, 'USD', null)).toBeNull();
  });
  it('valueCents arrondit au centime', () => {
    expect(valueCents('0.04512', 74136.26)).toBe(3345_03);
  });
});

describe('portfolioSeries', () => {
  it('valorise chaque jour avec le dernier cours connu', () => {
    const out = portfolioSeries(
      [{ trades: [buy('2026-10-02', '2', 200_00)], prices: [{ date: '2026-10-01', close: 100 }, { date: '2026-10-03', close: 120 }] }],
      '2026-10-01',
      '2026-10-04',
    );
    expect(out).toEqual([
      { date: '2026-10-01', value: 0, invested: 0 },
      { date: '2026-10-02', value: 200_00, invested: 200_00 },
      { date: '2026-10-03', value: 240_00, invested: 200_00 },
      { date: '2026-10-04', value: 240_00, invested: 200_00 },
    ]);
  });
});

describe('rendements des idées', () => {
  it('simpleReturn', () => {
    expect(simpleReturn(100, 112)).toBeCloseTo(0.12);
    expect(simpleReturn(0, 112)).toBeNull();
  });
  it('ideasSummary compte les victoires et simule 100 € par idée', () => {
    const s = ideasSummary([
      { return: 0.2, benchReturn: 0.05 },
      { return: -0.1, benchReturn: 0.02 },
    ]);
    expect(s.closedCount).toBe(2);
    expect(s.beatCount).toBe(1);
    expect(s.avgExcess).toBeCloseTo((0.15 - 0.12) / 2);
    expect(s.hundredEach).toEqual({ invested: 200_00, ideas: 120_00 + 90_00, bench: 105_00 + 102_00 });
  });
  it('bilan vide', () => {
    expect(ideasSummary([])).toEqual({ closedCount: 0, beatCount: 0, avgExcess: null, hundredEach: { invested: 0, ideas: 0, bench: 0 } });
  });
});

describe('hasOversell', () => {
  it('détecte une vente supérieure à la quantité détenue à sa date', () => {
    expect(hasOversell([buy('2025-10-01', '2', 100_00), sell('2025-10-02', '2', 120_00)])).toBe(false);
    expect(hasOversell([sell('2025-09-30', '1', 50_00), buy('2025-10-01', '2', 100_00)])).toBe(true);
    expect(hasOversell([buy('2025-10-01', '1', 100_00), sell('2025-10-02', '1.5', 120_00)])).toBe(true);
  });
});
