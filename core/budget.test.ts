import { beforeEach, describe, expect, it } from 'vitest';
import { envelopesToWatch, monthActivity, planAutoFunding, remainingToFund, savedInMonth, withBudgets } from './budget';
import { account, envelope, resetIds, rule, tx } from './test-fixtures';

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
    expect(remainingToFund({ monthlyBudget: 400_00 }, 150_00)).toBe(250_00);
    expect(remainingToFund({ monthlyBudget: 400_00 }, 500_00)).toBe(0);
    expect(remainingToFund({ monthlyBudget: 0 }, 0)).toBe(0);
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

describe('planAutoFunding', () => {
  beforeEach(resetIds);

  it('complète chaque enveloppe jusqu’à son budget, le surplus reste', () => {
    const courses = envelope({ name: 'Courses', monthlyExtra: 300_00, sortOrder: 0 });
    const loisirs = envelope({ name: 'Loisirs', monthlyExtra: 100_00, sortOrder: 1 });
    const plan = planAutoFunding([courses, loisirs], new Map([[courses.id, 50_00]]), 2000_00);
    expect(plan).toEqual({ items: [{ envelopeId: courses.id, amount: 250_00 }, { envelopeId: loisirs.id, amount: 100_00 }], shortfallCount: 0 });
  });

  it('en cas de manque, suit l’ordre de la page Budget et compte les incomplètes', () => {
    const a = envelope({ name: 'A', monthlyExtra: 100_00, sortOrder: 2 });
    const b = envelope({ name: 'B', monthlyExtra: 100_00, sortOrder: 0 });
    const c = envelope({ name: 'C', monthlyExtra: 100_00, sortOrder: 1 });
    const plan = planAutoFunding([a, b, c], new Map(), 150_00);
    expect(plan).toEqual({ items: [{ envelopeId: b.id, amount: 100_00 }, { envelopeId: c.id, amount: 50_00 }], shortfallCount: 2 });
  });

  it('ignore les enveloppes archivées, sans budget ou déjà complètes', () => {
    const archived = envelope({ name: 'Vieux', monthlyExtra: 100_00, archived: true });
    const free = envelope({ name: 'Libre', monthlyExtra: null });
    const full = envelope({ name: 'Pleine', monthlyExtra: 100_00 });
    expect(planAutoFunding([archived, free, full], new Map([[full.id, 100_00]]), 1000_00)).toEqual({ items: [], shortfallCount: 0 });
  });

  it('sans argent disponible, ne crée rien et signale les manques', () => {
    const courses = envelope({ name: 'Courses', monthlyExtra: 300_00 });
    expect(planAutoFunding([courses], new Map(), 0)).toEqual({ items: [], shortfallCount: 1 });
    expect(planAutoFunding([courses], new Map(), -50_00)).toEqual({ items: [], shortfallCount: 1 });
  });

  it('une enveloppe sans complément est complétée jusqu’à ses charges', () => {
    const logement = envelope({ name: 'Logement' });
    const loyer = rule({ kind: 'expense', amount: 986_00, envelopeId: logement.id });
    const [budgeted] = withBudgets([logement], [loyer], '2026-10-08');
    expect(remainingToFund(budgeted!, 0)).toBe(986_00);
    expect(planAutoFunding([budgeted!], new Map(), 2000_00)).toEqual({ items: [{ envelopeId: logement.id, amount: 986_00 }], shortfallCount: 0 });
  });
});

