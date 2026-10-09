import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { filtersFromParams, operationsHref } from './TransactionFilters';

describe('operationsHref', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-09T12:00:00'));
  });
  afterEach(() => vi.useRealTimers());

  it('laisse le preset par défaut pour le mois en cours', () => {
    expect(operationsHref({ envelope: 14, from: '2026-10-01', to: '2026-10-31' })).toBe('/operations?envelope=14');
    expect(operationsHref({ from: '2026-10-01', to: '2026-10-31' })).toBe('/operations');
  });

  it('choisit « Mois dernier » pour le mois précédent', () => {
    const href = operationsHref({ envelope: 14, from: '2026-09-01', to: '2026-09-30' });
    expect(href).toBe('/operations?envelope=14&period=last-month');
    expect(filtersFromParams(new URL(href, 'http://x').searchParams)).toMatchObject({ envelope: 14, period: 'last-month' });
  });

  it('garde des dates explicites pour toute autre plage', () => {
    expect(operationsHref({ envelope: 14, from: '2026-08-01', to: '2026-10-31' })).toBe('/operations?envelope=14&period=custom&from=2026-08-01&to=2026-10-31');
    expect(operationsHref({ envelope: 14, from: '2026-10-01', to: '2026-10-09' })).toBe('/operations?envelope=14&period=custom&from=2026-10-01&to=2026-10-09');
  });
});
