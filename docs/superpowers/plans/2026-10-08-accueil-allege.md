# Accueil allégé Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** L'Accueil ne répète plus le Budget : « Marge restante » et la section « Enveloppes » disparaissent, une ligne « À faire » signale les enveloppes à surveiller, et les charges fixes du Budget perdent leur bloc de totaux.

**Architecture:** Une fonction pure `envelopesToWatch` de `core/budget.ts` repère les enveloppes dépassées ou presque vides à partir des soldes, des règles récurrentes et des opérations prévues.
La vue d'ensemble (`server/src/services/overview.ts`) l'expose dans `Overview.watch`.
Côté client, une fonction pure `watchTodo` de `client/src/lib/budget.ts` transforme cette liste en ligne « À faire », que l'Accueil affiche à la place de la section des enveloppes.

**Tech Stack:** TypeScript, vitest, Hono + Drizzle + SQLite (server), React 19 + React Router + TanStack Query + CSS Modules (client), Testing Library.

## Prérequis

Ce plan s'exécute **après** celui de la spec `docs/superpowers/specs/2026-10-08-budget-par-charges-design.md`.
Il suppose donc l'état suivant, qui n'existe pas encore dans le code au moment où ce plan est écrit :

- `Envelope` (`shared/schemas.ts`) a `monthlyExtra: Cents | null` (complément) à la place de `monthlyTarget`.
- `State.envelopes` (`core/types.ts`) est un `BudgetedEnvelope[]`, avec `BudgetedEnvelope = Envelope & { monthlyCharges: Cents; monthlyBudget: Cents }`.
- `withBudgets(envelopes, rules, today)` existe dans `core/budget.ts`, et `loadState` (`server/src/services/state.ts`) l'utilise.
- `EnvelopeWithBalance` et la vue d'ensemble portent `monthlyExtra`, `monthlyCharges` et `monthlyBudget` ; `month.planned` et `month.budget` additionnent les `monthlyBudget`.
- La fixture `envelope()` de `core/test-fixtures.ts` produit `monthlyExtra: null` par défaut.
- `PATCH /api/envelopes/:id` accepte `monthlyExtra`.

Avant de commencer, vérifier ces points :

```bash
cd /home/basile/projects/runway-simplification
grep -n "monthlyExtra" shared/schemas.ts core/test-fixtures.ts
grep -n "withBudgets" core/budget.ts server/src/services/state.ts
grep -rn "monthlyTarget" core server/src/services/overview.ts client/src/pages/Home.tsx
```

Attendu : les deux premiers `grep` trouvent des lignes, le troisième ne trouve rien.
Si ce n'est pas le cas, s'arrêter : le plan « budget par charges » n'a pas été exécuté.

Les numéros de ligne cités ci-dessous sont ceux d'avant le plan « budget par charges » : se repérer d'abord aux extraits de code.
Si le plan d'unification visuelle (`docs/superpowers/plans/2026-10-08-unification-visuelle.md`) a été exécuté avant celui-ci, la structure de l'Accueil et des charges fixes a changé (`SectionHeader`, `TodoItem`) : appliquer les mêmes ajouts et suppressions sur les composants équivalents, les textes et les tests restent valables tels quels.

## Global Constraints