describe('withBudgets', () => {
  beforeEach(resetIds);
  const today = '2026-10-08';

  it('ramène chaque charge au mois et ajoute le complément', () => {
    const transports = envelope({ name: 'Transports', monthlyExtra: 90_00 });
    const banque = envelope({ name: 'Banque' });
    const rules = [
      rule({ kind: 'expense', amount: 40_00, envelopeId: transports.id }),
      // Trimestrielle 10,80 € = 3,60 € ; annuelle 120 € = 10 € ; hebdomadaire 10 € = 43,33 €.
      rule({ kind: 'expense', amount: 10_80, envelopeId: banque.id, interval: 3 }),
      rule({ kind: 'expense', amount: 120_00, envelopeId: banque.id, frequency: 'yearly' }),
      rule({ kind: 'expense', amount: 10_00, envelopeId: banque.id, frequency: 'weekly' }),
    ];
    const [t, b] = withBudgets([transports, banque], rules, today);
    expect(t).toMatchObject({ id: transports.id, monthlyExtra: 90_00, monthlyCharges: 40_00, monthlyBudget: 130_00 });
    expect(b).toMatchObject({ id: banque.id, monthlyExtra: null, monthlyCharges: 56_93, monthlyBudget: 56_93 });
  });

  it('ignore les règles en pause, terminées avant le mois, et celles qui ne sont pas des dépenses', () => {
    const logement = envelope({ name: 'Logement', monthlyExtra: 5_00 });
    const rules = [
      rule({ kind: 'expense', amount: 100_00, envelopeId: logement.id, active: false }),
      rule({ kind: 'expense', amount: 100_00, envelopeId: logement.id, endDate: '2026-09-30' }),
      // Se termine ce mois-ci : elle compte encore.
      rule({ kind: 'expense', amount: 7_00, envelopeId: logement.id, endDate: '2026-10-01' }),
      rule({ kind: 'income', amount: 100_00, envelopeId: logement.id }),
      rule({ kind: 'transfer', amount: 100_00, envelopeId: logement.id }),
      rule({ kind: 'expense', amount: 100_00, envelopeId: null }),
    ];
    expect(withBudgets([logement], rules, today)[0]).toMatchObject({ monthlyCharges: 7_00, monthlyBudget: 12_00 });
  });

  it('sans charge ni complément, pas de budget', () => {
    expect(withBudgets([envelope({ name: 'Divers' })], [], today)[0]).toMatchObject({ monthlyExtra: null, monthlyCharges: 0, monthlyBudget: 0 });
  });
});

