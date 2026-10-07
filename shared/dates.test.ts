import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  daysBetween,
  daysInMonth,
  endOfMonth,
  formatDateMedium,
  formatDateWithWeekday,
  isValidISODate,
  monthKey,
  startOfMonth,
  toISODate,
} from './dates';

describe('dates', () => {
  it('toISODate ignore le fuseau et l’heure', () => {
    expect(toISODate(new Date(2026, 2, 5, 23, 59))).toBe('2026-03-05');
  });

  it('addDays traverse les mois et les années', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('addMonths borne au dernier jour du mois', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2026-01-15', 1, 31)).toBe('2026-02-28');
    expect(addMonths('2026-02-28', 1, 31)).toBe('2026-03-31');
    expect(addMonths('2026-11-10', 3, 10)).toBe('2027-02-10');
  });

  it('daysBetween est signé', () => {
    expect(daysBetween('2026-03-01', '2026-03-11')).toBe(10);
    expect(daysBetween('2026-03-11', '2026-03-01')).toBe(-10);
  });

  it('bornes de mois', () => {
    expect(startOfMonth('2026-03-17')).toBe('2026-03-01');
    expect(endOfMonth('2026-02-03')).toBe('2026-02-28');
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(monthKey('2026-03-17')).toBe('2026-03');
  });

  it('valide le format', () => {
    expect(isValidISODate('2026-02-29')).toBe(false);
    expect(isValidISODate('2024-02-29')).toBe(true);
    expect(isValidISODate('26-02-01')).toBe(false);
  });
});

describe('formats de date des champs', () => {
  it('affiche le jour de la semaine en français', () => {
    expect(formatDateWithWeekday('2026-10-01')).toBe('jeu. 1 oct. 2026');
  });

  it('affiche une date moyenne avec l’année', () => {
    expect(formatDateMedium('2026-10-01')).toBe('1 oct. 2026');
  });
});
