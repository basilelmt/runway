import { beforeEach, describe, expect, it } from 'vitest';
import { matchPlanned } from './matching';
import { resetIds, tx } from './test-fixtures';

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
