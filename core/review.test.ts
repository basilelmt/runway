import { beforeEach, describe, expect, it } from 'vitest';
import { monthReview, type ReviewState } from './review';
import { account, envelope, resetIds, rule, tx } from './test-fixtures';

describe('monthReview', () => {
  beforeEach(resetIds);

  const courant = () => account({ name: 'Courant' });

  function expenses(envelopeId: number, amounts: { month: string; amount: number; recurringRuleId?: number | null }[]) {
    return amounts.map(({ month, amount, recurringRuleId }) =>
      tx({ kind: 'expense', amount, envelopeId, date: `${month}-15`, recurringRuleId: recurringRuleId ?? null }),
    );
  }

  it('chiffres du mois : revenus, dépenses hors épargne et épargne, sur les opérations confirmées', () => {
    const c = courant();
    const livret = account({ name: 'Livret', onBudget: false });
    const courses = envelope({ name: 'Courses' });
    const bourse = envelope({ name: 'Bourse', isSavings: true });
    const transactions = [
      tx({ kind: 'income', amount: 2500_00, accountId: c.id, date: '2026-09-02' }),
      tx({ kind: 'expense', amount: 300_00, accountId: c.id, envelopeId: courses.id, date: '2026-09-05' }),
      tx({ kind: 'expense', amount: 50_00, accountId: c.id, envelopeId: bourse.id, date: '2026-09-06' }),
      tx({ kind: 'transfer', amount: 100_00, accountId: c.id, toAccountId: livret.id, date: '2026-09-07' }),
      // Hors mois : ignoré.
      tx({ kind: 'expense', amount: 999_00, accountId: c.id, envelopeId: courses.id, date: '2026-08-20' }),
      // Prévue, pas confirmée : ignorée.
      tx({ kind: 'expense', amount: 40_00, accountId: c.id, envelopeId: courses.id, date: '2026-09-10', status: 'planned' }),
    ];
    const state: ReviewState = { accounts: [c, livret], envelopes: [courses, bourse], transactions, reviews: [] };
    const result = monthReview(state, [], '2026-09', '2026-10-10');
    expect(result.figures).toEqual({ income: 2500_00, spent: 300_00, saved: 150_00 });
  });

  it('propositions : médiane des 3 mois, arrondie à la dizaine supérieure, affichées du plus ancien au plus récent', () => {
    const restos = envelope({ name: 'Restos', monthlyExtra: 180_00 });
    const transactions = expenses(restos.id, [
      { month: '2026-07', amount: 352_00 },
      { month: '2026-08', amount: 325_00 },
      { month: '2026-09', amount: 681_00 },
    ]);
    const state: ReviewState = { accounts: [], envelopes: [restos], transactions, reviews: [] };
    const result = monthReview(state, [], '2026-09', '2026-10-10');
    expect(result.proposals).toEqual([{ envelopeId: restos.id, name: 'Restos', currentExtra: 180_00, proposedExtra: 360_00, monthsSpent: [352_00, 325_00, 681_00] }]);
  });

  it('seuils : écart sous 20 € ou sous 15 % du complément actuel, pas de proposition', () => {
    // Médiane à 190 € : 10 € d'écart avec 180 €, sous les 20 €.
    const sousVingt = envelope({ name: 'SousVingt', monthlyExtra: 180_00 });
    // Médiane à 220 € : 20 € d'écart, mais 20 € n'est pas strictement > 20 €.
    const pileVingt = envelope({ name: 'PileVingt', monthlyExtra: 200_00 });
    // Complément à 1000 € : 15 % = 150 €. Médiane à 1140 € : 140 € d'écart, sous les 15 %.
    const sousQuinzePourcent = envelope({ name: 'SousQuinzePourcent', monthlyExtra: 1000_00 });
    const transactions = [
      ...expenses(sousVingt.id, [{ month: '2026-07', amount: 190_00 }, { month: '2026-08', amount: 190_00 }, { month: '2026-09', amount: 190_00 }]),
      ...expenses(pileVingt.id, [{ month: '2026-07', amount: 220_00 }, { month: '2026-08', amount: 220_00 }, { month: '2026-09', amount: 220_00 }]),
      ...expenses(sousQuinzePourcent.id, [{ month: '2026-07', amount: 1140_00 }, { month: '2026-08', amount: 1140_00 }, { month: '2026-09', amount: 1140_00 }]),
    ];
    const state: ReviewState = { accounts: [], envelopes: [sousVingt, pileVingt, sousQuinzePourcent], transactions, reviews: [] };
    const result = monthReview(state, [], '2026-09', '2026-10-10');
    expect(result.proposals).toEqual([]);
  });

  it('complément absent ou nul : seul le seuil de 20 € compte', () => {
    const sansComplement = envelope({ name: 'SansComplement', monthlyExtra: null });
    const transactions = expenses(sansComplement.id, [{ month: '2026-07', amount: 21_00 }, { month: '2026-08', amount: 21_00 }, { month: '2026-09', amount: 21_00 }]);
    const state: ReviewState = { accounts: [], envelopes: [sansComplement], transactions, reviews: [] };
    const result = monthReview(state, [], '2026-09', '2026-10-10');
    expect(result.proposals).toEqual([{ envelopeId: sansComplement.id, name: 'SansComplement', currentExtra: null, proposedExtra: 30_00, monthsSpent: [21_00, 21_00, 21_00] }]);
  });

  it('mois manquants en début d’historique : un mois antérieur à la première opération ne compte pas, et sous 2 mois disponibles, pas de proposition', () => {
    const restos = envelope({ name: 'Restos', monthlyExtra: 100_00 });
    // Première opération de la base : en septembre, le mois même passé en revue. Juillet et août n'ont jamais existé.
    const transactions = expenses(restos.id, [{ month: '2026-09', amount: 500_00 }]);
    const state: ReviewState = { accounts: [], envelopes: [restos], transactions, reviews: [] };
    const result = monthReview(state, [], '2026-09', '2026-10-10');
    expect(result.proposals).toEqual([]);
  });

  it('avec exactement 2 mois disponibles, la proposition se fait sur leur médiane', () => {
    const restos = envelope({ name: 'Restos', monthlyExtra: 100_00 });
    const transactions = expenses(restos.id, [{ month: '2026-08', amount: 500_00 }, { month: '2026-09', amount: 700_00 }]);
    const state: ReviewState = { accounts: [], envelopes: [restos], transactions, reviews: [] };
    const result = monthReview(state, [], '2026-09', '2026-10-10');
    // Médiane de 2 valeurs = leur moyenne : 600 €, déjà un multiple de 10.
    expect(result.proposals).toEqual([{ envelopeId: restos.id, name: 'Restos', currentExtra: 100_00, proposedExtra: 600_00, monthsSpent: [500_00, 700_00] }]);
  });

  it('exclut les dépenses issues d’une charge fixe du calcul de la proposition', () => {
    const logement = envelope({ name: 'Logement', monthlyExtra: 50_00 });
    const loyer = rule({ kind: 'expense', amount: 900_00, envelopeId: logement.id });
    const transactions = expenses(logement.id, [
      { month: '2026-07', amount: 900_00, recurringRuleId: loyer.id },
      { month: '2026-08', amount: 900_00, recurringRuleId: loyer.id },
      { month: '2026-09', amount: 900_00, recurringRuleId: loyer.id },
    ]);
    const state: ReviewState = { accounts: [], envelopes: [logement], transactions, reviews: [] };
    const result = monthReview(state, [loyer], '2026-09', '2026-10-10');
    // Sans dépense courante, la médiane tombe à 0 : seules les charges fixes sont exclues du calcul.
    expect(result.proposals).toEqual([{ envelopeId: logement.id, name: 'Logement', currentExtra: 50_00, proposedExtra: 0, monthsSpent: [0, 0, 0] }]);
  });

  it('exclut les enveloppes d’épargne et archivées des propositions', () => {
    const bourse = envelope({ name: 'Bourse', isSavings: true, monthlyExtra: 100_00 });
    const ancienne = envelope({ name: 'Ancienne', archived: true, monthlyExtra: 100_00 });
    const transactions = [
      ...expenses(bourse.id, [{ month: '2026-07', amount: 500_00 }, { month: '2026-08', amount: 500_00 }, { month: '2026-09', amount: 500_00 }]),
      ...expenses(ancienne.id, [{ month: '2026-07', amount: 500_00 }, { month: '2026-08', amount: 500_00 }, { month: '2026-09', amount: 500_00 }]),
    ];
    const state: ReviewState = { accounts: [], envelopes: [bourse, ancienne], transactions, reviews: [] };
    const result = monthReview(state, [], '2026-09', '2026-10-10');
    expect(result.proposals).toEqual([]);
  });

  it('enveloppes : dépassements d’abord du plus gros au plus petit, puis l’ordre de la page Budget', () => {
    const a = envelope({ name: 'A', monthlyExtra: 100_00, sortOrder: 1 });
    const b = envelope({ name: 'B', monthlyExtra: 100_00, sortOrder: 0 });
    const c = envelope({ name: 'C', monthlyExtra: 50_00, sortOrder: 2 });
    const transactions = [
      tx({ kind: 'expense', amount: 120_00, envelopeId: a.id, date: '2026-09-05' }),
      tx({ kind: 'expense', amount: 90_00, envelopeId: b.id, date: '2026-09-05' }),
      tx({ kind: 'expense', amount: 200_00, envelopeId: c.id, date: '2026-09-05' }),
    ];
    const state: ReviewState = { accounts: [], envelopes: [a, b, c], transactions, reviews: [] };
    const result = monthReview(state, [], '2026-09', '2026-10-10');
    expect(result.envelopes.map((e) => e.name)).toEqual(['C', 'A', 'B']);
  });

  it('enveloppes : ignore celles sans budget ni dépense ce mois-là, et les archivées', () => {
    const vide = envelope({ name: 'Vide', monthlyExtra: null });
    const archivee = envelope({ name: 'Archivée', monthlyExtra: 50_00, archived: true });
    const transactions: ReturnType<typeof tx>[] = [];
    const state: ReviewState = { accounts: [], envelopes: [vide, archivee], transactions, reviews: [] };
    const result = monthReview(state, [], '2026-09', '2026-10-10');
    expect(result.envelopes).toEqual([]);
  });

  it('restes : disponible pour le bilan non validé du mois qui précède directement aujourd’hui', () => {
    const c = courant();
    const courses = envelope({ name: 'Courses', monthlyExtra: 300_00 });
    const transactions = [tx({ kind: 'allocation', amount: 300_00, envelopeId: courses.id, date: '2026-09-01' }), tx({ kind: 'expense', amount: 100_00, accountId: c.id, envelopeId: courses.id, date: '2026-09-05' })];
    const state: ReviewState = { accounts: [c], envelopes: [courses], transactions, reviews: [] };
    const result = monthReview(state, [], '2026-09', '2026-10-10');
    expect(result.remainders).toEqual([{ envelopeId: courses.id, name: 'Courses', color: courses.color, amount: 200_00 }]);
  });

  it('restes : absents pour un mois déjà validé', () => {
    const c = courant();
    const courses = envelope({ name: 'Courses', monthlyExtra: 300_00 });
    const transactions = [tx({ kind: 'allocation', amount: 300_00, envelopeId: courses.id, date: '2026-09-01' })];
    const state: ReviewState = {
      accounts: [c],
      envelopes: [courses],
      transactions,
      reviews: [{ month: '2026-09', reviewedAt: '2026-10-02T08:00:00.000Z', applied: { budgets: [], allocationIds: [] } }],
    };
    const result = monthReview(state, [], '2026-09', '2026-10-10');
    expect(result.remainders).toBeNull();
    expect(result.status).toEqual({ validated: true, reviewedAt: '2026-10-02T08:00:00.000Z', applied: { budgets: [], allocationIds: [] } });
  });

  it('restes : absents pour un mois plus ancien que le mois précédent', () => {
    const c = courant();
    const courses = envelope({ name: 'Courses', monthlyExtra: 300_00 });
    const transactions = [tx({ kind: 'allocation', amount: 300_00, envelopeId: courses.id, date: '2026-08-01' })];
    const state: ReviewState = { accounts: [c], envelopes: [courses], transactions, reviews: [] };
    const result = monthReview(state, [], '2026-08', '2026-10-10');
    expect(result.remainders).toBeNull();
  });

  it('un reste à zéro ou négatif n’apparaît pas', () => {
    const c = courant();
    const courses = envelope({ name: 'Courses', monthlyExtra: 300_00 });
    const transactions = [tx({ kind: 'allocation', amount: 300_00, envelopeId: courses.id, date: '2026-09-01' }), tx({ kind: 'expense', amount: 300_00, accountId: c.id, envelopeId: courses.id, date: '2026-09-05' })];
    const state: ReviewState = { accounts: [c], envelopes: [courses], transactions, reviews: [] };
    const result = monthReview(state, [], '2026-09', '2026-10-10');
    expect(result.remainders).toEqual([]);
  });

  it('statut : non validé par défaut', () => {
    const state: ReviewState = { accounts: [], envelopes: [], transactions: [], reviews: [] };
    const result = monthReview(state, [], '2026-09', '2026-10-10');
    expect(result.status).toEqual({ validated: false, reviewedAt: null, applied: null });
  });

  it('contrôle d’ensemble : budget du mois courant face au revenu médian des mêmes 3 mois', () => {
    const restos = envelope({ name: 'Restos', monthlyExtra: 180_00 });
    const transactions = [
      tx({ kind: 'income', amount: 2800_00, date: '2026-07-02' }),
      tx({ kind: 'income', amount: 2900_00, date: '2026-08-02' }),
      tx({ kind: 'income', amount: 2850_00, date: '2026-09-02' }),
    ];
    const state: ReviewState = { accounts: [], envelopes: [restos], transactions, reviews: [] };
    const result = monthReview(state, [], '2026-09', '2026-10-10');
    expect(result.control).toEqual({ envelopes: [{ envelopeId: restos.id, monthlyCharges: 0, monthlyBudget: 180_00 }], medianIncome: 2850_00 });
  });
});