- Texte d'interface en français, accents corrects, apostrophe typographique `’` comme le code existant (`l’accueil`, `n’est`).
- Jamais de tiret cadratin, seulement le tiret simple « - ».
- Les montants passent par `formatEuros` (`@shared/money`), qui sépare avec des espaces simples : « 12,40 € ».
- Une enveloppe est **presque vide** si son disponible libre est inférieur à 10 % de son complément (`monthlyExtra`) alors qu'il reste plus de 7 jours dans le mois.
- Disponible libre = disponible - charges de l'enveloppe encore attendues d'ici la fin du mois (opérations prévues non confirmées du mois, et occurrences des règles entre demain et la fin du mois).
- Une enveloppe sans complément n'est jamais presque vide.
- Seules les enveloppes hors épargne et non archivées sont surveillées.
- `amount` est le dépassement pour `over`, le disponible libre pour `low`.
- Les dépassées passent en premier, puis les presque vides, chacune triée par montant.
- Libellés : « Restos dépassée de 12,40 € » (ton alerte), « Plus que 3,05 € dans Abonnements » (ton normal), « 3 enveloppes à surveiller · Restos, Sorties, Abonnements » (ton alerte si l'une est dépassée).
- Message des charges fixes vides : « Ajoute ton salaire, ton loyer et tes abonnements : leurs montants comptent dans le budget de leur enveloppe. »
- Supprimer le CSS devenu inutile.
- Commandes de vérification : `npm test`, `npm run typecheck`, `npm run lint` depuis la racine du worktree.
- Une erreur typecheck préexistante dans `client/src/components/invest/HoldingList.test.tsx` (`series`) n'est pas liée à ce plan : l'ignorer.

## Choix d'interprétation de la spec

- « Chacune triée par montant » : les dépassées de la plus grosse à la plus petite (le plus grave d'abord), les presque vides de la moins remplie à la plus remplie (la plus vide d'abord).
- Un disponible libre négatif (une charge attendue plus grosse que le disponible) est ramené à 0 dans `amount`, pour lire « Plus que 0,00 € dans Transports » plutôt qu'un montant négatif.
- Les occurrences de règles sont comptées à partir de `max(demain, lastGeneratedDate + 1)` : ce qui est déjà créé en base est une opération prévue, comptée une seule fois.
- La ligne n'entre pas dans `budgetNeedsAttention` (pastille de navigation) : la spec ne le demande pas.

## Structure des fichiers

| Fichier | Rôle dans ce plan |
|---|---|
| `shared/api-types.ts` | type `WatchedEnvelope`, champ `Overview.watch` |
| `core/budget.ts` | fonction pure `envelopesToWatch` |
| `core/budget.test.ts` | tests de `envelopesToWatch` |
| `server/src/services/overview.ts` | appelle `envelopesToWatch` et expose `watch` |
| `server/test/overview-watch.test.ts` | test de bout en bout de `GET /api/overview` (nouveau) |
| `client/src/lib/budget.ts` | fonction pure `watchTodo` (libellé, détail, ton) |
| `client/src/lib/budget.test.ts` | tests de `watchTodo` |
| `client/src/pages/Home.tsx`, `Home.module.css` | retrait de la marge et des enveloppes, ajout de la ligne « À faire » |
| `client/src/pages/Home.test.tsx` | test de l'Accueil (nouveau) |
| `client/src/components/budget/FixedCharges.tsx`, `FixedCharges.module.css` | retrait du bloc des totaux, nouveau message vide |
| `client/src/components/budget/FixedCharges.test.tsx` | test des charges fixes (nouveau) |

---

### Task 1: `envelopesToWatch` dans le moteur

**Files:**
- Modify: `shared/api-types.ts` (après `EnvelopeWithBalance`, vers la ligne 64)
- Modify: `core/budget.ts`
- Test: `core/budget.test.ts`

**Interfaces:**
- Consumes: `Envelope` avec `monthlyExtra: Cents | null` (plan « budget par charges ») ; `expandRule(rule, from, to): ISODate[]` de `core/recurrence.ts` (renvoie `[]` pour une règle en pause, s'arrête à `endDate`) ; `addDays`, `daysBetween`, `startOfMonth`, `endOfMonth` de `@shared/dates` ; fixtures `envelope`, `rule`, `tx`, `resetIds` de `core/test-fixtures.ts`.
- Produces :
  - `shared/api-types.ts` : `export type WatchedEnvelope = { envelopeId: number; name: string; kind: 'over' | 'low'; amount: Cents };`
  - `core/budget.ts` : `export function envelopesToWatch(envelopes: Pick<Envelope, 'id' | 'name' | 'archived' | 'isSavings' | 'monthlyExtra'>[], balances: Record<number, Cents>, rules: RecurringRule[], transactions: Transaction[], today: ISODate): WatchedEnvelope[]`

- [ ] **Step 1: Écrire les tests qui échouent**

Dans `core/budget.test.ts`, ajouter `envelopesToWatch` à l'import depuis `./budget` et `rule` à l'import depuis `./test-fixtures` (garder les noms déjà importés par le plan précédent, par exemple `withBudgets`) :

```ts
import { envelopesToWatch, monthActivity, planAutoFunding, remainingToFund, savedInMonth } from './budget';
import { account, envelope, resetIds, rule, tx } from './test-fixtures';
```

Puis ajouter à la fin du fichier :

```ts
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
```

- [ ] **Step 2: Vérifier que les tests échouent**

Run: `npx vitest run core/budget.test.ts`
Expected: FAIL, `envelopesToWatch` n'est pas exporté par `./budget` (`envelopesToWatch is not a function`).

- [ ] **Step 3: Ajouter le type partagé**

Dans `shared/api-types.ts`, juste après le type `EnvelopeWithBalance` :

```ts
/** Enveloppe à surveiller sur l'Accueil : dépassée (`amount` = dépassement) ou presque vide (`amount` = disponible libre). */
export type WatchedEnvelope = { envelopeId: number; name: string; kind: 'over' | 'low'; amount: Cents };
```

- [ ] **Step 4: Écrire `envelopesToWatch`**

En tête de `core/budget.ts`, fusionner ces imports avec ceux déjà présents (le plan précédent a peut-être déjà ajouté `RecurringRule`, `Cents` ou un import de `./recurrence`) :

```ts
import type { WatchedEnvelope } from '@shared/api-types';
import { addDays, daysBetween, endOfMonth, startOfMonth, type ISODate } from '@shared/dates';
import type { Cents } from '@shared/money';
import type { Account, Envelope, RecurringRule, Transaction } from '@shared/schemas';
import { expandRule } from './recurrence';
```

Puis ajouter à la fin du fichier :

```ts
/** En dessous de 7 jours restants, une enveloppe presque vide n'est plus une surprise : le mois s'achève. */
const LOW_MIN_DAYS_LEFT = 7;

/**
 * Enveloppes à surveiller, hors épargne et archivées : dépassées (disponible négatif),
 * puis presque vides (disponible libre sous 10 % du complément, à plus de 7 jours de la fin du mois).
 * Disponible libre = disponible - charges encore attendues ce mois-ci : prévues non confirmées du mois,
 * et occurrences des règles de dépense entre demain et la fin du mois qui ne sont pas encore en base.
 * Une enveloppe sans complément n'est jamais presque vide : Logement à 0 € une fois le loyer payé est normal.
 */
export function envelopesToWatch(
  envelopes: Pick<Envelope, 'id' | 'name' | 'archived' | 'isSavings' | 'monthlyExtra'>[],
  balances: Record<number, Cents>,
  rules: RecurringRule[],
  transactions: Transaction[],
  today: ISODate,
): WatchedEnvelope[] {
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  const tomorrow = addDays(today, 1);
  const expected = new Map<number, Cents>();
  const add = (id: number, amount: Cents) => expected.set(id, (expected.get(id) ?? 0) + amount);

  for (const t of transactions) {
    if (t.status !== 'planned' || t.kind !== 'expense' || t.envelopeId == null || t.date < monthStart || t.date > monthEnd) continue;
    add(t.envelopeId, t.amount);
  }
  for (const r of rules) {
    if (r.kind !== 'expense' || r.envelopeId == null) continue;
    // Tout ce qui est antérieur ou égal à lastGeneratedDate existe déjà en base, compté plus haut s'il est encore prévu.
    const next = r.lastGeneratedDate ? addDays(r.lastGeneratedDate, 1) : tomorrow;
    const from = next > tomorrow ? next : tomorrow;
    add(r.envelopeId, r.amount * expandRule(r, from, monthEnd).length);
  }

  const lowAllowed = daysBetween(today, monthEnd) > LOW_MIN_DAYS_LEFT;
  const over: WatchedEnvelope[] = [];
  const low: WatchedEnvelope[] = [];
  for (const e of envelopes) {
    if (e.archived || e.isSavings) continue;
    const balance = balances[e.id] ?? 0;
    if (balance < 0) {
      over.push({ envelopeId: e.id, name: e.name, kind: 'over', amount: -balance });
      continue;
    }
    if (!lowAllowed || !e.monthlyExtra || e.monthlyExtra <= 0) continue;
    const free = balance - (expected.get(e.id) ?? 0);
    // free < 10 % du complément, en entiers pour éviter les arrondis.
    if (free * 10 < e.monthlyExtra) low.push({ envelopeId: e.id, name: e.name, kind: 'low', amount: Math.max(0, free) });
  }
  over.sort((a, b) => b.amount - a.amount);
  low.sort((a, b) => a.amount - b.amount);
  return [...over, ...low];
}
```

- [ ] **Step 5: Vérifier que les tests passent**

Run: `npx vitest run core/budget.test.ts`
Expected: PASS, tous les tests de `budget`, `planAutoFunding` et `envelopesToWatch`.

- [ ] **Step 6: Commit**

```bash
git add shared/api-types.ts core/budget.ts core/budget.test.ts
git commit -m "feat(core): enveloppes à surveiller, dépassées ou presque vides"
```

---

### Task 2: la vue d'ensemble expose `watch`

**Files:**
- Modify: `shared/api-types.ts` (type `Overview`, vers la ligne 95)
- Modify: `server/src/services/overview.ts`
- Test: `server/test/overview-watch.test.ts` (nouveau)

**Interfaces:**
- Consumes: `envelopesToWatch(envelopes, balances, rules, transactions, today): WatchedEnvelope[]` et `WatchedEnvelope` (Task 1) ; `loadState(db)` qui renvoie `state.envelopes: BudgetedEnvelope[]` et `state.rules` (plan précédent) ; `computeBalances(state, today).envelopes: Record<number, Cents>`.
- Produces: `Overview.watch: WatchedEnvelope[]`, servi par `GET /api/overview`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `server/test/overview-watch.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { createTestApp } from './helpers';

describe('GET /api/overview : enveloppes à surveiller', () => {
  it('liste les dépassées puis les presque vides, hors épargne', async () => {
    // Le 10 mars : 21 jours restants.
    const t = createTestApp('2026-03-10');
    // Courses : 100 € répartis, 112,40 € dépensés, dépassée de 12,40 €.
    await t.call('POST', '/api/transactions', { kind: 'allocation', date: '2026-03-01', amount: 100_00, label: 'Budget', envelopeId: t.courses.id });
    await t.call('POST', '/api/transactions', { kind: 'expense', date: '2026-03-05', amount: 112_40, label: 'Carrefour', accountId: t.courant.id, envelopeId: t.courses.id });
    // Loisirs : 50 € de complément, 40 € dedans, mais un abonnement de 37 € tombe le 20 : 3 € de libre.
    await t.call('PATCH', `/api/envelopes/${t.loisirs.id}`, { monthlyExtra: 50_00 });
    await t.call('POST', '/api/transactions', { kind: 'allocation', date: '2026-03-01', amount: 40_00, label: 'Budget', envelopeId: t.loisirs.id });
    await t.call('POST', '/api/recurring-rules', {
      name: 'Abonnement', kind: 'expense', amount: 37_00, label: 'Abonnement', accountId: t.courant.id, envelopeId: t.loisirs.id,
      frequency: 'monthly', dayOfMonth: 20, startDate: '2026-03-15',
    });
    // Une enveloppe d'épargne dans le rouge n'est pas à surveiller.
    const bourse = await t.call('POST', '/api/envelopes', { name: 'Bourse', color: '#4f8a5b', isSavings: true });
    await t.call('POST', '/api/transactions', { kind: 'expense', date: '2026-03-06', amount: 20_00, label: 'PEA', accountId: t.courant.id, envelopeId: bourse.body.id });

    const { body } = await t.call('GET', '/api/overview');
    expect(body.watch).toEqual([
      { envelopeId: t.courses.id, name: 'Courses', kind: 'over', amount: 12_40 },
      { envelopeId: t.loisirs.id, name: 'Loisirs', kind: 'low', amount: 3_00 },
    ]);
    // La comparaison au revenu s'appuie sur les budgets calculés : 37 € de charges + 50 € de complément.
    expect(body.month.planned).toBe(87_00);

    // Le 25 : 6 jours restants, Loisirs n'est plus signalée, Courses reste dépassée.
    t.setToday('2026-03-25');
    expect((await t.call('GET', '/api/overview')).body.watch).toEqual([{ envelopeId: t.courses.id, name: 'Courses', kind: 'over', amount: 12_40 }]);
  });
});
```

- [ ] **Step 2: Vérifier que le test échoue**

Run: `npx vitest run server/test/overview-watch.test.ts`
Expected: FAIL, `body.watch` vaut `undefined`.

- [ ] **Step 3: Ajouter `watch` au type `Overview`**

Dans `shared/api-types.ts`, dans `Overview`, après `latestFunding` :

```ts
  /** Enveloppes dépassées ou presque vides, les plus urgentes d'abord. */
  watch: WatchedEnvelope[];
```

- [ ] **Step 4: Calculer `watch` dans la vue d'ensemble**

Dans `server/src/services/overview.ts`, ajouter `envelopesToWatch` à l'import de `@core/budget` (garder les autres noms déjà importés) :

```ts
import { envelopesToWatch, monthActivity, remainingToFund, savedInMonth } from '@core/budget';
```

Puis, dans l'objet renvoyé par `buildOverview`, après `latestFunding: latestFundingView(db),` :

```ts
    watch: envelopesToWatch(state.envelopes, balances.envelopes, state.rules, state.transactions, today),
```

- [ ] **Step 5: Vérifier que les tests passent**

Run: `npx vitest run server/test/overview-watch.test.ts server/test/insights.test.ts server/test/auto-funding.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add shared/api-types.ts server/src/services/overview.ts server/test/overview-watch.test.ts
git commit -m "feat(server): la vue d'ensemble liste les enveloppes à surveiller"
```

---

### Task 3: libellé de la ligne « À faire »

**Files:**
- Modify: `client/src/lib/budget.ts`
- Test: `client/src/lib/budget.test.ts`

**Interfaces:**
- Consumes: `WatchedEnvelope` (Task 1) ; `formatEuros` de `@shared/money`.
- Produces: `export type WatchTodo = { text: string; detail?: string; tone?: 'alert' }` et `export function watchTodo(watch: WatchedEnvelope[]): WatchTodo | null` dans `client/src/lib/budget.ts`.

- [ ] **Step 1: Écrire les tests qui échouent**

Dans `client/src/lib/budget.test.ts`, remplacer l'import de `./budget` par :

```ts
import type { WatchedEnvelope } from '@shared/api-types';
import { budgetNeedsAttention, budgetOverIncome, watchTodo } from './budget';
```

(garder `import { describe, expect, it } from 'vitest';` en première ligne), puis ajouter à la fin du fichier :

```ts
describe('watchTodo', () => {
  const watched = (kind: WatchedEnvelope['kind'], name: string, amount: number, envelopeId = 1): WatchedEnvelope => ({ envelopeId, name, kind, amount });

  it('rien quand aucune enveloppe n’est à surveiller', () => {
    expect(watchTodo([])).toBeNull();
  });

  it('une seule enveloppe dépassée : ton alerte', () => {
    expect(watchTodo([watched('over', 'Restos', 12_40)])).toEqual({ text: 'Restos dépassée de 12,40 €', tone: 'alert' });
  });

  it('une seule enveloppe presque vide : ton normal', () => {
    expect(watchTodo([watched('low', 'Abonnements', 3_05)])).toEqual({ text: 'Plus que 3,05 € dans Abonnements' });
  });

  it('plusieurs : le nombre et les noms, en alerte si l’une est dépassée', () => {
    expect(watchTodo([watched('over', 'Restos', 12_40, 1), watched('low', 'Sorties', 1_00, 2), watched('low', 'Abonnements', 3_05, 3)])).toEqual({
      text: '3 enveloppes à surveiller',
      detail: 'Restos, Sorties, Abonnements',
      tone: 'alert',
    });
    expect(watchTodo([watched('low', 'Sorties', 1_00, 2), watched('low', 'Abonnements', 3_05, 3)])).toEqual({ text: '2 enveloppes à surveiller', detail: 'Sorties, Abonnements' });
  });
});
```

- [ ] **Step 2: Vérifier que les tests échouent**

Run: `npx vitest run client/src/lib/budget.test.ts`
Expected: FAIL, `watchTodo is not a function`.

- [ ] **Step 3: Écrire `watchTodo`**

Dans `client/src/lib/budget.ts`, remplacer la première ligne par :

```ts
import type { Overview, WatchedEnvelope } from '@shared/api-types';
import { formatEuros } from '@shared/money';
```

Puis ajouter à la fin du fichier :

```ts
export type WatchTodo = { text: string; detail?: string; tone?: 'alert' };

/** Ligne « À faire » des enveloppes à surveiller, ou null s'il n'y en a aucune. */
export function watchTodo(watch: WatchedEnvelope[]): WatchTodo | null {
  const first = watch[0];
  if (!first) return null;
  if (watch.length > 1) {
    const todo: WatchTodo = { text: `${watch.length} enveloppes à surveiller`, detail: watch.map((w) => w.name).join(', ') };
    return watch.some((w) => w.kind === 'over') ? { ...todo, tone: 'alert' } : todo;
  }
  return first.kind === 'over' ? { text: `${first.name} dépassée de ${formatEuros(first.amount)}`, tone: 'alert' } : { text: `Plus que ${formatEuros(first.amount)} dans ${first.name}` };
}
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `npx vitest run client/src/lib/budget.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/budget.ts client/src/lib/budget.test.ts
git commit -m "feat(client): libellé de la ligne des enveloppes à surveiller"
```

---

### Task 4: l'Accueil allégé

**Files:**
- Modify: `client/src/pages/Home.tsx` (imports l. 1-19, `HomePage` l. 68-71, `MonthHero` l. 76-142, `TodoList` l. 174-192, `EnvelopesPreview` l. 257-292, `HomeSkeleton` l. 331-334)
- Modify: `client/src/pages/Home.module.css` (rien à supprimer, voir Step 5)
- Test: `client/src/pages/Home.test.tsx` (nouveau)

**Interfaces:**
- Consumes: `Overview.watch` (Task 2) ; `watchTodo(watch): WatchTodo | null` (Task 3).
- Produces: rien pour les tâches suivantes.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `client/src/pages/Home.test.tsx` :

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Overview } from '@shared/api-types';
import { ToastProvider } from '@/components/ui';
import { HomePage } from './Home';

const base: Overview = {
  today: '2026-10-08',
  toAllocate: 0,
  netWorth: 1500_00,
  accounts: [{ id: 1, name: 'Courant', initialBalance: 0, onBudget: true, bankAccountNumber: null, archived: false, createdAt: '2026-01-01T00:00:00.000Z', balance: 1500_00, lastImport: null }],
  envelopes: [],
  // Budget dépassé : l'ancien Accueil affichait « Budget dépassé de ».
  month: { start: '2026-10-01', end: '2026-10-31', spent: 1200_00, budget: 1000_00, variable: { spent: 300_00, budget: 400_00 }, saved: 200_00, toFund: 0, income: 0, planned: 0 },
  alerts: [],
  unsortedCount: 0,
  latePlanned: [],
  latestFunding: null,
  watch: [],
};

let overview: Overview = base;
const fetchMock = vi.fn(async (path: string) =>
  path === '/api/overview' ? new Response(JSON.stringify(overview), { status: 200 }) : new Response(JSON.stringify({ error: 'Introuvable' }), { status: 404 }),
);
beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});

function renderHome(over: Partial<Overview> = {}) {
  overview = { ...base, ...over };
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('Accueil', () => {
  it('signale les enveloppes à surveiller dans « À faire », vers le Budget', async () => {
    renderHome({ watch: [{ envelopeId: 3, name: 'Restos', kind: 'over', amount: 12_40 }] });
    const line = await screen.findByRole('link', { name: 'Restos dépassée de 12,40 €' });
    expect(line).toHaveAttribute('href', '/budget');
  });

  it('montre plusieurs enveloppes en une seule ligne', async () => {
    renderHome({
      watch: [
        { envelopeId: 3, name: 'Restos', kind: 'over', amount: 12_40 },
        { envelopeId: 4, name: 'Sorties', kind: 'low', amount: 1_00 },
      ],
    });
    expect(await screen.findByRole('link', { name: '2 enveloppes à surveiller · Restos, Sorties' })).toHaveAttribute('href', '/budget');
  });

  it('ne répète plus le budget : ni marge restante, ni section des enveloppes', async () => {
    renderHome();
    expect(await screen.findByText('Mis de côté')).toBeInTheDocument();
    expect(screen.getByText(/Rien à faire/)).toBeInTheDocument();
    expect(screen.queryByText('Marge restante')).not.toBeInTheDocument();
    expect(screen.queryByText('Budget dépassé de')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Enveloppes' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Voir les|Voir le budget/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Vérifier que le test échoue**

Run: `npx vitest run client/src/pages/Home.test.tsx`
Expected: FAIL : les deux premiers tests ne trouvent pas le lien, le troisième trouve « Budget dépassé de » et le titre « Enveloppes ».

- [ ] **Step 3: Ajouter la ligne « À faire »**

Dans `client/src/pages/Home.tsx`, dans `TodoList`, juste après le bloc `if (overIncome > 0) { ... }` et avant `const alert = data.alerts[0];` :

```tsx
  const watch = watchTodo(data.watch);
  if (watch) {
    todos.push({
      key: 'watch',
      to: '/budget',
      icon: <WalletCards />,
      tone: watch.tone,
      text: (
        <>
          {watch.text}
          {watch.detail ? <span className={styles.todoDetail}> · {watch.detail}</span> : null}
        </>
      ),
    });
  }
```

- [ ] **Step 4: Retirer la marge restante et la section des enveloppes**

Toujours dans `client/src/pages/Home.tsx` :

1. Supprimer la constante `const HOME_ENVELOPES = 6;` et la ligne vide qui la suit.
2. Dans `HomePage`, supprimer la ligne `<EnvelopesPreview data={data} />`.
3. Supprimer entièrement la fonction `EnvelopesPreview` (de `function EnvelopesPreview` jusqu'à son `}` final inclus, et la ligne vide qui la suit).
4. Dans `MonthHero`, supprimer la ligne `const margin = budget - spent;` et remplacer le bloc `<dl className={styles.stats}>...</dl>` par :

```tsx
      <dl className={styles.stats}>
        <div className={styles.stat}>
          <dt>Mis de côté</dt>
          <dd>
            <Amount cents={saved} size="lg" tone="neutral" className={saved > 0 ? styles.positive : saved < 0 ? styles.negative : ''} animate />
          </dd>
        </div>
      </dl>
```

5. Dans `HomeSkeleton`, remplacer les deux squelettes de `styles.stats` par un seul :

```tsx
        <div className={styles.stats}>
          <Skeleton width={140} height={48} />
        </div>
```

6. Mettre à jour les imports en tête de fichier (plus de `useState`, `EnvelopeWithBalance`, `EnvelopeDetailDialog`, `EnvelopeRow`, `EnvelopeRowHeader` ; ajout de `watchTodo`) :

```tsx
import { AlertTriangle, ArrowRight, Check, ChevronRight, Clock, Inbox, Landmark, RefreshCw, WalletCards } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { Overview } from '@shared/api-types';
import { daysBetween, formatDateShort } from '@shared/dates';
import { formatEuros } from '@shared/money';
import { errorMessage } from '@/api/client';
import { useIsMutating } from '@tanstack/react-query';
import { keys, useBankSync, useOverview } from '@/api/hooks';
import { FundingBanner } from '@/components/budget/FundingBanner';
import { Amount, Button, ButtonLink, EmptyState, ProgressBar, Skeleton } from '@/components/ui';
import { bankSyncTodo } from '@/lib/bank';
import { budgetOverIncome, monthProgress, watchTodo } from '@/lib/budget';
import { plural } from '@/lib/format';
import styles from './Home.module.css';
```

`EmptyState` et `ButtonLink` restent utilisés par l'écran de bienvenue et l'erreur de chargement ; `formatEuros` reste utilisé par le héros et « À faire ».

- [ ] **Step 5: Vérifier le CSS**

`Home.module.css` n'a aucune classe propre à la marge ni à la section des enveloppes : `.stats`, `.stat`, `.positive` et `.negative` servent encore à « Mis de côté », `.todoDetail` sert à la nouvelle ligne.
Le confirmer :

```bash
cd /home/basile/projects/runway-simplification
for c in $(grep -oE '^\.[a-zA-Z]+' client/src/pages/Home.module.css | sort -u | tr -d '.'); do grep -q "styles\.$c\b" client/src/pages/Home.tsx || echo "inutilisée : $c"; done
```

Expected: aucune ligne affichée.
Si une classe apparaît, la supprimer de `Home.module.css` (y compris dans le bloc `@media`).

- [ ] **Step 6: Vérifier que les tests passent**

Run: `npx vitest run client/src/pages/Home.test.tsx client/src/lib/budget.test.ts`
Expected: PASS.

Run: `npm run lint`
Expected: aucune erreur (en particulier aucun import inutilisé dans `Home.tsx`).

- [ ] **Step 7: Vérification visuelle**

Lancer `npm run dev` et ouvrir http://localhost:5173 en 1440 px puis 390 px de large.
Vérifier : « Mis de côté » seul et centré verticalement dans la colonne de droite du héros (en mobile, seul sous le filet), plus de section « Enveloppes » entre « À faire » et « Comptes », la ligne des enveloppes à surveiller avec le filet rouge quand une enveloppe est dépassée, et le détail « · noms » en gris sur la même ligne.

- [ ] **Step 8: Commit**

```bash
git add client/src/pages/Home.tsx client/src/pages/Home.module.css client/src/pages/Home.test.tsx
git commit -m "feat(client): l'Accueil signale les enveloppes à surveiller au lieu de répéter le budget"
```

---

### Task 5: charges fixes sans bloc de totaux

**Files:**
- Modify: `client/src/components/budget/FixedCharges.tsx` (commentaire l. 22, calculs l. 45-48, bloc `<dl>` l. 112-139, message vide l. 142)
- Modify: `client/src/components/budget/FixedCharges.module.css` (`.totals*` l. 17-37, `.rest` l. 39-43, `.negative` l. 45-47, et dans `@media (max-width: 767px)` les blocs `.totals` et `.rest` l. 132-138)
- Test: `client/src/components/budget/FixedCharges.test.tsx` (nouveau)

**Interfaces:**
- Consumes: `RecurringRuleView` de `@/api/hooks` ; routes `GET /api/recurring-rules`, `GET /api/accounts?archived=true`, `GET /api/envelopes?archived=true`.
- Produces: rien.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `client/src/components/budget/FixedCharges.test.tsx` :

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account } from '@shared/schemas';
import type { RecurringRuleView } from '@/api/hooks';
import { ToastProvider } from '@/components/ui';
import { FixedCharges } from './FixedCharges';

const salaire: RecurringRuleView = {
  id: 1,
  name: 'Salaire',
  label: 'VIR SALAIRE',
  kind: 'income',
  amount: 2450_00,
  accountId: 1,
  toAccountId: null,
  envelopeId: null,
  fromEnvelopeId: null,
  frequency: 'monthly',
  interval: 1,
  dayOfMonth: 28,
  startDate: '2026-01-01',
  endDate: null,
  lastGeneratedDate: null,
  active: true,
  triggersFunding: false,
  fundsNextMonth: false,
  nextDate: '2026-10-28',
  monthlyEquivalent: 2450_00,
};
const loyer: RecurringRuleView = { ...salaire, id: 2, name: 'Loyer', label: 'PRLV LOYER', kind: 'expense', amount: 986_00, dayOfMonth: 5, nextDate: '2026-11-05', monthlyEquivalent: 986_00 };
const courant: Account = { id: 1, name: 'Courant', initialBalance: 0, onBudget: true, bankAccountNumber: null, archived: false, createdAt: '2026-01-01T00:00:00.000Z' };

let rules: RecurringRuleView[] = [];
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const fetchMock = vi.fn(async (path: string) =>
  path === '/api/recurring-rules' ? json(rules) : path === '/api/accounts?archived=true' ? json([courant]) : path === '/api/envelopes?archived=true' ? json([]) : new Response(null, { status: 404 }),
);
beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});

function renderCharges(list: RecurringRuleView[]) {
  rules = list;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter>
          <FixedCharges />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('FixedCharges', () => {
  it('liste revenus et charges sans bloc de totaux', async () => {
    renderCharges([salaire, loyer]);
    expect(await screen.findByText('Salaire')).toBeInTheDocument();
    expect(screen.getByText('Loyer')).toBeInTheDocument();
    expect(screen.queryByText('Revenus par mois')).not.toBeInTheDocument();
    expect(screen.queryByText('Charges par mois')).not.toBeInTheDocument();
    expect(screen.queryByText('Virements programmés')).not.toBeInTheDocument();
    expect(screen.queryByText('Reste pour vivre et investir')).not.toBeInTheDocument();
  });

  it('explique que les charges comptent dans le budget quand la liste est vide', async () => {
    renderCharges([]);
    expect(await screen.findByText('Ajoute ton salaire, ton loyer et tes abonnements : leurs montants comptent dans le budget de leur enveloppe.')).toBeInTheDocument();
    expect(screen.getByText(/Ce qui revient tout seul/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Vérifier que le test échoue**

Run: `npx vitest run client/src/components/budget/FixedCharges.test.tsx`
Expected: FAIL : « Revenus par mois » est présent, et l'ancien message vide ne correspond pas.

- [ ] **Step 3: Retirer le bloc et changer le message**

Dans `client/src/components/budget/FixedCharges.tsx` :

1. Remplacer le commentaire de la fonction par :

```tsx
/** Ce qui revient chaque mois : salaire, loyer, abonnements, virements programmés. */
```

2. Supprimer ces quatre lignes :

```tsx
  const monthly = (kind: RecurringRuleView['kind']) => list.filter((r) => r.active && r.kind === kind).reduce((s, r) => s + r.monthlyEquivalent, 0);
  const income = monthly('income');
  const expense = monthly('expense');
  const transfer = monthly('transfer');
```

3. Remplacer toute la branche finale du ternaire `rules.isPending ? ... : rules.isError ? ... : (<>...</>)`, c'est-à-dire le fragment qui contient `<dl className={styles.totals}>` et la liste, par :

```tsx
      ) : list.length === 0 ? (
        <p className={styles.intro}>Ajoute ton salaire, ton loyer et tes abonnements : leurs montants comptent dans le budget de leur enveloppe.</p>
      ) : (
        <div className={styles.groups}>
          {incomes.length > 0 ? (
            <div>
              <h3 className={styles.groupTitle}>Revenus</h3>
              <ul className="ledger">{incomes.map(row)}</ul>
            </div>
          ) : null}
          {outgoings.length > 0 ? (
            <div>
              <h3 className={styles.groupTitle}>Charges et virements</h3>
              <ul className="ledger">{outgoings.map(row)}</ul>
            </div>
          ) : null}
        </div>
      )}
