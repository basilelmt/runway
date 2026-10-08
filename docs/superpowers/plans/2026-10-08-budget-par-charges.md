# Budget par charges - plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** le budget mensuel d'une enveloppe se calcule à partir de ses charges fixes ramenées au mois, plus un complément saisi à la main, au lieu d'être saisi en double.

**Architecture:** la colonne `envelopes.monthly_target` devient `monthly_extra` (migration 0009 qui convertit les budgets existants en compléments).
Une fonction pure `withBudgets` de `core/budget.ts` enrichit chaque enveloppe de `monthlyCharges` et `monthlyBudget` ; `loadState` l'applique, et tout le moteur, l'API et le client lisent `monthlyBudget`.
Demander garde `monthlyTarget` (budget voulu) côté Claude et le serveur le convertit en complément.

**Tech Stack:** TypeScript, Hono, Drizzle (better-sqlite3, drizzle-kit 0.31), zod 4, React 19, TanStack Query, Vitest, Testing Library.

Spec : `docs/superpowers/specs/2026-10-08-budget-par-charges-design.md`.

## Global Constraints

- Noms imposés (le chantier A, `2026-10-08-accueil-allege-design.md`, les réutilise) : `monthlyExtra` (complément, `Cents | null`), `monthlyCharges` (`Cents`), `monthlyBudget` (`Cents`, 0 = pas de budget), type `BudgetedEnvelope`, fonction `withBudgets(envelopes, rules, today)`.
- Migration nommée `0009_envelope_monthly_extra` même si une autre branche crée aussi une 0009 (le conflit se résoudra à la fusion).
- Une charge d'enveloppe = règle récurrente `kind = 'expense'`, `active`, `envelopeId` non nul, `endDate` nulle ou `>=` premier jour du mois courant.
- Ramené au mois = `monthlyEquivalent` de `core/recurrence.ts`, sans autre formule côté TypeScript.
- Complément converti à `null` s'il vaut moins de 100 centimes (migration) ou 0 et moins (Demander).
- Textes d'interface en français, accents corrects, apostrophe typographique `’` et guillemets « » comme le reste de l'interface.
- Jamais de tiret cadratin, ni dans le code, ni dans les textes, ni dans les commits : seulement `-`.
- Dans les fichiers Markdown, une phrase complète par ligne.
- Ne jamais écrire dans `/tmp` ; fichiers temporaires dans `tmp/` du projet.
- Toutes les commandes se lancent depuis la racine du worktree `~/projects/runway-simplification`.
- Commits sans co-auteur.
- Le renommage traverse toutes les couches : chaque tâche fait passer ses tests ciblés, mais `npm run typecheck` et `npm test` complets ne sont attendus au vert qu'à la tâche 7.
- Erreur de typecheck préexistante et sans rapport, à ignorer : `client/src/components/invest/HoldingList.test.tsx` (`series`).

## Fichiers

| Fichier | Rôle |
|---|---|
| `server/src/db/schema.ts` | colonne `monthlyExtra` (`monthly_extra`) |
| `server/src/db/migrations/0009_envelope_monthly_extra.sql` + `meta/` | renommage et conversion des budgets en compléments |
| `server/test/migrations.test.ts` | test de la migration 0009 |
| `shared/schemas.ts` | `envelopeSchema`, `envelopeInputSchema`, `envelopePatchSchema` : `monthlyExtra` |
| `shared/api-types.ts` | `BudgetedEnvelope`, `EnvelopeWithBalance`, `MonthSummary`, `SpendingReport`, `AskActionView` |
| `server/src/repos/envelopes.ts` | lecture et écriture de `monthlyExtra` |
| `core/budget.ts` | `isEnvelopeCharge`, `withBudgets`, `remainingToFund` et `planAutoFunding` sur `monthlyBudget` |
| `core/types.ts` | `State.envelopes: BudgetedEnvelope[]` |
| `core/forecast.ts` | événements de budget sur `monthlyBudget` |
| `core/test-fixtures.ts` | fixture `envelope()` enrichie |
| `server/src/services/state.ts` | `loadState(db, today)`, `listBudgetedEnvelopes` |
| `server/src/services/overview.ts` | budgets calculés, nouvelle règle des dépenses courantes |
| `server/src/services/reports.ts`, `forecast.ts`, `auto-funding.ts`, `export.ts`, `server/src/routes/insights.ts` | passage de `today`, `monthlyBudget` |
| `server/src/ask/actions.ts`, `prompt.ts`, `ask.ts` | conversion du budget voulu en complément, prompt |
| `client/src/components/ask/ActionCard.tsx` | carte de l'action budget |
| `client/src/components/budget/EnvelopeRow.tsx`, `FundDialog.tsx`, `EnvelopeDetailDialog.tsx`, `client/src/pages/Analyse.tsx`, `client/src/pages/Home.tsx` | lecture de `monthlyBudget` |
| `client/src/components/recurring/frequency.ts` | `describeRhythm` |
| `client/src/components/envelopes/EnvelopeFormDialog.tsx` (+ `.module.css`, `.test.tsx`) | champ « En plus des charges » et détail des charges |


## Amendements après relecture (prioritaires sur le reste du plan)

- Libellé du champ du formulaire d'enveloppe : « En plus des charges » seulement quand l'enveloppe porte au moins une charge ; sinon « Budget mensuel » avec l'aide actuelle « Ce que tu prévois d'y mettre chaque mois ». Une nouvelle enveloppe affiche donc « Budget mensuel ». Ajouter un test pour chaque cas.
- Prévision : ne pas figer le budget du mois courant sur les mois futurs. Pour chaque mois futur, recalculer les budgets avec `withBudgets(envelopes, rules, month)` (premier jour du mois), pour qu'une charge terminée ne compte plus. `forecast` reçoit déjà les règles ; ajouter un test avec une charge qui se termine le mois prochain.

---

### Task 1: Modèle de données - colonne `monthly_extra` et migration 0009

**Files:**
- Modify: `server/src/db/schema.ts:22`
- Create: `server/src/db/migrations/0009_envelope_monthly_extra.sql` (généré par drizzle-kit puis rempli à la main)
- Create: `server/src/db/migrations/meta/0009_snapshot.json` (généré puis corrigé)
- Modify: `server/src/db/migrations/meta/_journal.json` (entrée ajoutée par drizzle-kit)
- Modify: `shared/schemas.ts:51-87`
- Modify: `server/src/repos/envelopes.ts:25,38`
- Test: `server/test/migrations.test.ts`, `server/test/repos.test.ts:53-56`, `server/test/routes.test.ts:41-42`

**Interfaces:**
- Consumes: rien.
- Produces:
  - `Envelope` (`shared/schemas.ts`) : `{ id: number; name: string; color: string; monthlyExtra: Cents | null; sortOrder: number; archived: boolean; isSavings: boolean }` (plus de `monthlyTarget`).
  - `EnvelopeInput` / `EnvelopePatch` : champ `monthlyExtra?: number | null` (entier positif).
  - Table `envelopes` : colonne `monthly_extra integer` nullable.

- [ ] **Step 1: Écrire le test de migration qui échoue**

Ajouter en haut de `server/test/migrations.test.ts`, après les imports existants :

```ts
import { monthlyEquivalent } from '@core/recurrence';
```

Puis ajouter à la fin du fichier :

```ts
type RuleSeed = { name: string; kind: 'expense' | 'income' | 'transfer'; amount: number; envelope: string; frequency?: 'daily' | 'weekly' | 'monthly' | 'yearly'; interval?: number; endDate?: string | null; active?: 0 | 1 };

/** Base au niveau 0008 avec des budgets et des charges, puis la migration 0009. */
function migrateBudgets(envelopes: [string, number | null][], rules: RuleSeed[]) {
  const db = new Database(':memory:');
  for (const tag of journalTags(8)) applyMigration(db, tag);
  const ids = new Map<string, number>();
  const insertEnvelope = db.prepare('INSERT INTO envelopes (name, monthly_target) VALUES (?, ?)');
  for (const [name, target] of envelopes) ids.set(name, Number(insertEnvelope.run(name, target).lastInsertRowid));
  const insertRule = db.prepare(
    `INSERT INTO recurring_rules (name, kind, amount, label, envelope_id, frequency, \`interval\`, day_of_month, start_date, end_date, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, '2026-01-01', ?, ?)`,
  );
  for (const r of rules) {
    insertRule.run(r.name, r.kind, r.amount, r.name, ids.get(r.envelope)!, r.frequency ?? 'monthly', r.interval ?? 1, r.endDate ?? null, r.active ?? 1);
  }

  // La migration à tester.
  applyMigration(db, '0009_envelope_monthly_extra');

  const columns = (db.prepare("PRAGMA table_info('envelopes')").all() as { name: string }[]).map((c) => c.name);
  const rows = db.prepare('SELECT name, monthly_extra AS extra FROM envelopes ORDER BY id').all() as { name: string; extra: number | null }[];
  db.close();
  return { columns, rows };
}