describe('envelopesToWatch', () => {
  beforeEach(resetIds);
  const today = '2026-03-10';

  it('signale une enveloppe dépassée, même sans complément', () => {
    const restos = envelope({ name: 'Restos' });
    expect(envelopesToWatch([restos], { [restos.id]: -12_40 }, [], [], today)).toEqual([{ envelopeId: restos.id, name: 'Restos', kind: 'over', amount: 12_40 }]);
  });

  it('presque vide : disponible libre sous 10 % du complément', () => {
    const abos = envelope({ name: 'Abonnements', monthlyExtra: 50_00 });
    const sorties = envelope({ name: 'Sorties', monthlyExtra: 50_00 });
    expect(envelopesToWatch([abos, sorties], { [abos.id]: 4_99, [sorties.id]: 5_00 }, [], [], today)).toEqual([
      { envelopeId: abos.id, name: 'Abonnements', kind: 'low', amount: 4_99 },
    ]);
  });

  it('retire du disponible les charges encore attendues ce mois-ci', () => {
    const transports = envelope({ name: 'Transports', monthlyExtra: 20_00 });
    const transactions = [
      // Prévue en retard : toujours attendue.
      tx({ kind: 'expense', status: 'planned', amount: 40_00, envelopeId: transports.id, date: '2026-03-05' }),
      // Déjà passée : déjà déduite du disponible.
      tx({ kind: 'expense', status: 'confirmed', amount: 999_00, envelopeId: transports.id, date: '2026-03-06' }),
      // Mois suivant : pas encore attendue.
      tx({ kind: 'expense', status: 'planned', amount: 500_00, envelopeId: transports.id, date: '2026-04-02' }),
    ];
    const rules = [
      rule({ kind: 'expense', amount: 50_00, envelopeId: transports.id, dayOfMonth: 20, lastGeneratedDate: today }),
      // Un revenu ou la charge d'une autre enveloppe ne comptent pas.
      rule({ kind: 'income', amount: 2000_00, dayOfMonth: 25 }),
      rule({ kind: 'expense', amount: 300_00, envelopeId: transports.id + 100, dayOfMonth: 25 }),
    ];
    // 91 - 40 - 50 = 1 € de libre, sous les 2 € (10 % de 20 €).
    expect(envelopesToWatch([transports], { [transports.id]: 91_00 }, rules, transactions, today)).toEqual([
      { envelopeId: transports.id, name: 'Transports', kind: 'low', amount: 1_00 },
    ]);
    // 2 € de libre : pile 10 %, pas encore presque vide.
    expect(envelopesToWatch([transports], { [transports.id]: 92_00 }, rules, transactions, today)).toEqual([]);
    // Libre négatif : ramené à 0.
    expect(envelopesToWatch([transports], { [transports.id]: 30_00 }, rules, transactions, today)).toEqual([
      { envelopeId: transports.id, name: 'Transports', kind: 'low', amount: 0 },
    ]);
  });

  it('ne compte ni deux fois une occurrence déjà créée, ni une règle en pause ou terminée', () => {
    const abos = envelope({ name: 'Abonnements', monthlyExtra: 20_00 });
    const netflix = rule({ kind: 'expense', amount: 50_00, envelopeId: abos.id, dayOfMonth: 20, lastGeneratedDate: '2026-03-20' });
    const rules = [
      netflix,
      rule({ kind: 'expense', amount: 100_00, envelopeId: abos.id, dayOfMonth: 25, active: false }),
      rule({ kind: 'expense', amount: 100_00, envelopeId: abos.id, dayOfMonth: 25, endDate: '2026-03-15' }),
    ];
    const transactions = [tx({ kind: 'expense', status: 'planned', amount: 50_00, envelopeId: abos.id, date: '2026-03-20', recurringRuleId: netflix.id })];
    // 53 - 50 = 3 € de libre, au-dessus des 2 €.
    expect(envelopesToWatch([abos], { [abos.id]: 53_00 }, rules, transactions, today)).toEqual([]);
  });

  it('sans complément, une enveloppe vide n’est jamais presque vide', () => {
    const logement = envelope({ name: 'Logement', monthlyExtra: null });
    const loyer = rule({ kind: 'expense', amount: 986_00, envelopeId: logement.id, dayOfMonth: 28, lastGeneratedDate: today });
    expect(envelopesToWatch([logement], { [logement.id]: 0 }, [loyer], [], today)).toEqual([]);
  });

  it('plus de « presque vide » à 7 jours ou moins de la fin du mois, les dépassées restent', () => {
    const restos = envelope({ name: 'Restos' });
    const abos = envelope({ name: 'Abonnements', monthlyExtra: 50_00 });
    const balances = { [restos.id]: -5_00, [abos.id]: 1_00 };
    expect(envelopesToWatch([restos, abos], balances, [], [], '2026-03-24')).toEqual([{ envelopeId: restos.id, name: 'Restos', kind: 'over', amount: 5_00 }]);
    expect(envelopesToWatch([restos, abos], balances, [], [], '2026-03-23')).toEqual([
      { envelopeId: restos.id, name: 'Restos', kind: 'over', amount: 5_00 },
      { envelopeId: abos.id, name: 'Abonnements', kind: 'low', amount: 1_00 },
    ]);
  });

  it('ignore l’épargne et les enveloppes archivées', () => {
    const bourse = envelope({ name: 'Bourse', isSavings: true, monthlyExtra: 100_00 });
    const ancienne = envelope({ name: 'Ancienne', archived: true, monthlyExtra: 100_00 });
    expect(envelopesToWatch([bourse, ancienne], { [bourse.id]: -10_00, [ancienne.id]: -10_00 }, [], [], today)).toEqual([]);
  });

  it('les dépassées d’abord, de la plus grosse, puis les presque vides, de la plus vide', () => {
    const a = envelope({ name: 'A' });
    const b = envelope({ name: 'B' });
    const c = envelope({ name: 'C', monthlyExtra: 50_00 });
    const d = envelope({ name: 'D', monthlyExtra: 50_00 });
    const watch = envelopesToWatch([a, b, c, d], { [a.id]: -5_00, [b.id]: -20_00, [c.id]: 3_00, [d.id]: 1_00 }, [], [], today);
    expect(watch.map((w) => [w.name, w.kind, w.amount])).toEqual([
      ['B', 'over', 20_00],
      ['A', 'over', 5_00],
      ['D', 'low', 1_00],
      ['C', 'low', 3_00],
    ]);
  });
});
