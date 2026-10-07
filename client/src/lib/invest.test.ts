import { describe, expect, it } from 'vitest';
import { domainOf, formatPct, formatQty, gainTone } from './invest';

describe('format invest', () => {
  it('formatPct', () => {
    expect(formatPct(0.1234, { signed: true })).toBe('+12,3 %');
    expect(formatPct(-0.04, { signed: true })).toBe('-4,0 %');
    expect(formatPct(0.0001, { signed: true })).toBe('0,0 %');
    expect(formatPct(null)).toBe('-');
  });
  it('formatQty', () => {
    expect(formatQty('0.04512')).toBe('0,04512');
    expect(formatQty('5')).toBe('5');
    expect(formatQty('1234.5')).toBe('1 234,5');
    expect(formatQty('0.123456789012')).toBe('0,12345679');
  });
  it('gainTone', () => {
    expect(gainTone(1)).toBe('positive');
    expect(gainTone(-1)).toBe('negative');
    expect(gainTone(0)).toBe('neutral');
    expect(gainTone(null)).toBe('neutral');
  });
  it('domainOf', () => {
    expect(domainOf('https://www.lesechos.fr/a/b')).toBe('lesechos.fr');
    expect(domainOf('pas une url')).toBe('pas une url');
  });
});
