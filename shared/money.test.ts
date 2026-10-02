import { describe, expect, it } from 'vitest';
import { formatEuros, parseEuros } from './money';

describe('formatEuros', () => {
  it('formate zéro', () => {
    expect(formatEuros(0)).toBe('0,00 €');
  });

  it('sépare les milliers et les décimales à la française', () => {
    expect(formatEuros(123456)).toBe('1 234,56 €');
  });

  it('garde le signe moins devant', () => {
    expect(formatEuros(-5)).toBe('-0,05 €');
  });

  it('peut forcer le signe plus', () => {
    expect(formatEuros(1000, { signed: true })).toBe('+10,00 €');
    expect(formatEuros(0, { signed: true })).toBe('0,00 €');
  });
});

describe('parseEuros', () => {
  it.each([
    ['12,5', 1250],
    ['12.5', 1250],
    ['1 234,56', 123456],
    ['1 234,56', 123456],
    ['-3', -300],
    ['  42 € ', 4200],
    ['0,999', 100],
  ])('parse %s en %i centimes', (input, cents) => {
    expect(parseEuros(input)).toBe(cents);
  });

  it('refuse les entrées invalides', () => {
    expect(parseEuros('abc')).toBeNull();
    expect(parseEuros('')).toBeNull();
    expect(parseEuros('1,2,3')).toBeNull();
  });
});