```

Le ternaire complet devient ainsi :

```tsx
      {rules.isPending ? (
        <Skeleton height={160} />
      ) : rules.isError ? (
        <p className={styles.error} role="alert">
          {errorMessage(rules.error)}
        </p>
      ) : list.length === 0 ? (
        <p className={styles.intro}>Ajoute ton salaire, ton loyer et tes abonnements : leurs montants comptent dans le budget de leur enveloppe.</p>
      ) : (
        <div className={styles.groups}>
          {incomes.length > 0 ? (
            <div>
              <h3 className={styles.groupTitle}>Revenus</h3>
              <ul className="ledger">{incomes.map(row)}</ul>
            </div>
          ) : null}
          {outgoings.length > 0 ? (
            <div>
              <h3 className={styles.groupTitle}>Charges et virements</h3>
              <ul className="ledger">{outgoings.map(row)}</ul>
            </div>
          ) : null}
        </div>
      )}
```

`Amount` reste importé : il sert au montant de chaque ligne.

- [ ] **Step 4: Supprimer le CSS devenu inutile**

Dans `client/src/components/budget/FixedCharges.module.css`, supprimer :

```css
.totals {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-10);
  margin: 0 0 var(--s-8);
}

.totals > div {
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
}

.totals dt {
  font-size: var(--text-sm);
  color: var(--ink-mute);
}

