import { describe, expect, it } from 'vitest';
import { runwayStatus } from './RunwayStrip';

describe('runwayStatus', () => {
  it('annonce une piste dégagée sans alerte', () => {
    expect(runwayStatus({ alerts: [], horizonDays: 90 })).toEqual({ tone: 'clear', text: 'Piste dégagée sur 90 jours' });
  });

  it('annonce le premier découvert avec le nom et le minimum', () => {
    const alert = { kind: 'account' as const, id: 1, name: 'Compte courant', firstNegativeDate: '2026-04-10', daysUntil: 26, minBalance: -24000, minBalanceDate: '2026-04-10' };
    expect(runwayStatus({ alerts: [alert], horizonDays: 90 })).toEqual({ tone: 'alert', text: 'Découvert dans 26 j · Compte courant · -240,00 €' });
  });

  it("dit aujourd'hui quand le découvert est déjà là", () => {
    const alert = { kind: 'envelope' as const, id: 4, name: 'Vacances', firstNegativeDate: '2026-10-02', daysUntil: 0, minBalance: -31000, minBalanceDate: '2026-10-02' };
    expect(runwayStatus({ alerts: [alert], horizonDays: 90 }).text).toBe("Découvert aujourd'hui · Vacances · -310,00 €");
  });
});
