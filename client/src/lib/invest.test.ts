import { describe, expect, it } from 'vitest';
import { domainOf, failedAnglesText, formatMarketContext, formatPct, formatQty, gainTone, runOutcome } from './invest';
import { ideasTotal } from '@shared/invest';
import { openIdea } from '@/components/invest/idea-fixture';

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
  it('formatMarketContext', () => {
    expect(formatMarketContext({ perf3m: 0.18, benchPerf3m: 0.04 })).toBe('Avant l’idée : +18,0 % sur 3 mois (S&P 500 +4,0 %)');
    expect(formatMarketContext({ perf3m: -0.052, benchPerf3m: 0.01 })).toBe('Avant l’idée : -5,2 % sur 3 mois (S&P 500 +1,0 %)');
  });
  it('runOutcome', () => {
    expect(runOutcome({ acceptedCount: 2, candidateCount: 9 })).toBe('2 idées retenues sur 9 pistes');
    expect(runOutcome({ acceptedCount: 1, candidateCount: 1 })).toBe('1 idée retenue sur 1 piste');
    expect(runOutcome({ acceptedCount: 0, candidateCount: 9 })).toBe('Rien de convaincant cette fois · 9 pistes écartées');
    expect(runOutcome({ acceptedCount: 0, candidateCount: 1 })).toBe('Rien de convaincant cette fois · 1 piste écartée');
    expect(runOutcome({ acceptedCount: 0, candidateCount: 0 })).toBe('Aucune piste trouvée');
  });
  it('failedAnglesText', () => {
    expect(failedAnglesText([{ label: 'International' }])).toBe('Le chercheur International n’a pas répondu.');
    expect(failedAnglesText([{ label: 'International' }, { label: 'Calendrier' }])).toBe('Les chercheurs International et Calendrier n’ont pas répondu.');
  });
});

describe('ideasTotal', () => {
  it('moyenne les idées cotées et le S&P 500 sur leurs périodes, sans compter les idées sans cours', () => {
    expect(ideasTotal([])).toBeNull();
    expect(ideasTotal([{ ...openIdea, return: null }])).toBeNull();
    const total = ideasTotal([openIdea, { ...openIdea, return: -0.023, benchReturn: 0.03 }, { ...openIdea, return: null }]);
    expect(total?.count).toBe(2);
    expect(total?.ideas).toBeCloseTo(0.03);
    expect(total?.bench).toBeCloseTo(0.02);
  });
});
