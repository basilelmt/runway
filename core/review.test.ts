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

  it('chiffres du mois : un remboursement rangé dans une enveloppe déduit le dépensé, jamais sous zéro', () => {
    const c = courant();
    const shopping = envelope({ name: 'Shopping' });
    const transactions = [
      tx({ kind: 'expense', amount: 60_00, accountId: c.id, envelopeId: shopping.id, date: '2026-09-05' }),
      // Un avoir Uniqlo rangé dans Shopping : vient en déduction du dépensé de la même enveloppe.
      tx({ kind: 'income', amount: 20_00, accountId: c.id, envelopeId: shopping.id, date: '2026-09-12' }),
      // Dépense à trier, non affectée par le remboursement d'une autre enveloppe.
      tx({ kind: 'expense', amount: 15_00, accountId: c.id, date: '2026-09-08' }),
    ];
    const state: ReviewState = { accounts: [c], envelopes: [shopping], transactions, reviews: [] };
    const result = monthReview(state, [], '2026-09', '2026-10-10');
    // 60 - 20 (Shopping) + 15 (à trier) = 55.
    expect(result.figures.spent).toBe(55_00);
    // Déjà déduit du dépensé, le remboursement n'est pas compté une seconde fois en revenu.
    expect(result.figures.income).toBe(0);

    const bigRefund: ReviewState = {
      accounts: [c],
      envelopes: [shopping],
      transactions: [...transactions, tx({ kind: 'income', amount: 100_00, accountId: c.id, envelopeId: shopping.id, date: '2026-09-20' })],
      reviews: [],
    };
    // Shopping ne descend jamais sous zéro malgré un remboursement qui dépasse ses dépenses ; reste les 15 € à trier.
    expect(monthReview(bigRefund, [], '2026-09', '2026-10-10').figures.spent).toBe(15_00);
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

  it('exclut les charges fixes actuelles (pas seulement les opérations qui leur sont liées) du calcul de la proposition', () => {
    const logement = envelope({ name: 'Logement', monthlyExtra: 50_00 });
    const loyer = rule({ kind: 'expense', amount: 900_00, envelopeId: logement.id });
    // Aucune des opérations n'est liée à la règle (reprise d'un historique importé, par exemple) :
    // le filtre n'est plus sur l'origine de l'opération, mais sur le montant des charges actuelles.
    const transactions = expenses(logement.id, [
      { month: '2026-07', amount: 900_00 },
      { month: '2026-08', amount: 900_00 },
      { month: '2026-09', amount: 900_00 },
    ]);
    const state: ReviewState = { accounts: [], envelopes: [logement], transactions, reviews: [] };
    const result = monthReview(state, [loyer], '2026-09', '2026-10-10');
    // Sans dépense courante, la médiane tombe à 0 : seules les charges fixes sont exclues du calcul.
    expect(result.proposals).toEqual([{ envelopeId: logement.id, name: 'Logement', currentExtra: 50_00, proposedExtra: 0, monthsSpent: [0, 0, 0] }]);
  });

  it('budget d’un mois passé : charges actuelles même si la règle a démarré après coup (reprise d’historique)', () => {
    const logement = envelope({ name: 'Logement', monthlyExtra: null });
    // La règle n'existait pas encore en septembre : sans historique des budgets, on retient quand même
    // sa charge actuelle, plutôt qu'un budget à zéro que l'enveloppe n'a jamais eu sur le moment.
    const loyer = rule({ kind: 'expense', amount: 986_00, envelopeId: logement.id, startDate: '2026-10-01' });
    const transactions = expenses(logement.id, [
      { month: '2026-07', amount: 986_00 },
      { month: '2026-08', amount: 986_00 },
      { month: '2026-09', amount: 986_00 },
    ]);
    const state: ReviewState = { accounts: [], envelopes: [logement], transactions, reviews: [] };
    const result = monthReview(state, [loyer], '2026-09', '2026-10-10');
    expect(result.envelopes).toEqual([{ envelopeId: logement.id, name: 'Logement', color: logement.color, budget: 986_00, spent: 986_00, gap: 0 }]);
    // Dépensé = charges tous les mois : aucune dépense courante, donc aucune proposition.
    expect(result.proposals).toEqual([]);
  });

  it('propositions : dépenses courantes = dépensé du mois moins les charges actuelles ramenées au mois', () => {
    const transports = envelope({ name: 'Transports', monthlyExtra: 90_00 });
    const navigo = rule({ kind: 'expense', amount: 40_00, envelopeId: transports.id, startDate: '2026-10-01' });
    const transactions = expenses(transports.id, [
      { month: '2026-07', amount: 200_00 },
      { month: '2026-08', amount: 200_00 },
      { month: '2026-09', amount: 200_00 },
    ]);
    const state: ReviewState = { accounts: [], envelopes: [transports], transactions, reviews: [] };
    const result = monthReview(state, [navigo], '2026-09', '2026-10-10');
    expect(result.envelopes[0]).toMatchObject({ budget: 130_00, spent: 200_00, gap: 70_00 });
    expect(result.proposals).toEqual([{ envelopeId: transports.id, name: 'Transports', currentExtra: 90_00, proposedExtra: 160_00, monthsSpent: [160_00, 160_00, 160_00] }]);
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

  it('enveloppes : exclut l’épargne, qui n’a ni dépassement ni marge au sens budget', () => {
    const bourse = envelope({ name: 'Bourse', isSavings: true, monthlyExtra: 100_00 });
    const transactions = [tx({ kind: 'expense', amount: 50_00, envelopeId: bourse.id, date: '2026-09-05' })];
    const state: ReviewState = { accounts: [], envelopes: [bourse], transactions, reviews: [] };
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

  it('restes : une enveloppe réalimentée en octobre dont le reste de septembre était nul ne propose rien', () => {
    const c = courant();
    const courses = envelope({ name: 'Courses', monthlyExtra: 300_00 });
    const transactions = [
      // Septembre : tout dépensé, rien ne reste à la fin du mois.
      tx({ kind: 'allocation', amount: 300_00, envelopeId: courses.id, date: '2026-09-01' }),
      tx({ kind: 'expense', amount: 300_00, accountId: c.id, envelopeId: courses.id, date: '2026-09-05' }),
      // Octobre : budget du mois courant, à ne pas confondre avec un reste de septembre.
      tx({ kind: 'allocation', amount: 300_00, envelopeId: courses.id, date: '2026-10-01' }),
    ];
    const state: ReviewState = { accounts: [c], envelopes: [courses], transactions, reviews: [] };
    const result = monthReview(state, [], '2026-09', '2026-10-10');
    expect(result.remainders).toEqual([]);
  });

  it('restes : un reste de septembre partiellement dépensé depuis compte le minimum des deux soldes', () => {
    const c = courant();
    const courses = envelope({ name: 'Courses', monthlyExtra: 300_00 });
    const transactions = [
      // Fin septembre : 200 € de reste.
      tx({ kind: 'allocation', amount: 300_00, envelopeId: courses.id, date: '2026-09-01' }),
      tx({ kind: 'expense', amount: 100_00, accountId: c.id, envelopeId: courses.id, date: '2026-09-05' }),
      // Octobre : 50 € dépensés dessus, sans nouvelle répartition.
      tx({ kind: 'expense', amount: 50_00, accountId: c.id, envelopeId: courses.id, date: '2026-10-03' }),
    ];
    const state: ReviewState = { accounts: [c], envelopes: [courses], transactions, reviews: [] };
    const result = monthReview(state, [], '2026-09', '2026-10-10');
    // Solde fin septembre 200 €, solde aujourd'hui 150 € : le minimum des deux, pas le solde actuel.
    expect(result.remainders).toEqual([{ envelopeId: courses.id, name: 'Courses', color: courses.color, amount: 150_00 }]);
  });

  it('restes : le budget du mois courant versé en plus du reste de septembre ne gonfle pas le reste versable', () => {
    const c = courant();
    const courses = envelope({ name: 'Courses', monthlyExtra: 300_00 });
    const transactions = [
      // Fin septembre : 100 € de reste.
      tx({ kind: 'allocation', amount: 300_00, envelopeId: courses.id, date: '2026-09-01' }),
      tx({ kind: 'expense', amount: 200_00, accountId: c.id, envelopeId: courses.id, date: '2026-09-05' }),
      // Octobre : 300 € de budget du mois en plus, jamais dépensés.
      tx({ kind: 'allocation', amount: 300_00, envelopeId: courses.id, date: '2026-10-01' }),
    ];
    const state: ReviewState = { accounts: [c], envelopes: [courses], transactions, reviews: [] };
    const result = monthReview(state, [], '2026-09', '2026-10-10');
    // Solde aujourd'hui 400 €, mais seuls les 100 € de septembre sont versables.
    expect(result.remainders).toEqual([{ envelopeId: courses.id, name: 'Courses', color: courses.color, amount: 100_00 }]);
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
      // Remboursements rangés dans une enveloppe : déduits du dépensé, pas des revenus.
      tx({ kind: 'income', amount: 500_00, envelopeId: restos.id, date: '2026-07-20' }),
      tx({ kind: 'income', amount: 500_00, envelopeId: restos.id, date: '2026-08-20' }),
    ];
    const state: ReviewState = { accounts: [], envelopes: [restos], transactions, reviews: [] };
    const result = monthReview(state, [], '2026-09', '2026-10-10');
    expect(result.control).toEqual({ envelopes: [{ envelopeId: restos.id, monthlyCharges: 0, monthlyBudget: 180_00 }], medianIncome: 2850_00 });
  });
});