.totals dd {
  margin: 0;
}

/* Le chiffre qui compte : séparé par un filet, marqué en jaune */
.rest {
  padding-left: var(--s-10);
  border-left: 2px solid var(--marking);
}

.negative {
  color: var(--negative);
}

```

et, dans `@media (max-width: 767px)` :

```css
  .totals {
    gap: var(--s-6);
  }

  .rest {
    padding-left: var(--s-4);
  }

```

Puis vérifier qu'aucune classe ne reste orpheline :

```bash
cd /home/basile/projects/runway-simplification
for c in $(grep -oE '^\s*\.[a-zA-Z]+' client/src/components/budget/FixedCharges.module.css | tr -d ' .' | sort -u); do grep -q "styles\.$c\b" client/src/components/budget/FixedCharges.tsx || echo "inutilisée : $c"; done
```

Expected: aucune ligne affichée (`.paused`, `.main`, `.next`, `.amount`, `.actions` sont toutes référencées par `styles.` dans le composant).

- [ ] **Step 5: Vérifier que les tests passent**

Run: `npx vitest run client/src/components/budget/FixedCharges.test.tsx`
Expected: PASS.

Run: `npm run lint`
Expected: aucune erreur (plus de variable `income`, `expense`, `transfer` ni de `monthly`).

- [ ] **Step 6: Vérification visuelle**

Avec `npm run dev`, ouvrir http://localhost:5173/budget en 1440 px puis 390 px.
Vérifier : sous « Charges fixes et revenus », l'introduction est directement suivie de « Revenus » puis « Charges et virements », sans trou laissé par l'ancien bloc ; la phrase « Tes enveloppes prévoient X par mois pour Y de revenu, il reste Z » en haut de page est la seule comparaison au revenu et son X correspond à la somme des budgets affichés dans les lignes d'enveloppes.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/budget/FixedCharges.tsx client/src/components/budget/FixedCharges.module.css client/src/components/budget/FixedCharges.test.tsx
git commit -m "feat(client): les charges fixes n'affichent plus leurs totaux, le budget compare seul au revenu"
```

