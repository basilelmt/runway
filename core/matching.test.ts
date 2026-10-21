import { beforeEach, describe, expect, it } from 'vitest';
import type { ISODate } from '@shared/dates';
import type { RecurringRule, Transaction } from '@shared/schemas';
import { matchPlanned, occurrenceKey, settledEarly } from './matching';
import { resetIds, rule, tx } from './test-fixtures';

describe('matchPlanned', () => {
  beforeEach(resetIds);

  it('rapproche une importée d’une prévue proche', () => {
    const planned = tx({ kind: 'expense', amount: 800_00, date: '2026-03-05', status: 'planned', accountId: 1 });
    const m = matchPlanned([{ index: 0, date: '2026-03-07', signedAmount: -800_00 }], [planned]);
    expect(m.get(0)).toBe(planned.id);
  });

  it('ignore au-delà de la tolérance', () => {
    const planned = tx({ kind: 'expense', amount: 800_00, date: '2026-03-05', status: 'planned', accountId: 1 });
    const m = matchPlanned([{ index: 0, date: '2026-03-15', signedAmount: -800_00 }], [planned]);
    expect(m.size).toBe(0);
  });

  it('respecte le sens', () => {
    const planned = tx({ kind: 'income', amount: 800_00, date: '2026-03-05', status: 'planned', accountId: 1 });
    expect(matchPlanned([{ index: 0, date: '2026-03-05', signedAmount: -800_00 }], [planned]).size).toBe(0);
    expect(matchPlanned([{ index: 0, date: '2026-03-05', signedAmount: 800_00 }], [planned]).get(0)).toBe(planned.id);
  });

  it('n’utilise chaque prévue qu’une fois et préfère la plus proche', () => {
    const planned = tx({ kind: 'expense', amount: 50_00, date: '2026-03-05', status: 'planned', accountId: 1 });
    const m = matchPlanned(
      [
        { index: 0, date: '2026-03-09', signedAmount: -50_00 },
        { index: 1, date: '2026-03-06', signedAmount: -50_00 },
      ],
      [planned],
    );
    expect(m.get(1)).toBe(planned.id);
    expect(m.has(0)).toBe(false);
  });

  it('un transfert sortant prévu correspond à un débit importé', () => {
    const planned = tx({ kind: 'transfer', amount: 200_00, date: '2026-03-05', status: 'planned', accountId: 1, toAccountId: 2 });
    expect(matchPlanned([{ index: 0, date: '2026-03-05', signedAmount: -200_00 }], [planned]).get(0)).toBe(planned.id);
  });
});

describe('settledEarly', () => {
  beforeEach(resetIds);

  const salle = (partial: Partial<RecurringRule> = {}) =>
    rule({ kind: 'expense', amount: 31_96, accountId: 1, envelopeId: 2, dayOfMonth: 26, startDate: '2026-10-01', ...partial });
  const prelevement = (date: ISODate, partial: Partial<Transaction> = {}) =>
    tx({ kind: 'expense', amount: 31_96, accountId: 1, envelopeId: 2, date, ...partial });

  it('reconnaît un prélèvement arrivé avant la date de la règle', () => {
    const r = salle();
    const paye = prelevement('2026-10-14');
    const m = settledEarly([{ rule: r, date: '2026-10-26' }], [paye]);
    expect(m.get(occurrenceKey(r.id, '2026-10-26'))).toBe(paye.id);
  });

  it('ne reconnaît que jusqu’à une demi-période avant, et jamais après', () => {
    const r = salle();
    const m = settledEarly([{ rule: r, date: '2026-10-26' }], [prelevement('2026-10-10'), prelevement('2026-10-27')]);
    expect(m.size).toBe(0);
  });

  it('exige même compte, même montant, même enveloppe, sans règle déjà rattachée', () => {
    const r = salle();
    const m = settledEarly(
      [{ rule: r, date: '2026-10-26' }],
      [
        prelevement('2026-10-14', { accountId: 9 }),
        prelevement('2026-10-14', { amount: 31_95 }),
        prelevement('2026-10-14', { envelopeId: 9 }),
        prelevement('2026-10-14', { recurringRuleId: 99 }),
        prelevement('2026-10-14', { status: 'planned' }),
      ],
    );
    expect(m.size).toBe(0);
  });

  it('ignore une opération antérieure au début de la règle', () => {
    const r = salle({ dayOfMonth: 5, startDate: '2026-10-01' });
    const m = settledEarly([{ rule: r, date: '2026-10-05' }], [prelevement('2026-09-26')]);
    expect(m.size).toBe(0);
  });

  it('une opération ne règle qu’une occurrence', () => {
    const a = salle();
    const b = salle();
    const paye = prelevement('2026-10-20');
    const m = settledEarly([{ rule: a, date: '2026-10-26' }, { rule: b, date: '2026-10-22' }], [paye]);
    expect(m.size).toBe(1);
    expect(m.get(occurrenceKey(b.id, '2026-10-22'))).toBe(paye.id);
  });
});
