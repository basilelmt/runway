import { beforeEach, describe, expect, it } from 'vitest';
import { monthActivity, remainingToFund, savedInMonth } from './budget';
import { account, envelope, resetIds, tx } from './test-fixtures';

describe('budget', () => {
  beforeEach(resetIds);

  it('monthActivity : répartitions nettes et dépenses confirmées du mois', () => {
    const courant = account({ name: 'Courant' });
    const courses = envelope({ name: 'Courses' });
    const loisirs = envelope({ name: 'Loisirs' });
    const { allocated, spent } = monthActivity(
      [
        tx({ kind: 'allocation', amount: 300_00, envelopeId: courses.id, date: '2026-03-01' }),
        tx({ kind: 'allocation', amount: 50_00, envelopeId: loisirs.id, fromEnvelopeId: courses.id, date: '2026-03-04' }),
        tx({ kind: 'allocation', amount: 999_00, envelopeId: courses.id, date: '2026-02-28' }),
        tx({ kind: 'expense', amount: 40_00, accountId: courant.id, envelopeId: courses.id, date: '2026-03-05' }),
        tx({ kind: 'expense', amount: 70_00, accountId: courant.id, envelopeId: courses.id, date: '2026-03-20', status: 'planned' }),
      ],
      '2026-03-10',
    );
    expect(allocated.get(courses.id)).toBe(250_00);
    expect(allocated.get(loisirs.id)).toBe(50_00);
    expect(spent.get(courses.id)).toBe(40_00);
  });

  it('remainingToFund : jamais négatif, nul sans budget', () => {
    expect(remainingToFund({ monthlyTarget: 400_00 }, 150_00)).toBe(250_00);
    expect(remainingToFund({ monthlyTarget: 400_00 }, 500_00)).toBe(0);
    expect(remainingToFund({ monthlyTarget: null }, 0)).toBe(0);
  });

  it('savedInMonth : virements vers l’épargne, retraits déduits, dépenses des enveloppes d’épargne', () => {
    const courant = account({ name: 'Courant', onBudget: true });
    const livret = account({ name: 'Livret', onBudget: false });
    const bourse = envelope({ name: 'Bourse', isSavings: true });
    const courses = envelope({ name: 'Courses' });
    const saved = savedInMonth(
      [courant, livret],
      [bourse, courses],
      [
        tx({ kind: 'transfer', amount: 200_00, accountId: courant.id, toAccountId: livret.id, date: '2026-03-03' }),
        tx({ kind: 'transfer', amount: 50_00, accountId: livret.id, toAccountId: courant.id, date: '2026-03-08' }),
        tx({ kind: 'expense', amount: 100_00, accountId: courant.id, envelopeId: bourse.id, date: '2026-03-12' }),
        tx({ kind: 'expense', amount: 30_00, accountId: courant.id, envelopeId: courses.id, date: '2026-03-12' }),
        tx({ kind: 'transfer', amount: 500_00, accountId: courant.id, toAccountId: livret.id, date: '2026-02-27' }),
      ],
      '2026-03-15',
    );
    expect(saved).toBe(250_00);
  });
});