---

### Task 6: vérification complète

**Files:** aucun changement attendu.

**Interfaces:**
- Consumes: tout ce qui précède.
- Produces: rien.

- [ ] **Step 1: Tous les tests**

Run: `npm test`
Expected: tous les tests passent, y compris `core/budget.test.ts`, `server/test/overview-watch.test.ts`, `client/src/lib/budget.test.ts`, `client/src/pages/Home.test.tsx` et `client/src/components/budget/FixedCharges.test.tsx`.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: aucune erreur, sauf celle préexistante de `client/src/components/invest/HoldingList.test.tsx` (`series`), sans lien avec ce plan.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: aucune erreur ni avertissement.

- [ ] **Step 4: Plus aucune trace des éléments retirés**

```bash
cd /home/basile/projects/runway-simplification
grep -rn --exclude='*.test.tsx' "Marge restante\|Budget dépassé de\|Reste pour vivre\|HOME_ENVELOPES\|EnvelopesPreview\|styles.totals\|styles.rest\b" client/src
```

Expected: aucune ligne.
Les fichiers de test ne sont pas fouillés : ils cherchent justement ces textes pour vérifier leur absence.
Si une étape de cette tâche demande une correction, la commiter avec un message `fix(client): ...` ou `fix(core): ...` qui décrit ce qui a été corrigé.