describe('migration 0009 (complément des enveloppes)', () => {
  it('renomme monthly_target et ne garde que ce qui dépasse les charges fixes', () => {
    const { columns, rows } = migrateBudgets(
      [
        ['Logement', 986_00],
        ['Prêt étudiant', 485_00],
        ['Transports', 130_00],
        ['Santé et assurances', 20_00],
        ['Courses', 300_00],
        ['Divers', null],
      ],
      [
        { name: 'Loyer', kind: 'expense', amount: 986_00, envelope: 'Logement' },
        { name: 'Prêt', kind: 'expense', amount: 484_72, envelope: 'Prêt étudiant' },
        { name: 'Navigo', kind: 'expense', amount: 40_00, envelope: 'Transports' },
        { name: 'Mutuelle', kind: 'expense', amount: 14_35, envelope: 'Santé et assurances' },
        // Trimestrielle : 3,60 € par mois, soit 17,95 € de charges avec la mutuelle.
        { name: 'Cotisation compte LBP', kind: 'expense', amount: 10_80, envelope: 'Santé et assurances', interval: 3 },
        // Ignorées : terminée avant ce mois, en pause, revenu.
        { name: 'Ancienne assurance', kind: 'expense', amount: 50_00, envelope: 'Courses', endDate: '2020-01-31' },
        { name: 'Drive', kind: 'expense', amount: 100_00, envelope: 'Courses', active: 0 },
        { name: 'Remboursement', kind: 'income', amount: 20_00, envelope: 'Courses' },
      ],
    );
    expect(columns).toContain('monthly_extra');
    expect(columns).not.toContain('monthly_target');
    expect(rows).toEqual([
      { name: 'Logement', extra: null },
      // 0,28 € d'écart : sous 1 €, le complément est écarté.
      { name: 'Prêt étudiant', extra: null },
      { name: 'Transports', extra: 90_00 },
      { name: 'Santé et assurances', extra: 2_05 },
      { name: 'Courses', extra: 300_00 },
      { name: 'Divers', extra: null },
    ]);
  });

  it('ramène les charges au mois comme monthlyEquivalent, au centime près', () => {
    const { rows } = migrateBudgets(
      [
        ['Sport', 100_00],
        ['Habitation', 20_00],
        ['Café', 50_00],
        ['Assurance', 10_00],
      ],
      [
        { name: 'Salle', kind: 'expense', amount: 10_00, envelope: 'Sport', frequency: 'weekly' },
        { name: 'Assurance habitation', kind: 'expense', amount: 120_00, envelope: 'Habitation', frequency: 'yearly' },
        { name: 'Expresso', kind: 'expense', amount: 1_00, envelope: 'Café', frequency: 'daily', interval: 2 },
        { name: 'Assurance auto', kind: 'expense', amount: 30_00, envelope: 'Assurance' },
      ],
    );
    expect(rows).toEqual([
      { name: 'Sport', extra: 100_00 - monthlyEquivalent({ frequency: 'weekly', interval: 1, amount: 10_00 }) },
      { name: 'Habitation', extra: 20_00 - monthlyEquivalent({ frequency: 'yearly', interval: 1, amount: 120_00 }) },
      { name: 'Café', extra: 50_00 - monthlyEquivalent({ frequency: 'daily', interval: 2, amount: 1_00 }) },
      // Budget inférieur aux charges : pas de complément.
      { name: 'Assurance', extra: null },
    ]);
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run server/test/migrations.test.ts`
Expected: FAIL avec `ENOENT: no such file or directory, open '.../0009_envelope_monthly_extra.sql'` sur les deux nouveaux tests ; le test 0007/0008 reste vert.

- [ ] **Step 3: Renommer la colonne dans le schéma Drizzle**

Dans `server/src/db/schema.ts`, remplacer la ligne `monthlyTarget: integer('monthly_target'),` de la table `envelopes` par :

```ts
  /** Complément mensuel saisi à la main, en plus des charges fixes de l'enveloppe ; null = pas de complément. */
  monthlyExtra: integer('monthly_extra'),
```

- [ ] **Step 4: Générer une migration personnalisée vide**

drizzle-kit pose une question interactive (« renommée ou créée ? ») pour un renommage de colonne, impossible sans terminal.
On génère donc une migration personnalisée, qu'on remplit à la main.

Run: `npx drizzle-kit generate --custom --name envelope_monthly_extra`
Expected: création de `server/src/db/migrations/0009_envelope_monthly_extra.sql`, de `server/src/db/migrations/meta/0009_snapshot.json` et d'une entrée `idx: 9`, `tag: "0009_envelope_monthly_extra"` dans `meta/_journal.json`.

- [ ] **Step 5: Écrire le SQL de la migration**

Remplacer tout le contenu de `server/src/db/migrations/0009_envelope_monthly_extra.sql` par :

```sql
-- Le budget d'une enveloppe devient : ses charges fixes ramenées au mois + un complément saisi à la main.
-- L'ancien budget devient le complément, moins les charges qu'il couvrait déjà (même calcul que monthlyEquivalent).
ALTER TABLE `envelopes` RENAME COLUMN `monthly_target` TO `monthly_extra`;--> statement-breakpoint
WITH `charges` AS (
  SELECT `envelope_id`, SUM(CAST(ROUND(CASE `frequency`
    WHEN 'daily' THEN `amount` * 365.0 / 12 / MAX(1, `interval`)
    WHEN 'weekly' THEN `amount` * 52.0 / 12 / MAX(1, `interval`)
    WHEN 'monthly' THEN `amount` * 1.0 / MAX(1, `interval`)
    WHEN 'yearly' THEN `amount` / 12.0 / MAX(1, `interval`)
  END) AS INTEGER)) AS `total`
  FROM `recurring_rules`
  WHERE `kind` = 'expense' AND `active` = 1 AND `envelope_id` IS NOT NULL
    AND (`end_date` IS NULL OR `end_date` >= date('now', 'start of month'))
  GROUP BY `envelope_id`
)
UPDATE `envelopes`
SET `monthly_extra` = CASE
  WHEN `monthly_extra` - COALESCE((SELECT `total` FROM `charges` WHERE `charges`.`envelope_id` = `envelopes`.`id`), 0) >= 100
    THEN `monthly_extra` - COALESCE((SELECT `total` FROM `charges` WHERE `charges`.`envelope_id` = `envelopes`.`id`), 0)
  ELSE NULL
END
WHERE `monthly_extra` IS NOT NULL;
```

L'ordre des opérations flottantes reproduit celui de `monthlyEquivalent` (`(amount * 365) / 12 / step`, `amount / 12 / step`), et `ROUND` arrondit comme `Math.round` pour des montants positifs.

- [ ] **Step 6: Corriger l'instantané et vérifier qu'il colle au schéma**

Une migration personnalisée recopie l'instantané précédent : il faut y renommer la colonne à la main.

Run: `sed -i 's/"monthly_target"/"monthly_extra"/g' server/src/db/migrations/meta/0009_snapshot.json && grep -c '"monthly_extra"' server/src/db/migrations/meta/0009_snapshot.json`
Expected: `2` (la clé et le champ `name` de la colonne).

Run: `npx drizzle-kit generate`
Expected: `No schema changes, nothing to migrate 😴`, aucun fichier `0010_*` créé (s'il en apparaît un, l'instantané est faux : le supprimer avec son entrée de journal et corriger l'instantané).

- [ ] **Step 7: Lancer le test de migration**

Run: `npx vitest run server/test/migrations.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 8: Renommer le champ dans les schémas zod**

Dans `shared/schemas.ts`, dans `envelopeSchema`, remplacer `monthlyTarget: centsSchema.nullable(),` par :

```ts
  /** Complément mensuel saisi à la main, en plus des charges fixes ; null = pas de complément. */
  monthlyExtra: centsSchema.nullable(),
```

Dans `envelopeFields`, remplacer `monthlyTarget: positiveCentsSchema.nullable().optional(),` par :

```ts
  monthlyExtra: positiveCentsSchema.nullable().optional(),
```

Ne pas toucher à `askActionSchema` : l'action `budget` garde `monthlyTarget` côté Claude.

- [ ] **Step 9: Adapter le repo des enveloppes**

Dans `server/src/repos/envelopes.ts`, dans `createEnvelope`, remplacer `monthlyTarget: input.monthlyTarget ?? null,` par :

```ts
      monthlyExtra: input.monthlyExtra ?? null,
```

Dans `updateEnvelope`, remplacer `if (input.monthlyTarget !== undefined) patch.monthlyTarget = input.monthlyTarget;` par :

```ts
  if (input.monthlyExtra !== undefined) patch.monthlyExtra = input.monthlyExtra;
```

- [ ] **Step 10: Adapter les tests du repo et des routes**

Dans `server/test/repos.test.ts`, remplacer le test `met à jour l’objectif` par :

```ts
  it('met à jour le complément', () => {
    const e = updateEnvelope(ctx.db, ctx.courses.id, { monthlyExtra: 400_00 });
    expect(e.monthlyExtra).toBe(400_00);
    expect(updateEnvelope(ctx.db, ctx.courses.id, { monthlyExtra: null }).monthlyExtra).toBeNull();
  });
```

Dans `server/test/routes.test.ts`, test `crée avec couleur par défaut et réordonne`, remplacer les deux premières lignes par :

```ts
    const created = await t.call('POST', '/api/envelopes', { name: 'Vacances', monthlyExtra: 100_00 });
    expect(created.body).toMatchObject({ color: '#4f8a5b', monthlyExtra: 100_00, sortOrder: 2 });
```

- [ ] **Step 11: Lancer les tests ciblés**

Run: `npx vitest run server/test/migrations.test.ts server/test/repos.test.ts server/test/routes.test.ts`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add server/src/db/schema.ts server/src/db/migrations/0009_envelope_monthly_extra.sql server/src/db/migrations/meta/0009_snapshot.json server/src/db/migrations/meta/_journal.json shared/schemas.ts server/src/repos/envelopes.ts server/test/migrations.test.ts server/test/repos.test.ts server/test/routes.test.ts
git commit -m "feat(server): complément mensuel des enveloppes, migration des budgets en compléments"
```

---

### Task 2: Moteur - `withBudgets` et budget calculé partout dans `core`

**Files:**
- Modify: `shared/api-types.ts:58-64` (type `BudgetedEnvelope`, `EnvelopeWithBalance`)
- Modify: `core/types.ts`
- Modify: `core/budget.ts`
- Modify: `core/forecast.ts:9-15,146-149`
- Modify: `core/test-fixtures.ts`
- Test: `core/budget.test.ts`, `core/forecast.test.ts`

**Interfaces:**
- Consumes: `Envelope` avec `monthlyExtra` (tâche 1) ; `monthlyEquivalent(rule: Pick<RecurringRule, 'frequency' | 'interval' | 'amount'>): number` de `core/recurrence.ts`.
- Produces:
  - `type BudgetedEnvelope = Envelope & { monthlyCharges: Cents; monthlyBudget: Cents }` dans `shared/api-types.ts`, réexporté par `core/types.ts`.
  - `type EnvelopeWithBalance = BudgetedEnvelope & { balance; allocatedThisMonth; spentThisMonth; toFundThisMonth }`.
  - `isEnvelopeCharge(rule: Pick<RecurringRule, 'kind' | 'active' | 'envelopeId' | 'endDate'>, today: ISODate): boolean` dans `core/budget.ts`.
  - `withBudgets(envelopes: Envelope[], rules: RecurringRule[], today: ISODate): BudgetedEnvelope[]` dans `core/budget.ts`.
  - `remainingToFund(envelope: Pick<BudgetedEnvelope, 'monthlyBudget'>, allocatedThisMonth: number): number`.
  - `planAutoFunding(envelopes: BudgetedEnvelope[], allocated: Map<number, number>, available: number): FundingPlan`.
  - `State.envelopes: BudgetedEnvelope[]`.
  - Fixture `envelope(partial: Partial<BudgetedEnvelope> & { name: string }): BudgetedEnvelope`, qui calcule `monthlyBudget = monthlyCharges + (monthlyExtra ?? 0)` si on ne le donne pas.

- [ ] **Step 1: Ajouter le type `BudgetedEnvelope`**

Dans `shared/api-types.ts`, remplacer le bloc `export type EnvelopeWithBalance = Envelope & {` (jusqu'à son `};`) par :

```ts
/** Enveloppe avec son budget du mois, calculé à partir de ses charges fixes. */
export type BudgetedEnvelope = Envelope & {
  /** Charges fixes ramenées au mois. */
  monthlyCharges: Cents;
  /** monthlyCharges + (monthlyExtra ?? 0) ; 0 = pas de budget. */
  monthlyBudget: Cents;
};

export type EnvelopeWithBalance = BudgetedEnvelope & {
  balance: Cents;
  allocatedThisMonth: Cents;
  spentThisMonth: Cents;
  /** Ce qu'il manque pour atteindre le budget du mois. */
  toFundThisMonth: Cents;
};
```

- [ ] **Step 2: Passer l'état du moteur aux enveloppes enrichies**

Remplacer tout `core/types.ts` par :

```ts
import type { BudgetedEnvelope } from '@shared/api-types';
import type { Account, Envelope, RecurringRule, Transaction } from '@shared/schemas';

/** Sous-ensemble d'une opération suffisant pour les calculs de solde. */
export type Operation = Pick<
  Transaction,
  'kind' | 'amount' | 'accountId' | 'toAccountId' | 'envelopeId' | 'fromEnvelopeId'
>;

export type State = {
  accounts: Account[];
  /** Enveloppes avec leur budget du mois (voir `withBudgets`). */
  envelopes: BudgetedEnvelope[];
  transactions: Transaction[];
};

export type { Account, BudgetedEnvelope, Envelope, RecurringRule, Transaction };
```

- [ ] **Step 3: Enrichir la fixture `envelope()`**

Dans `core/test-fixtures.ts`, remplacer la ligne d'import par :

```ts
import type { BudgetedEnvelope } from '@shared/api-types';
import type { Account, Envelope, RecurringRule, Transaction } from '@shared/schemas';
```

et remplacer la fonction `envelope` par :

```ts
/** Enveloppe déjà enrichie ; `monthlyBudget` suit `monthlyCharges` et `monthlyExtra` sauf s'il est donné. */
export function envelope(partial: Partial<BudgetedEnvelope> & { name: string }): BudgetedEnvelope {
  const e: Envelope & { monthlyCharges: number } = {
    id: nextId++,
    color: '#4f8a5b',
    monthlyExtra: null,
    sortOrder: 0,
    archived: false,
    isSavings: false,
    monthlyCharges: 0,
    ...partial,
  };
  return { ...e, monthlyBudget: partial.monthlyBudget ?? e.monthlyCharges + (e.monthlyExtra ?? 0) };
}
```

- [ ] **Step 4: Écrire les tests qui échouent**

Dans `core/budget.test.ts`, remplacer les imports par :

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { monthActivity, planAutoFunding, remainingToFund, savedInMonth, withBudgets } from './budget';
import { account, envelope, resetIds, rule, tx } from './test-fixtures';
```

Remplacer le test `remainingToFund : jamais négatif, nul sans budget` par :

```ts
  it('remainingToFund : jamais négatif, nul sans budget', () => {
    expect(remainingToFund({ monthlyBudget: 400_00 }, 150_00)).toBe(250_00);
    expect(remainingToFund({ monthlyBudget: 400_00 }, 500_00)).toBe(0);
    expect(remainingToFund({ monthlyBudget: 0 }, 0)).toBe(0);
  });
```

Dans le `describe('planAutoFunding')`, remplacer chaque `monthlyTarget: 300_00`, `monthlyTarget: 100_00` par `monthlyExtra: 300_00`, `monthlyExtra: 100_00`, et `monthlyTarget: null` par `monthlyExtra: null` (les attentes ne changent pas).
Puis ajouter à la fin de ce `describe` :

```ts
  it('une enveloppe sans complément est complétée jusqu’à ses charges', () => {
    const logement = envelope({ name: 'Logement' });
    const loyer = rule({ kind: 'expense', amount: 986_00, envelopeId: logement.id });
    const [budgeted] = withBudgets([logement], [loyer], '2026-10-08');
    expect(remainingToFund(budgeted!, 0)).toBe(986_00);
    expect(planAutoFunding([budgeted!], new Map(), 2000_00)).toEqual({ items: [{ envelopeId: logement.id, amount: 986_00 }], shortfallCount: 0 });
  });
```

Ajouter à la fin du fichier :

```ts
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
```

Dans `core/forecast.test.ts`, remplacer l'import des fixtures par :

```ts
import { withBudgets } from './budget';
import { account, envelope, resetIds, rule, tx } from './test-fixtures';
```

Remplacer le test `compte le budget mensuel : le reste du mois aujourd’hui, puis le budget complet chaque 1er` par :

```ts
  it('compte le budget mensuel : le reste du mois aujourd’hui, puis le budget complet chaque 1er', () => {
    const courant = account({ name: 'Courant', initialBalance: 5000_00 });
    const logement = envelope({ name: 'Logement' });
    const loyer = rule({ kind: 'expense', amount: 800_00, accountId: courant.id, envelopeId: logement.id, frequency: 'monthly', dayOfMonth: 5, startDate: '2026-01-01', lastGeneratedDate: '2026-03-05' });
    // Le budget de Logement vient de sa charge : aucun montant saisi à la main.
    const [budgeted] = withBudgets([logement], [loyer], '2026-03-10');
    const dejaReparti = tx({ kind: 'allocation', amount: 300_00, envelopeId: logement.id, date: '2026-03-02' });
    const r = forecast({ accounts: [courant], envelopes: [budgeted!], transactions: [dejaReparti] }, [loyer], '2026-03-10', 60);

    const budget = r.events.filter((e) => e.source === 'budget');
    expect(budget.map((e) => [e.date, e.amount])).toEqual([
      ['2026-03-10', 500_00],
      ['2026-04-01', 800_00],
      ['2026-05-01', 800_00],
    ]);
    expect(budget[0]).toMatchObject({ kind: 'allocation', envelopeId: logement.id, sourceId: logement.id, label: 'Budget Logement' });
    // Le loyer du 5 est couvert par le budget du 1er : pas de fausse alerte.
    expect(r.alerts).toEqual([]);
  });
```

Dans les tests `n’ajoute rien pour une enveloppe sans budget, archivée ou déjà remplie` et `un mois futur déjà réparti ne prévoit que le reste de son budget`, remplacer chaque `monthlyTarget:` par `monthlyExtra:` (les attentes ne changent pas).

- [ ] **Step 5: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run core/budget.test.ts core/forecast.test.ts`
Expected: FAIL, notamment `withBudgets is not a function` (ou `does not provide an export named 'withBudgets'`) et des attentes de budget à 0 dans `remainingToFund`, `planAutoFunding` et la prévision.

- [ ] **Step 6: Implémenter `withBudgets` et lire `monthlyBudget`**

Dans `core/budget.ts`, remplacer les deux lignes d'import par :

```ts
import type { BudgetedEnvelope } from '@shared/api-types';
import { endOfMonth, startOfMonth, type ISODate } from '@shared/dates';
import type { Account, Envelope, RecurringRule, Transaction } from '@shared/schemas';
import { monthlyEquivalent } from './recurrence';
```

Remplacer `remainingToFund` et `planAutoFunding` (de leur commentaire jusqu'à la fin de `planAutoFunding`) par :

```ts
/**
 * Une règle est une charge de son enveloppe : dépense active, rattachée à une enveloppe,
 * et pas terminée avant le mois de `today`.
 */
export function isEnvelopeCharge(rule: Pick<RecurringRule, 'kind' | 'active' | 'envelopeId' | 'endDate'>, today: ISODate): boolean {
  return rule.kind === 'expense' && rule.active && rule.envelopeId != null && (rule.endDate == null || rule.endDate >= startOfMonth(today));
}

/**
 * Budget du mois de chaque enveloppe : ses charges fixes ramenées au mois, plus son complément.
 * Une charge trimestrielle de 10,80 € compte 3,60 € par mois : l'enveloppe accumule de quoi la payer.
 */
export function withBudgets(envelopes: Envelope[], rules: RecurringRule[], today: ISODate): BudgetedEnvelope[] {
  const charges = new Map<number, number>();
  for (const rule of rules) {
    const id = rule.envelopeId;
    if (id == null || !isEnvelopeCharge(rule, today)) continue;
    charges.set(id, (charges.get(id) ?? 0) + monthlyEquivalent(rule));
  }
  return envelopes.map((e) => {
    const monthlyCharges = charges.get(e.id) ?? 0;
    return { ...e, monthlyCharges, monthlyBudget: monthlyCharges + (e.monthlyExtra ?? 0) };
  });
}

/** Ce qu'il manque à une enveloppe pour atteindre son budget du mois (0 si atteint ou sans budget). */
export function remainingToFund(envelope: Pick<BudgetedEnvelope, 'monthlyBudget'>, allocatedThisMonth: number): number {
  return Math.max(0, envelope.monthlyBudget - allocatedThisMonth);
}

export type FundingPlan = { items: { envelopeId: number; amount: number }[]; shortfallCount: number };

/**
 * Répartition automatique : chaque enveloppe active qui a un budget reçoit ce qui lui manque pour le mois,
 * dans l'ordre de la page Budget, tant qu'il reste de l'argent. Le surplus reste à répartir.
 */
export function planAutoFunding(envelopes: BudgetedEnvelope[], allocated: Map<number, number>, available: number): FundingPlan {
  const ordered = envelopes.filter((e) => !e.archived && e.monthlyBudget > 0).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const items: FundingPlan['items'] = [];
  let left = Math.max(0, available);
  let shortfallCount = 0;
  for (const env of ordered) {
    const missing = remainingToFund(env, allocated.get(env.id) ?? 0);
    if (missing === 0) continue;
    const amount = Math.min(missing, left);
    if (amount < missing) shortfallCount++;
    if (amount === 0) continue;
    items.push({ envelopeId: env.id, amount });
    left -= amount;
  }
  return { items, shortfallCount };
}
```

`savedInMonth` garde sa signature (`envelopes: Envelope[]`) : une `BudgetedEnvelope` y passe telle quelle.

Dans `core/forecast.ts`, dans le commentaire de `forecast`, remplacer `et budget mensuel des enveloppes` par `et budget mensuel des enveloppes (charges fixes + complément, calculé pour le mois de `today`)`.
Dans `budgetEvents`, remplacer `if (env.archived || !env.monthlyTarget) continue;` par :

```ts
    if (env.archived || env.monthlyBudget <= 0) continue;
```

- [ ] **Step 7: Lancer les tests du moteur**

Run: `npx vitest run core`
Expected: PASS (tous les fichiers de `core/`).

- [ ] **Step 8: Commit**

```bash
git add shared/api-types.ts core/types.ts core/budget.ts core/forecast.ts core/test-fixtures.ts core/budget.test.ts core/forecast.test.ts
git commit -m "feat(core): budget d'une enveloppe calculé à partir de ses charges fixes et de son complément"
```

---

### Task 3: Serveur - état enrichi, vue d'ensemble, rapports et dépenses courantes

**Files:**
- Modify: `server/src/services/state.ts`
- Modify: `server/src/services/overview.ts`
- Modify: `server/src/services/reports.ts`
- Modify: `server/src/services/forecast.ts:9`
- Modify: `server/src/services/auto-funding.ts:23`
- Modify: `server/src/services/export.ts`
- Modify: `server/src/routes/insights.ts:27-31`
- Modify: `shared/api-types.ts` (`MonthSummary`, `SpendingReport`)
- Test: `server/test/insights.test.ts`, `server/test/auto-funding.test.ts`

**Interfaces:**
- Consumes: `withBudgets`, `BudgetedEnvelope`, `remainingToFund` (tâche 2) ; `listEnvelopes(db, { includeArchived })`, `listRules(db)`.
- Produces:
  - `listBudgetedEnvelopes(db: Db, today: ISODate, opts?: { includeArchived?: boolean }): BudgetedEnvelope[]` dans `server/src/services/state.ts`.
  - `loadState(db: Db, today: ISODate): State & { rules: RecurringRule[] }`.
  - `spendingReport(db: Db, today: ISODate, from: ISODate, to: ISODate): SpendingReport`.
  - `SpendingReport.byEnvelope[].monthlyBudget: Cents` (au lieu de `monthlyTarget: Cents | null`).
  - `Overview.envelopes[]` porte `monthlyExtra`, `monthlyCharges`, `monthlyBudget`.
  - `Overview.month.variable.budget` = somme des compléments hors épargne ; `variable.spent` = dépenses confirmées du mois hors épargne et hors opérations générées par une règle.
  - Les exports JSON et CSV lisent la base brute (enveloppes sans champs calculés).

- [ ] **Step 1: Écrire les tests qui échouent**

Dans `server/test/auto-funding.test.ts`, remplacer chaque `monthlyTarget:` par `monthlyExtra:` (trois occurrences ; les attentes ne changent pas).

Dans `server/test/insights.test.ts` (le `beforeEach` crée une charge « Loyer » de 3 000 € rattachée à Loisirs, qui porte désormais le budget de Loisirs) :

Remplacer les quatre premières lignes du test `compare les budgets des enveloppes au revenu mensuel attendu` par :

```ts
    await t.call('PATCH', `/api/envelopes/${t.courses.id}`, { monthlyExtra: 400_00 });
    // Loisirs n'a pas de complément : son budget est sa charge « Loyer » de 3 000 €.
    const epargne = await t.call('POST', '/api/envelopes', { name: 'Épargne', color: '#4f8a5b', monthlyExtra: 100_00, isSavings: true });
    expect(epargne.status).toBe(201);
```

Dans le test `assemble soldes, alertes et compteurs`, remplacer à partir de `// Dépenses du mois à trier comprises` jusqu'à la fin du test par :

```ts
    // Dépenses du mois à trier comprises ; le virement vers le livret est mis de côté.
    // Loisirs porte la charge « Loyer » : 3 000 € de budget, encore à répartir.
    expect(body.month).toEqual({ start: '2026-03-01', end: '2026-03-31', spent: 75_00, budget: 3000_00, variable: { spent: 75_00, budget: 0 }, saved: 500_00, toFund: 3000_00, income: 0, planned: 3000_00 });
    expect(body.envelopes.find((e: any) => e.id === t.loisirs.id)).toMatchObject({ monthlyExtra: null, monthlyCharges: 3000_00, monthlyBudget: 3000_00, toFundThisMonth: 3000_00 });
    expect(body.unsortedCount).toBe(1);
    expect(body.latePlanned).toEqual([]);
    // Sur 90 jours, trois loyers font plonger le compte à -6 575 €.
    // L'enveloppe, elle, reçoit son budget chaque mois avant le loyer : pas d'alerte.
    expect(body.alerts.map((a: any) => [a.kind, a.firstNegativeDate, a.minBalance])).toEqual([['account', '2026-03-20', -6575_00]]);
  });
```

Dans le test `le résumé du mois sépare consommation et épargne, et compte ce qu’il reste à répartir`, remplacer les deux `PATCH` par :

```ts
    await t.call('PATCH', `/api/envelopes/${t.courses.id}`, { monthlyExtra: 500_00 });
    await t.call('PATCH', `/api/envelopes/${t.loisirs.id}`, { monthlyExtra: 100_00, isSavings: true });
```

et l'attente `expect(body.month).toMatchObject(...)` par :

```ts
    // Loisirs (épargne) porte aussi la charge « Loyer » : 3 000 € + 100 € à répartir, plus les 100 € qui manquent à Courses.
    expect(body.month).toMatchObject({ spent: 75_00, budget: 500_00, variable: { spent: 75_00, budget: 500_00 }, saved: 540_00, toFund: 3200_00 });
```

Remplacer tout le test `les dépenses courantes excluent les enveloppes portées par une charge fixe` par :

```ts
  it('les dépenses courantes excluent les opérations des charges fixes, pas le reste de leur enveloppe', async () => {
    await t.call('PATCH', `/api/envelopes/${t.courses.id}`, { monthlyExtra: 300_00 });
    await t.call('PATCH', `/api/envelopes/${t.loisirs.id}`, { monthlyExtra: 50_00 });
    // Le 21, le loyer du 20 est attendu ; le relevé le confirme.
    t.setToday('2026-03-21');
    const planned = (await t.call('GET', '/api/transactions?status=planned')).body;
    const loyer = planned.find((p: any) => p.label === 'Loyer');
    expect((await t.call('POST', `/api/transactions/${loyer.id}/confirm`)).status).toBe(200);
    await t.call('POST', '/api/transactions', { kind: 'expense', date: '2026-03-21', amount: 20_00, label: 'Cinéma', accountId: t.courant.id, envelopeId: t.loisirs.id });

    const { body } = await t.call('GET', '/api/overview');
    // Le loyer (généré par la règle) n'est pas une dépense courante ; le cinéma, rangé dans la même enveloppe, l'est.
    // Budget courant : les compléments seulement (300 + 50).
    expect(body.month).toMatchObject({ spent: 3095_00, budget: 3350_00, variable: { spent: 95_00, budget: 350_00 } });
  });
```

Dans le test `projette sur l’horizon demandé`, remplacer `expect(body.events.map((e: any) => e.date)).toEqual(['2026-03-20']);` par :

```ts
    // Le budget de Loisirs vient de sa charge « Loyer » : réparti aujourd'hui puis le 1er avril.
    expect(body.events.map((e: any) => e.date)).toEqual(['2026-03-10', '2026-03-20', '2026-04-01']);
```

Dans le test `dépenses par enveloppe sur le mois courant`, remplacer les attentes par :

```ts
    // Loisirs n'a rien dépensé mais sa charge compte dans le budget de dépenses.
    expect(body).toMatchObject({ from: '2026-03-01', to: '2026-03-31', total: 75_00, monthlyBudget: 3000_00 });
    expect(body.byEnvelope).toEqual([
      { envelopeId: t.courses.id, name: 'Courses', color: '#4f8a5b', amount: 60_00, monthlyBudget: 0 },
      { envelopeId: null, name: 'À ranger', color: '#9a9a9a', amount: 15_00, monthlyBudget: 0 },
    ]);
```

Dans le test `json complet`, ajouter avant la fin du test :

```ts
    // L'export garde les données saisies, pas les budgets calculés.
    expect(body.envelopes[0]).toHaveProperty('monthlyExtra');
    expect(body.envelopes[0]).not.toHaveProperty('monthlyBudget');
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run server/test/insights.test.ts server/test/auto-funding.test.ts`
Expected: FAIL sur les budgets (`budget: 0` au lieu de `3000_00`, `monthlyBudget` absent, dépenses courantes à 75 € au lieu de 95 €, événements de prévision sans budget).

- [ ] **Step 3: Charger l'état avec les budgets du mois**

Remplacer tout `server/src/services/state.ts` par :

```ts
import { withBudgets } from '@core/budget';
import type { State } from '@core/types';
import type { BudgetedEnvelope } from '@shared/api-types';
import type { ISODate } from '@shared/dates';
import type { RecurringRule } from '@shared/schemas';
import type { Db } from '../db/client';
import { listAccounts } from '../repos/accounts';
import { listEnvelopes } from '../repos/envelopes';
import { listRules } from '../repos/recurring-rules';
import { allTransactions } from '../repos/transactions';

/** Enveloppes avec leur budget du mois de `today` : charges fixes ramenées au mois, plus le complément. */
export function listBudgetedEnvelopes(db: Db, today: ISODate, { includeArchived = false } = {}): BudgetedEnvelope[] {
  return withBudgets(listEnvelopes(db, { includeArchived }), listRules(db), today);
}

/** Charge tout l'état nécessaire aux calculs purs du moteur ; les budgets sont ceux du mois de `today`. */
export function loadState(db: Db, today: ISODate): State & { rules: RecurringRule[] } {
  const rules = listRules(db);
  return {
    accounts: listAccounts(db, { includeArchived: true }),
    envelopes: withBudgets(listEnvelopes(db, { includeArchived: true }), rules, today),
    transactions: allTransactions(db),
    rules,
  };
}
```

- [ ] **Step 4: Vue d'ensemble et dépenses courantes**

Remplacer tout `server/src/services/overview.ts` par :

```ts
import { computeBalances } from '@core/balances';
import { monthActivity, remainingToFund, savedInMonth } from '@core/budget';
import { forecast } from '@core/forecast';
import { MATCH_TOLERANCE_DAYS } from '@core/matching';
import { monthlyEquivalent } from '@core/recurrence';
import type { Overview } from '@shared/api-types';
import { addDays, endOfMonth, startOfMonth, type ISODate } from '@shared/dates';
import type { Db } from '../db/client';
import { latestFundingView } from '../repos/fundings';
import { lastImportForAccount } from '../repos/imports';
import { getSettings } from '../repos/settings';
import { countUnsorted } from '../repos/transactions';
import { loadState } from './state';

export function buildOverview(db: Db, today: ISODate): Overview {
  const state = loadState(db, today);
  const balances = computeBalances(state, today);
  const horizon = getSettings(db).forecastHorizonDays;
  const { alerts } = forecast(state, state.rules, today, horizon);

  const { allocated, spent } = monthActivity(state.transactions, today);
  const envelopes = state.envelopes
    .filter((e) => !e.archived)
    .map((e) => ({
      ...e,
      balance: balances.envelopes[e.id] ?? 0,
      allocatedThisMonth: allocated.get(e.id) ?? 0,
      spentThisMonth: spent.get(e.id) ?? 0,
      toFundThisMonth: remainingToFund(e, allocated.get(e.id) ?? 0),
    }));

  // Consommation du mois : toutes les dépenses confirmées (même à trier), hors enveloppes d'épargne.
  // Dépenses courantes : les mêmes, sauf celles générées par une charge fixe (loyer, Navigo...).
  // Un ticket de métro rangé dans Transports compte donc, le Navigo non.
  const savings = new Set(state.envelopes.filter((e) => e.isSavings).map((e) => e.id));
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  let monthSpent = 0;
  let variableSpent = 0;
  for (const t of state.transactions) {
    if (t.kind !== 'expense' || t.status !== 'confirmed' || t.date < monthStart || t.date > monthEnd) continue;
    if (t.envelopeId != null && savings.has(t.envelopeId)) continue;
    monthSpent += t.amount;
    if (t.recurringRuleId == null) variableSpent += t.amount;
  }
  const spending = envelopes.filter((e) => !e.isSavings);
  // Revenu attendu : revenus récurrents actifs et pas encore terminés, ramenés au mois.
  const income = state.rules
    .filter((r) => r.active && r.kind === 'income' && (r.endDate == null || r.endDate >= monthStart))
    .reduce((sum, r) => sum + monthlyEquivalent(r), 0);

  return {
    today,
    toAllocate: balances.toAllocate,
    netWorth: balances.netWorth,
    accounts: state.accounts
      .filter((a) => !a.archived)
      .map((a) => ({ ...a, balance: balances.accounts[a.id] ?? 0, lastImport: lastImportForAccount(db, a.id) })),
    envelopes,
    month: {
      start: monthStart,
      end: monthEnd,
      spent: monthSpent,
      budget: spending.reduce((sum, e) => sum + e.monthlyBudget, 0),
      variable: {
        spent: variableSpent,
        // Le budget courant est la part saisie à la main : les charges fixes ont leurs propres opérations.
        budget: spending.reduce((sum, e) => sum + (e.monthlyExtra ?? 0), 0),
      },
      saved: savedInMonth(state.accounts, state.envelopes, state.transactions, today),
      toFund: envelopes.reduce((sum, e) => sum + e.toFundThisMonth, 0),
      income,
      planned: envelopes.reduce((sum, e) => sum + e.monthlyBudget, 0),
    },
    alerts,
    unsortedCount: countUnsorted(db),
    // Une prévue n'est « en retard » qu'une fois sortie de la fenêtre de rapprochement : le relevé ne la confirmera plus.
    latePlanned: state.transactions
      .filter((t) => t.status === 'planned' && t.date < addDays(today, -MATCH_TOLERANCE_DAYS))
      .sort((a, b) => (a.date < b.date ? -1 : 1)),
    latestFunding: latestFundingView(db),
  };
}
```

Dans `shared/api-types.ts`, dans `MonthSummary`, remplacer les commentaires de `budget` et `variable` par :

```ts
  /** Somme des budgets mensuels (charges fixes + complément) des enveloppes hors épargne. */
  budget: Cents;
  /**
   * Dépenses courantes : dépenses confirmées hors épargne qui ne viennent pas d'une règle récurrente,
   * face à la somme des compléments des enveloppes hors épargne.
   */
  variable: { spent: Cents; budget: Cents };
```

et le commentaire de `planned` par :

```ts
  /** Somme des budgets mensuels (charges fixes + complément) de toutes les enveloppes, épargne comprise : ce que le budget prélève sur le revenu. */
```

- [ ] **Step 5: Rapports, prévision, répartition automatique, export**

Dans `shared/api-types.ts`, dans `SpendingReport`, remplacer la ligne `byEnvelope` par :

```ts
  byEnvelope: { envelopeId: number | null; name: string; color: string; amount: Cents; monthlyBudget: Cents }[];
```

et le commentaire de `monthlyBudget` par `/** Somme des budgets mensuels (charges fixes + complément) des enveloppes de dépenses actives, pour comparer à la période. */`.

Dans `server/src/services/reports.ts`, remplacer `spendingReport` par :

```ts
/** Dépenses de [from, to] par enveloppe ; les budgets sont ceux du mois de `today`. */
export function spendingReport(db: Db, today: ISODate, from: ISODate, to: ISODate): SpendingReport {
  const state = loadState(db, today);
  const totals = new Map<number | null, number>();
  for (const t of state.transactions) {
    if (t.kind !== 'expense' || t.status !== 'confirmed' || t.date < from || t.date > to) continue;
    totals.set(t.envelopeId, (totals.get(t.envelopeId) ?? 0) + t.amount);
  }
  const byEnvelope: SpendingReport['byEnvelope'] = [];
  for (const env of state.envelopes) {
    if (env.isSavings) continue;
    const amount = totals.get(env.id) ?? 0;
    if (amount > 0) byEnvelope.push({ envelopeId: env.id, name: env.name, color: env.color, amount, monthlyBudget: env.monthlyBudget });
  }
  const unsorted = totals.get(null) ?? 0;
  if (unsorted > 0) byEnvelope.push({ envelopeId: null, name: 'À ranger', color: '#9a9a9a', amount: unsorted, monthlyBudget: 0 });
  byEnvelope.sort((a, b) => b.amount - a.amount);
  const total = byEnvelope.reduce((s, e) => s + e.amount, 0);
  const monthlyBudget = state.envelopes.filter((e) => !e.archived && !e.isSavings).reduce((s, e) => s + e.monthlyBudget, 0);
  return { from, to, total, monthlyBudget, byEnvelope };
}
```

Dans le même fichier, remplacer `const state = loadState(db);` par `const state = loadState(db, today);` dans `monthlyReport` et `netWorthReport`.

Dans `server/src/routes/insights.ts`, route `/spending`, remplacer `return c.json(spendingReport(c.get('db'), from, to));` par :

```ts
    return c.json(spendingReport(c.get('db'), today, from, to));
```

Dans `server/src/services/forecast.ts`, remplacer `const state = loadState(db);` par `const state = loadState(db, today);`.

Dans `server/src/services/auto-funding.ts`, remplacer `const state = loadState(db);` par :

```ts
  // Budgets du mois financé : une charge terminée avant ce mois-là ne compte plus.
  const state = loadState(db, date);
```

Remplacer tout `server/src/services/export.ts` jusqu'à la fin de `exportJson` (imports compris) par :

```ts
import type { Db } from '../db/client';
import { listAccounts } from '../repos/accounts';
import { listEnvelopes } from '../repos/envelopes';
import { listFundings } from '../repos/fundings';
import { listImports } from '../repos/imports';
import { listRules } from '../repos/recurring-rules';
import { listSortingRules } from '../repos/sorting-rules';
import { getSettings } from '../repos/settings';
import { allTransactions } from '../repos/transactions';

/** Export complet des données saisies, sans les valeurs calculées (soldes, budgets). */
export function exportJson(db: Db) {
  return {
    exportedAt: new Date().toISOString(),
    version: 1,
    accounts: listAccounts(db, { includeArchived: true }),
    envelopes: listEnvelopes(db, { includeArchived: true }),
    transactions: allTransactions(db),
    recurringRules: listRules(db),
    sortingRules: listSortingRules(db),
    imports: listImports(db),
    fundings: listFundings(db),
    // La clé privée Enable Banking ne sort jamais de la base : l'utilisateur garde le fichier .pem.
    settings: { ...getSettings(db), enableBankingPrivateKey: '' },
  };
}
```

Dans `exportCsv`, remplacer les trois premières lignes du corps (`const state = loadState(db);` et les deux `Map`) par :

```ts
  const accountName = new Map(listAccounts(db, { includeArchived: true }).map((a) => [a.id, a.name]));
  const envelopeName = new Map(listEnvelopes(db, { includeArchived: true }).map((e) => [e.id, e.name]));
```

et `for (const t of state.transactions) {` par `for (const t of allTransactions(db)) {`.

- [ ] **Step 6: Lancer les tests serveur ciblés**

Run: `npx vitest run server/test/insights.test.ts server/test/auto-funding.test.ts server/test/materialize.test.ts server/test/import.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/services/state.ts server/src/services/overview.ts server/src/services/reports.ts server/src/services/forecast.ts server/src/services/auto-funding.ts server/src/services/export.ts server/src/routes/insights.ts shared/api-types.ts server/test/insights.test.ts server/test/auto-funding.test.ts
git commit -m "feat(server): budgets calculés depuis les charges, dépenses courantes hors opérations des charges fixes"
```

---

### Task 4: Demander - budget voulu converti en complément

**Files:**
- Modify: `shared/api-types.ts` (`AskActionView`)
- Modify: `server/src/ask/actions.ts`
- Modify: `server/src/ask/prompt.ts`
- Modify: `server/src/ask/ask.ts:11,69,109-110`
- Modify: `client/src/components/ask/ActionCard.tsx:21-24,60-61`
- Test: `server/test/ask-actions.test.ts`, `client/src/components/ask/ActionCard.test.tsx`

**Interfaces:**
- Consumes: `listBudgetedEnvelopes(db, today)` (tâche 3) ; `BudgetedEnvelope` (tâche 2) ; `EnvelopePatch.monthlyExtra` (tâche 1).
- Produces:
  - `validateActions(db: Db, raw: unknown[], today: ISODate): { actions: AskActionView[]; rejected: number; reasons: string[] }`.
  - `AskActionView` budget : `{ type: 'budget'; envelopeId: number; envelopeName: string; monthlyTarget: Cents | null; monthlyExtra: Cents | null; charges: Cents; current: Cents }`.
  - `buildAskSystemPrompt({ today, envelopes: BudgetedEnvelope[], accounts })`.

- [ ] **Step 1: Écrire les tests serveur qui échouent**

Dans `server/test/ask-actions.test.ts`, remplacer les imports par :

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { recurringRuleInputSchema } from '@shared/schemas';
import { validateActions } from '../src/ask/actions';
import { buildAskSystemPrompt } from '../src/ask/prompt';
import { createEnvelope, updateEnvelope } from '../src/repos/envelopes';
import { createRule } from '../src/repos/recurring-rules';
import { createTransaction } from '../src/repos/transactions';
import { createTestDb, type TestContext } from './helpers';

const TODAY = '2026-03-12';
```

Ajouter `, TODAY` comme troisième argument de chaque appel existant à `validateActions(ctx.db, [...])`.
Dans les deux premiers tests (`enrichit un rangement` et `écarte un rangement`), ajouter `reasons: []` aux objets attendus :

```ts
    expect(r).toEqual({
      actions: [{ type: 'sort', transactionIds: [a.id, b.id], envelopeId: ctx.loisirs.id, envelopeName: 'Loisirs', rulePattern: 'UBER', count: 2, total: 20_00 }],
      rejected: 0,
      reasons: [],
    });
```

```ts
    expect(r).toEqual({ actions: [], rejected: 2, reasons: [] });
```

Remplacer le test `enrichit un budget avec la valeur actuelle et refuse une enveloppe archivée` par :

```ts
  it('convertit le budget voulu en complément au-dessus des charges, et refuse une enveloppe archivée', () => {
    navigo(ctx.courses.id);
    updateEnvelope(ctx.db, ctx.courses.id, { monthlyExtra: 140_00 });
    const old = createEnvelope(ctx.db, { name: 'Ancienne', color: '#4f8a5b' });
    updateEnvelope(ctx.db, old.id, { archived: true });
    const r = validateActions(
      ctx.db,
      [
        { type: 'budget', envelopeId: ctx.courses.id, monthlyTarget: 150_00 },
        { type: 'budget', envelopeId: ctx.courses.id, monthlyTarget: 40_00 },
        { type: 'budget', envelopeId: ctx.courses.id, monthlyTarget: null },
        { type: 'budget', envelopeId: old.id, monthlyTarget: 10_00 },
      ],
      TODAY,
    );
    const courses = { type: 'budget', envelopeId: ctx.courses.id, envelopeName: 'Courses', charges: 40_00, current: 180_00 };
    expect(r).toEqual({
      actions: [
        { ...courses, monthlyTarget: 150_00, monthlyExtra: 110_00 },
        // Exactement les charges, ou null : plus de complément.
        { ...courses, monthlyTarget: 40_00, monthlyExtra: null },
        { ...courses, monthlyTarget: null, monthlyExtra: null },
      ],
      rejected: 1,
      reasons: [],
    });
  });

  it('refuse un budget sous les charges fixes, avec la raison', () => {
    navigo(ctx.courses.id);
    const r = validateActions(ctx.db, [{ type: 'budget', envelopeId: ctx.courses.id, monthlyTarget: 30_00 }], TODAY);
    expect(r).toEqual({ actions: [], rejected: 1, reasons: ['Le budget de Courses ne peut pas descendre sous ses charges fixes (40,00 €)'] });
  });
```

Ajouter juste après `beforeEach` :

```ts
/** Charge fixe de 40 € par mois rattachée à l'enveloppe. */
const navigo = (envelopeId: number) =>
  createRule(
    ctx.db,
    recurringRuleInputSchema.parse({ name: 'Navigo', kind: 'expense', amount: 40_00, label: 'NAVIGO', accountId: ctx.courant.id, envelopeId, frequency: 'monthly', dayOfMonth: 5, startDate: '2026-01-05' }),
  );
```

Ajouter à la fin du fichier :

```ts
describe('buildAskSystemPrompt', () => {
  it('décrit le budget, les charges et le complément de chaque enveloppe', () => {
    const transports = { id: 3, name: 'Transports', color: '#3f6fae', monthlyExtra: 90_00, sortOrder: 0, archived: false, isSavings: false, monthlyCharges: 40_00, monthlyBudget: 130_00 };
    const divers = { ...transports, id: 4, name: 'Divers', monthlyExtra: null, monthlyCharges: 0, monthlyBudget: 0 };
    const prompt = buildAskSystemPrompt({ today: '2026-10-08', envelopes: [transports, divers], accounts: [] });
    expect(prompt).toContain('- 3 : Transports (budget 130,00 € par mois : 40,00 € de charges fixes + 90,00 € de complément)');
    expect(prompt).toContain('- 4 : Divers\n');
    expect(prompt).toContain('envelopes(id, name, monthly_extra en centimes');
    expect(prompt).not.toContain('monthly_target');
  });
});
```

- [ ] **Step 2: Lancer les tests serveur pour vérifier qu'ils échouent**

Run: `npx vitest run server/test/ask-actions.test.ts`
Expected: FAIL (`reasons` absent, `monthlyExtra` et `charges` absents de la vue budget, prompt avec `monthly_target`).

- [ ] **Step 3: Implémenter la conversion côté serveur**

Dans `shared/api-types.ts`, remplacer la ligne budget de `AskActionView` par :

```ts
  /**
   * `monthlyTarget` : budget voulu par Claude (null = retirer le complément) ; `monthlyExtra` : complément à enregistrer ;
   * `charges` : charges fixes de l'enveloppe ramenées au mois ; `current` : budget actuel calculé.
   */
  | { type: 'budget'; envelopeId: number; envelopeName: string; monthlyTarget: Cents | null; monthlyExtra: Cents | null; charges: Cents; current: Cents }
```

Remplacer dans `server/src/ask/actions.ts` les imports et `validateActions` par :

```ts
import { inArray } from 'drizzle-orm';
import type { AskActionView, BudgetedEnvelope } from '@shared/api-types';
import type { ISODate } from '@shared/dates';
import { formatEuros } from '@shared/money';
import { askActionSchema, type Account, type AskAction } from '@shared/schemas';
import type { Db } from '../db/client';
import { transactions } from '../db/schema';
import { listAccounts } from '../repos/accounts';
import { listBudgetedEnvelopes } from '../services/state';

/**
 * Valide les actions proposées par Claude et les enrichit pour l'affichage ; les invalides sont écartées.
 * `reasons` explique les refus qui parlent à l'utilisateur (budget sous les charges fixes).
 */
export function validateActions(db: Db, raw: unknown[], today: ISODate): { actions: AskActionView[]; rejected: number; reasons: string[] } {
  const envelopes = new Map(listBudgetedEnvelopes(db, today).map((e) => [e.id, e]));
  const accounts = new Map(listAccounts(db).map((a) => [a.id, a]));
  const actions: AskActionView[] = [];
  const reasons: string[] = [];
  for (const item of raw) {
    const parsed = askActionSchema.safeParse(item);
    const view = parsed.success ? enrich(db, parsed.data, envelopes, accounts) : null;
    if (typeof view === 'string') reasons.push(view);
    else if (view) actions.push(view);
  }
  return { actions, rejected: raw.length - actions.length, reasons };
}
```

Remplacer la signature de `enrich` par :

```ts
/** Vue enrichie de l'action, raison d'un refus à expliquer, ou null pour une action simplement invalide. */
function enrich(db: Db, action: AskAction, envelopes: Map<number, BudgetedEnvelope>, accounts: Map<number, Account>): AskActionView | string | null {
```

et son `case 'budget'` par :

```ts
    case 'budget': {
      const env = envelopes.get(action.envelopeId);
      if (!env) return null;
      const target = action.monthlyTarget;
      if (target !== null && target < env.monthlyCharges) {
        return `Le budget de ${env.name} ne peut pas descendre sous ses charges fixes (${formatEuros(env.monthlyCharges)})`;
      }
      // Claude parle en budget total ; l'enveloppe ne stocke que ce qui s'ajoute aux charges.
      const extra = target === null ? 0 : target - env.monthlyCharges;
      return {
        type: 'budget',
        envelopeId: env.id,
        envelopeName: env.name,
        monthlyTarget: target,
        monthlyExtra: extra > 0 ? extra : null,
        charges: env.monthlyCharges,
        current: env.monthlyBudget,
      };
    }
```

Dans `server/src/ask/prompt.ts`, remplacer les imports et le début de `buildAskSystemPrompt` jusqu'à `.join('\n');` (la construction de `envList`) par :

```ts
import type { BudgetedEnvelope } from '@shared/api-types';
import type { ISODate } from '@shared/dates';
import { formatEuros } from '@shared/money';
import type { Account } from '@shared/schemas';

/** « (budget 130,00 € par mois : 40,00 € de charges fixes + 90,00 € de complément) », rien sans budget. */
function describeBudget(e: BudgetedEnvelope): string {
  if (e.monthlyBudget <= 0) return '';
  return ` (budget ${formatEuros(e.monthlyBudget)} par mois : ${formatEuros(e.monthlyCharges)} de charges fixes + ${formatEuros(e.monthlyExtra ?? 0)} de complément)`;
}

/** Prompt système de Demander : rôle, schéma de la base et ses pièges, forme de la réponse. */
export function buildAskSystemPrompt({ today, envelopes, accounts }: { today: ISODate; envelopes: BudgetedEnvelope[]; accounts: Account[] }): string {
  const envList = envelopes.map((e) => `- ${e.id} : ${e.name}${describeBudget(e)}${e.isSavings ? ' [épargne]' : ''}`).join('\n');
```

Dans le texte du prompt, remplacer la ligne `- envelopes(id, name, monthly_target en centimes, ...` par :

```
- envelopes(id, name, monthly_extra en centimes, sort_order, archived, is_savings) : le budget mensuel d'une enveloppe vaut monthly_extra (complément saisi à la main, NULL = 0) plus ses charges fixes ramenées au mois (recurring_rules de kind 'expense', actives, rattachées à l'enveloppe et pas terminées) ; la liste plus bas donne ces budgets déjà calculés. Les dépenses d'une enveloppe d'épargne sont de l'argent mis de côté, pas de la consommation.
```

et la ligne de l'action `budget` par :

```
  - budget : changer le budget mensuel d'une enveloppe (envelopeId, monthlyTarget = budget total voulu en centimes, charges fixes comprises et jamais en dessous ; null pour retirer le complément, le budget retombe alors à ses charges fixes) ;
```

Dans `server/src/ask/ask.ts`, remplacer l'import `import { listEnvelopes } from '../repos/envelopes';` par `import { listBudgetedEnvelopes } from '../services/state';`, l'argument `envelopes: listEnvelopes(db)` par `envelopes: listBudgetedEnvelopes(db, input.today)`, et les deux lignes de validation par :

```ts
    const { actions, rejected, reasons } = validateActions(db, parsed.data.actions, input.today);
    if (rejected > 0) console.warn(`Demander : ${rejected} action(s) proposée(s) écartée(s)${reasons.length > 0 ? ` (${reasons.join(' ; ')})` : ''}`);
```

- [ ] **Step 4: Lancer les tests serveur**

Run: `npx vitest run server/test/ask-actions.test.ts server/test/ask.test.ts server/test/ask-mcp.test.ts server/test/ask-query.test.ts`
Expected: PASS.

- [ ] **Step 5: Écrire les tests de la carte qui échouent**

Dans `client/src/components/ask/ActionCard.test.tsx`, remplacer les tests `change un budget mensuel ou le retire` et `annonce le retrait d’un budget` par :

```tsx
  it('change un budget mensuel en enregistrant le complément', async () => {
    renderCard({ type: 'budget', envelopeId: 4, envelopeName: 'Transports', monthlyTarget: 150_00, monthlyExtra: 110_00, charges: 40_00, current: 130_00 });
    expect(screen.getByText(/Passer Transports à 150,00\s€ par mois/)).toBeInTheDocument();
    expect(screen.getByText(/au lieu de 130,00\s€/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Appliquer' }));
    await screen.findByText('Fait');
    expect(lastCall()).toEqual({ url: '/api/envelopes/4', method: 'PATCH', body: { monthlyExtra: 110_00 } });
  });

  it('annonce le retrait d’un budget sans charge', () => {
    renderCard({ type: 'budget', envelopeId: 4, envelopeName: 'Restos', monthlyTarget: null, monthlyExtra: null, charges: 0, current: 180_00 });
    expect(screen.getByText('Retirer le budget mensuel de Restos')).toBeInTheDocument();
  });

  it('retirer le complément ramène le budget aux charges fixes', async () => {
    renderCard({ type: 'budget', envelopeId: 4, envelopeName: 'Transports', monthlyTarget: null, monthlyExtra: null, charges: 40_00, current: 130_00 });
    expect(screen.getByText(/Ramener Transports à ses charges fixes, 40,00\s€ par mois/)).toBeInTheDocument();
    expect(screen.getByText(/au lieu de 130,00\s€/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Appliquer' }));
    await screen.findByText('Fait');
    expect(lastCall()).toEqual({ url: '/api/envelopes/4', method: 'PATCH', body: { monthlyExtra: null } });
  });
```

Dans le test `affiche l’erreur du serveur et reste applicable`, remplacer l'appel `renderCard` par :

```tsx
    renderCard({ type: 'budget', envelopeId: 4, envelopeName: 'Restos', monthlyTarget: 150_00, monthlyExtra: 150_00, charges: 0, current: 0 });
```

- [ ] **Step 6: Lancer les tests de la carte pour vérifier qu'ils échouent**

Run: `npx vitest run client/src/components/ask/ActionCard.test.tsx`
Expected: FAIL (corps `{ monthlyTarget: ... }` au lieu de `{ monthlyExtra: ... }`, texte « Ramener » absent).

- [ ] **Step 7: Adapter la carte**

Dans `client/src/components/ask/ActionCard.tsx`, remplacer le `case 'budget':` de `describe` par :

```tsx
    case 'budget': {
      const detail = action.current ? `au lieu de ${formatEuros(action.current)}` : null;
      if (action.monthlyTarget !== null) return { title: `Passer ${action.envelopeName} à ${formatEuros(action.monthlyTarget)} par mois`, detail };
      return action.charges > 0
        ? { title: `Ramener ${action.envelopeName} à ses charges fixes, ${formatEuros(action.charges)} par mois`, detail }
        : { title: `Retirer le budget mensuel de ${action.envelopeName}`, detail: null };
    }
```

et, dans `apply`, la ligne du `case 'budget':` par :

```tsx
        return envelope.mutate({ id: action.envelopeId, monthlyExtra: action.monthlyExtra });
```

- [ ] **Step 8: Lancer les tests de la carte**

Run: `npx vitest run client/src/components/ask/ActionCard.test.tsx`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add shared/api-types.ts server/src/ask/actions.ts server/src/ask/prompt.ts server/src/ask/ask.ts server/test/ask-actions.test.ts client/src/components/ask/ActionCard.tsx client/src/components/ask/ActionCard.test.tsx
git commit -m "feat(ask): le budget voulu par Claude devient un complément, jamais sous les charges fixes"
```

---

### Task 5: Client - lecture du budget calculé

**Files:**
- Modify: `client/src/components/budget/EnvelopeRow.tsx:34`
- Modify: `client/src/components/budget/FundDialog.tsx:40,64-67`
- Modify: `client/src/components/budget/EnvelopeDetailDialog.tsx:62`
- Modify: `client/src/pages/Analyse.tsx:147`
- Modify: `client/src/pages/Home.tsx:260`
- Test: `client/src/components/budget/EnvelopeRow.test.tsx`, `client/src/components/budget/FundDialog.test.tsx`
- Modify (fixtures) : `client/src/components/recurring/RecurringRuleForm.test.tsx`, `client/src/components/transactions/TransactionRow.test.tsx`, `client/src/components/transactions/QuickEntry.test.tsx`, `client/src/components/envelopes/AllocationForm.test.tsx`, `client/src/components/sorting/SortingRuleDialog.test.tsx`, `client/src/components/import/ImportPreview.test.tsx`

**Interfaces:**
- Consumes: `EnvelopeWithBalance` avec `monthlyExtra`, `monthlyCharges`, `monthlyBudget` (tâche 2) ; `SpendingReport.byEnvelope[].monthlyBudget` (tâche 3).
- Produces: rien de nouveau ; l'affichage (« dépensé / budget », « Répartir », détail, Analyse, Accueil) lit `monthlyBudget`, 0 = sans budget.

- [ ] **Step 1: Écrire les tests qui échouent**

Dans `client/src/components/budget/EnvelopeRow.test.tsx`, remplacer `monthlyTarget: 400_00,` dans la fixture `courses` par :

```tsx
  // 250 € de charges fixes + 150 € de complément.
  monthlyExtra: 150_00,
  monthlyCharges: 250_00,
  monthlyBudget: 400_00,
```

et ajouter à la fin du `describe` :

```tsx
  it('sans budget, l’indique au lieu d’une jauge', () => {
    render(<EnvelopeRow envelope={{ ...courses, monthlyExtra: null, monthlyCharges: 0, monthlyBudget: 0 }} />);
    expect(screen.getByText('Sans budget')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
```

Dans `client/src/components/budget/FundDialog.test.tsx`, remplacer la constante `envelopes` par :

```tsx
const envelopes: EnvelopeWithBalance[] = [
  // Budget venu d'une charge fixe, sans complément.
  { ...base, id: 10, name: 'Courses', color: '#4f8a5b', monthlyExtra: null, monthlyCharges: 15000, monthlyBudget: 15000, sortOrder: 0, toFundThisMonth: 15000 },
  { ...base, id: 11, name: 'Restos', color: '#c2703d', monthlyExtra: null, monthlyCharges: 0, monthlyBudget: 0, sortOrder: 1, toFundThisMonth: 0 },
];
```

et ajouter à la fin du test existant :

```tsx
    expect(screen.getByText('il manque 150,00 € sur 150,00 €')).toBeInTheDocument();
    expect(screen.getByText('sans budget mensuel')).toBeInTheDocument();
```

Renommer le champ dans les fixtures `Envelope` des autres tests :

Run: `sed -i 's/monthlyTarget: null/monthlyExtra: null/g' client/src/components/recurring/RecurringRuleForm.test.tsx client/src/components/transactions/TransactionRow.test.tsx client/src/components/transactions/QuickEntry.test.tsx client/src/components/envelopes/AllocationForm.test.tsx client/src/components/sorting/SortingRuleDialog.test.tsx client/src/components/import/ImportPreview.test.tsx`

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run client/src/components/budget`
Expected: FAIL (`progressbar` introuvable dans `EnvelopeRow`, « il manque 150,00 € sur 150,00 € » introuvable dans `FundDialog`).

- [ ] **Step 3: Lire `monthlyBudget` partout**

Dans `client/src/components/budget/EnvelopeRow.tsx`, remplacer `const target = envelope.monthlyTarget;` par :

```tsx
  const target = envelope.monthlyBudget > 0 ? envelope.monthlyBudget : null;
```

Dans `client/src/components/budget/FundDialog.tsx`, remplacer la ligne `const ordered = ...` par :

```tsx
  const ordered = [...envelopes.filter((e) => e.monthlyBudget > 0), ...envelopes.filter((e) => e.monthlyBudget <= 0)];
```

et le contenu de `<span className={styles.hint}>` par :

```tsx
                  {env.monthlyBudget > 0
                    ? env.toFundThisMonth > 0
                      ? `il manque ${formatEuros(env.toFundThisMonth)} sur ${formatEuros(env.monthlyBudget)}`
                      : `budget de ${formatEuros(env.monthlyBudget)} atteint`
                    : 'sans budget mensuel'}
```

Dans `client/src/components/budget/EnvelopeDetailDialog.tsx`, remplacer `const budget = envelope.monthlyTarget ? envelope.monthlyTarget * months : null;` par :

```tsx
  const budget = envelope.monthlyBudget > 0 ? envelope.monthlyBudget * months : null;
```

Dans `client/src/pages/Analyse.tsx`, remplacer `const target = months && e.monthlyTarget ? e.monthlyTarget * months : null;` par :

```tsx
          const target = months && e.monthlyBudget > 0 ? e.monthlyBudget * months : null;
```

Dans `client/src/pages/Home.tsx`, remplacer la ligne `const tension = ...` par :

```tsx
  const tension = (e: (typeof spending)[number]) => (e.monthlyBudget > 0 ? e.spentThisMonth / e.monthlyBudget : e.spentThisMonth > 0 ? 0.5 : -1);
```

- [ ] **Step 4: Lancer les tests client concernés**

Run: `npx vitest run client/src/components/budget client/src/components/recurring client/src/components/transactions client/src/components/envelopes client/src/components/sorting client/src/components/import`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/budget/EnvelopeRow.tsx client/src/components/budget/EnvelopeRow.test.tsx client/src/components/budget/FundDialog.tsx client/src/components/budget/FundDialog.test.tsx client/src/components/budget/EnvelopeDetailDialog.tsx client/src/pages/Analyse.tsx client/src/pages/Home.tsx client/src/components/recurring/RecurringRuleForm.test.tsx client/src/components/transactions/TransactionRow.test.tsx client/src/components/transactions/QuickEntry.test.tsx client/src/components/envelopes/AllocationForm.test.tsx client/src/components/sorting/SortingRuleDialog.test.tsx client/src/components/import/ImportPreview.test.tsx
git commit -m "feat(client): enveloppes, Répartir, détail, Analyse et Accueil lisent le budget calculé"
```

---

### Task 6: Client - formulaire d'enveloppe « En plus des charges »

**Files:**
- Modify: `client/src/components/recurring/frequency.ts`
- Create: `client/src/components/recurring/frequency.test.ts`
- Modify: `client/src/components/envelopes/EnvelopeFormDialog.tsx`
- Modify: `client/src/components/envelopes/EnvelopeFormDialog.module.css`
- Create: `client/src/components/envelopes/EnvelopeFormDialog.test.tsx`

**Interfaces:**
- Consumes: `isEnvelopeCharge(rule, today)` de `@core/budget` (tâche 2) ; `useRecurringRules()` et `RecurringRuleView = RecurringRule & { nextDate: string | null; monthlyEquivalent: number }` de `@/api/hooks` ; `EnvelopeInput.monthlyExtra` (tâche 1).
- Produces:
  - `describeRhythm(rule: { frequency: Frequency; interval: number }): string | null` dans `client/src/components/recurring/frequency.ts` (« tous les 3 mois », « par an » ; null pour une mensuelle).
  - `EnvelopeFormDialog` : champ « En plus des charges » qui enregistre `monthlyExtra`, liste `aria-label="Charges de l’enveloppe"` sous le champ quand l'enveloppe a des charges.

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `client/src/components/recurring/frequency.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { describeRhythm } from './frequency';

describe('describeRhythm', () => {
  it('donne le rythme d’une charge non mensuelle, rien pour une mensuelle', () => {
    expect(describeRhythm({ frequency: 'monthly', interval: 1 })).toBeNull();
    expect(describeRhythm({ frequency: 'monthly', interval: 3 })).toBe('tous les 3 mois');
    expect(describeRhythm({ frequency: 'yearly', interval: 1 })).toBe('par an');
    expect(describeRhythm({ frequency: 'yearly', interval: 2 })).toBe('tous les 2 ans');
    expect(describeRhythm({ frequency: 'weekly', interval: 1 })).toBe('par semaine');
    expect(describeRhythm({ frequency: 'weekly', interval: 2 })).toBe('toutes les 2 semaines');
    expect(describeRhythm({ frequency: 'daily', interval: 1 })).toBe('par jour');
    expect(describeRhythm({ frequency: 'daily', interval: 3 })).toBe('tous les 3 jours');
  });
});
```

Créer `client/src/components/envelopes/EnvelopeFormDialog.test.tsx` :

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Envelope } from '@shared/schemas';
import type { RecurringRuleView } from '@/api/hooks';
import { ToastProvider } from '@/components/ui';
import { EnvelopeFormDialog } from './EnvelopeFormDialog';

const transports: Envelope = { id: 5, name: 'Transports', color: '#3f6fae', monthlyExtra: 90_00, sortOrder: 0, archived: false, isSavings: false };

const charge: Omit<RecurringRuleView, 'id' | 'name' | 'amount' | 'monthlyEquivalent'> = {
  kind: 'expense',
  label: 'PRLV',
  accountId: 1,
  toAccountId: null,
  envelopeId: 5,
  fromEnvelopeId: null,
  frequency: 'monthly',
  interval: 1,
  dayOfMonth: 5,
  startDate: '2026-01-05',
  endDate: null,
  lastGeneratedDate: null,
  active: true,
  triggersFunding: false,
  fundsNextMonth: false,
  nextDate: null,
};

const rules: RecurringRuleView[] = [
  { ...charge, id: 1, name: 'Navigo', amount: 40_00, monthlyEquivalent: 40_00 },
  { ...charge, id: 2, name: 'Cotisation compte LBP', amount: 10_80, interval: 3, monthlyEquivalent: 3_60 },
  // Ignorées : en pause, terminée, autre enveloppe, revenu.
  { ...charge, id: 3, name: 'Vélib', amount: 3_10, active: false, monthlyEquivalent: 3_10 },
  { ...charge, id: 4, name: 'Ancien forfait', amount: 20_00, endDate: '2020-01-31', monthlyEquivalent: 20_00 },
  { ...charge, id: 5, name: 'Loyer', amount: 986_00, envelopeId: 6, monthlyEquivalent: 986_00 },
  { ...charge, id: 6, name: 'Remboursement', kind: 'income', amount: 15_00, monthlyEquivalent: 15_00 },
];

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === '/api/recurring-rules') return new Response(JSON.stringify(rules), { status: 200 });
    return new Response(JSON.stringify({ ...transports, ...JSON.parse(String(init?.body ?? '{}')) }), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function renderForm(envelope?: Envelope) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <EnvelopeFormDialog open envelope={envelope} onClose={vi.fn()} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const chargeLines = async () => {
  const list = await screen.findByRole('list', { name: 'Charges de l’enveloppe', hidden: true });
  return within(list).getAllByRole('listitem', { hidden: true });
};

describe('EnvelopeFormDialog', () => {
  it('détaille les charges sous le complément, avec le rythme des charges non mensuelles', async () => {
    renderForm(transports);
    expect((await chargeLines()).map((li) => li.textContent)).toEqual([
      'Navigo 40,00 €',
      'Cotisation compte LBP 3,60 € (10,80 € tous les 3 mois)',
      '+ 90,00 € = 133,60 € par mois',
    ]);
    expect(screen.getByLabelText('En plus des charges')).toHaveValue('90,00');
    expect(screen.queryByText(/Ce que tu prévois d’y mettre chaque mois/)).not.toBeInTheDocument();
  });

  it('met le total à jour pendant la frappe et enregistre le complément', async () => {
    renderForm(transports);
    await chargeLines();
    const input = screen.getByLabelText('En plus des charges');
    await userEvent.clear(input);
    await userEvent.type(input, '100');
    expect((await chargeLines()).at(-1)).toHaveTextContent('+ 100,00 € = 143,60 € par mois');

    await userEvent.click(await screen.findByRole('button', { name: 'Enregistrer', hidden: true }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/envelopes/5', expect.objectContaining({ method: 'PATCH' })));
    const [, init] = fetchMock.mock.calls.find(([url]) => url === '/api/envelopes/5')!;
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ name: 'Transports', color: '#3f6fae', monthlyExtra: 100_00, isSavings: false });
  });

  it('sans complément, le total est celui des charges', async () => {
    renderForm({ ...transports, monthlyExtra: null });
    expect((await chargeLines()).at(-1)).toHaveTextContent('= 43,60 € par mois');
    expect((await chargeLines()).at(-1)).not.toHaveTextContent('+');
  });

  it('sans charge, garde l’aide simple', async () => {
    renderForm({ ...transports, id: 7 });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/recurring-rules', expect.anything()));
    expect(screen.getByText(/Ce que tu prévois d’y mettre chaque mois/)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Charges de l’enveloppe', hidden: true })).not.toBeInTheDocument();
  });

  it('une nouvelle enveloppe n’a pas encore de charges', () => {
    renderForm();
    expect(screen.getByLabelText('En plus des charges')).toHaveValue('');
    expect(screen.getByText(/Ce que tu prévois d’y mettre chaque mois/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run client/src/components/recurring/frequency.test.ts client/src/components/envelopes/EnvelopeFormDialog.test.tsx`
Expected: FAIL (`describeRhythm` absent, champ « En plus des charges » introuvable).

- [ ] **Step 3: Ajouter `describeRhythm`**

À la fin de `client/src/components/recurring/frequency.ts`, ajouter :

```ts
/** Rythme d'une charge pour expliquer son montant ramené au mois : « tous les 3 mois », « par an » ; null si mensuelle. */
export function describeRhythm(rule: Pick<Schedule, 'frequency' | 'interval'>): string | null {
  const n = Math.max(1, rule.interval);
  switch (rule.frequency) {
    case 'daily':
      return n === 1 ? 'par jour' : `tous les ${n} jours`;
    case 'weekly':
      return n === 1 ? 'par semaine' : `toutes les ${n} semaines`;
    case 'monthly':
      return n === 1 ? null : `tous les ${n} mois`;
    case 'yearly':
      return n === 1 ? 'par an' : `tous les ${n} ans`;
  }
}
```

- [ ] **Step 4: Réécrire le formulaire d'enveloppe**

Dans `client/src/components/envelopes/EnvelopeFormDialog.tsx`, remplacer les imports par :

```tsx
import { useId, useState } from 'react';
import { isEnvelopeCharge } from '@core/budget';
import { today } from '@shared/dates';
import { formatEuros } from '@shared/money';
import { envelopeInputSchema, type Envelope } from '@shared/schemas';
import { errorMessage } from '@/api/client';
import { useCreateEnvelope, useRecurringRules, useUpdateEnvelope, type RecurringRuleView } from '@/api/hooks';
import { describeRhythm } from '@/components/recurring/frequency';
import { Button, Checkbox, Dialog, DialogFooter, Field, Input, MoneyInput, useToast } from '@/components/ui';
import styles from './EnvelopeFormDialog.module.css';
```

Remplacer `type FormState = ...` par :

```tsx
type FormState = { name: string; color: string; monthlyExtra: number | null; isSavings: boolean };
```

Dans l'état initial, remplacer `monthlyTarget: envelope?.monthlyTarget ?? null,` par `monthlyExtra: envelope?.monthlyExtra ?? null,`.
Juste après la déclaration de `formId`, ajouter :

```tsx
  const chargesId = useId();
  const rules = useRecurringRules();
  const now = today();
  // Une nouvelle enveloppe n'a pas encore de charges.
  const charges = envelope ? (rules.data ?? []).filter((r) => r.envelopeId === envelope.id && isEnvelopeCharge(r, now)) : [];
```

Dans `submit`, remplacer `monthlyTarget: form.monthlyTarget` par `monthlyExtra: form.monthlyExtra`.

Remplacer le `<Field label="Budget mensuel" ...>...</Field>` par :

```tsx
        <Field
          label="En plus des charges"
          hint={charges.length > 0 ? undefined : 'Ce que tu prévois d’y mettre chaque mois. « Répartir » le propose automatiquement et la prévision en tient compte.'}
          error={errors.monthlyExtra}
        >
          {(id, describedBy) => (
            <MoneyInput
              id={id}
              aria-describedby={[describedBy, charges.length > 0 ? chargesId : null].filter(Boolean).join(' ') || undefined}
              value={form.monthlyExtra}
              onChange={(c) => set('monthlyExtra', c)}
              placeholder="Facultatif"
            />
          )}
        </Field>
        {charges.length > 0 ? <ChargesBreakdown id={chargesId} charges={charges} extra={form.monthlyExtra} /> : null}
```

Ajouter à la fin du fichier :

```tsx
/** Budget de l'enveloppe : chaque charge ramenée au mois, puis le complément et le total. */
function ChargesBreakdown({ id, charges, extra }: { id: string; charges: RecurringRuleView[]; extra: number | null }) {
  const total = charges.reduce((s, r) => s + r.monthlyEquivalent, 0) + (extra ?? 0);
  return (
    <ul id={id} className={styles.charges} aria-label="Charges de l’enveloppe">
      {charges.map((r) => {
        const rhythm = describeRhythm(r);
        return (
          <li key={r.id}>
            <span>{r.name}</span> <span className="num">{formatEuros(r.monthlyEquivalent)}</span>
            {rhythm ? <span> ({formatEuros(r.amount)} {rhythm})</span> : null}
          </li>
        );
      })}
      <li className={styles.total}>
        {extra ? `+ ${formatEuros(extra)} ` : ''}= <strong className="num">{formatEuros(total)}</strong> par mois
      </li>
    </ul>
  );
}
```

Ajouter à la fin de `client/src/components/envelopes/EnvelopeFormDialog.module.css` :

```css
/* Détail du budget, collé sous le champ du complément : une ligne par charge, puis le total. */
.charges {
  list-style: none;
  margin: calc(-1 * var(--s-3)) 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: var(--text-xs);
  color: var(--ink-mute);
}

.total {
  padding-top: 2px;
  color: var(--ink);
}
```

- [ ] **Step 5: Lancer les tests**

Run: `npx vitest run client/src/components/recurring/frequency.test.ts client/src/components/envelopes/EnvelopeFormDialog.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 6: Vérifier le rendu dans l'application**

Lancer `npm run dev` avec `~/.local/bin` dans le `PATH`, sur une copie de la base (`RUNWAY_DB=tmp/recette.db`, copie de `data/runway.db`), jamais sur la vraie base.
Sur Budget, ouvrir « Modifier » d'une enveloppe qui porte une charge (Transports) puis d'une sans charge, en clair et en sombre, sur ordinateur et en largeur mobile.
Attendu : la liste des charges est collée sous le champ, alignée avec l'aide des autres champs, le total se met à jour pendant la frappe, et la ligne d'enveloppe affiche « dépensé / budget » avec le budget calculé.
Corriger tout décalage visible avant de commiter.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/recurring/frequency.ts client/src/components/recurring/frequency.test.ts client/src/components/envelopes/EnvelopeFormDialog.tsx client/src/components/envelopes/EnvelopeFormDialog.module.css client/src/components/envelopes/EnvelopeFormDialog.test.tsx
git commit -m "feat(client): formulaire d'enveloppe « En plus des charges » avec le détail des charges"
```

---

### Task 7: Vérification complète

**Files:**
- Aucun nouveau fichier ; corrections éventuelles là où une commande échoue.

**Interfaces:**
- Consumes: tout ce qui précède.
- Produces: branche au vert.

- [ ] **Step 1: Plus aucune trace de l'ancien champ hors Demander et migrations**

Run: `grep -rn "monthlyTarget\|monthly_target" core server/src server/test shared client/src`
Expected : uniquement
- `shared/schemas.ts` (`askActionSchema`, action `budget`) ;
- `shared/api-types.ts` (`AskActionView`) ;
- `server/src/ask/actions.ts` et `server/src/ask/prompt.ts` (schéma JSON et texte de l'action `budget`) ;
- `server/test/ask.test.ts`, `server/test/ask-actions.test.ts`, `client/src/components/ask/ActionCard.tsx`, `client/src/components/ask/ActionCard.test.tsx` ;
- `server/src/db/migrations/0000_init.sql`, `0004_drop_allocation_rules.sql`, `0009_envelope_monthly_extra.sql` et les instantanés `meta/0000` à `meta/0008`.

Toute autre occurrence est un oubli à corriger.

- [ ] **Step 2: Tests**

Run: `npm test`
Expected: tous les tests passent.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: aucune erreur, sauf l'erreur préexistante et sans rapport de `client/src/components/invest/HoldingList.test.tsx` (`series`), à ignorer.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: aucune erreur ni avertissement.

- [ ] **Step 5: Migration sur une copie de la vraie base**

Run: `mkdir -p tmp && cp data/runway.db tmp/migration-0009.db && RUNWAY_DB=tmp/migration-0009.db npx tsx -e "import Database from 'better-sqlite3'; import { openDb } from './server/src/db/client'; const path = process.env.RUNWAY_DB as string; openDb(path); console.log(new Database(path).prepare('SELECT name, monthly_extra FROM envelopes ORDER BY sort_order').all())"`
Expected : Logement et Prêt étudiant à `null`, Transports à `9000`, Santé et assurances à `205` (les exemples de la spec), sans erreur.
La vraie base vit dans `~/projects/runway/data/runway.db` : si `data/runway.db` n'existe pas dans le worktree, copier celle-là, et ne jamais lancer la migration sur l'original.
Supprimer `tmp/migration-0009.db` après vérification.

- [ ] **Step 6: Commit des corrections éventuelles**

S'il a fallu corriger quelque chose :

```bash
git add <fichiers corrigés>
git commit -m "fix: corrections de la vérification du budget par charges"
```
