# Répartition automatique du salaire - plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** quand l'occurrence prévue d'un revenu récurrent marqué « Déclenche la répartition » est confirmée, compléter automatiquement les enveloppes jusqu'à leur budget du mois, avec un bandeau pour annuler.

**Architecture:** une fonction pure `planAutoFunding` dans `core/budget.ts` décide des montants.
Le service serveur `autoFund` l'appelle après la confirmation d'une opération prévue (import, synchro bancaire, bouton « Confirmer »), dans la même transaction SQLite, et trace la répartition dans une table `fundings`.
La vue d'ensemble expose la dernière répartition, que le client affiche dans un bandeau sur Accueil et Budget.

**Tech Stack:** TypeScript, Hono, Drizzle (better-sqlite3), zod 4, React 19, TanStack Query, Vitest, Testing Library.

Spec : `docs/superpowers/specs/2026-10-08-repartition-salaire-design.md`.

## Global Constraints

- Ne jamais écrire dans `/tmp` ; fichiers temporaires dans `tmp/` du projet.
- Jamais de tiret cadratin dans le code, les textes ou les commits.
- Textes d'interface en français, apostrophe typographique `’` comme le reste de l'interface.
- Montants en centimes (`Cents`), toujours positifs dans `transactions.amount`.
- Libellé des allocations : `Budget ${formatMonth(monthKey(date))}`, identique à « Répartir ».
- Fixtures de test synthétiques uniquement, jamais tirées d'un vrai relevé.
- Toutes les commandes se lancent depuis la racine du worktree `~/projects/runway-repartition-salaire`.
- `npm run typecheck`, `npm run lint` et `npm test` au vert à la fin de chaque tâche.

## Fichiers

| Fichier | Rôle |
|---|---|
| `shared/schemas.ts` | champs `triggersFunding`, `fundsNextMonth` des règles ; `fundingId` des opérations ; schéma `Funding` |
| `shared/api-types.ts` | `FundingView`, `Overview.latestFunding` |
| `server/src/db/schema.ts` + migration `0006` | colonnes et table `fundings` |
| `server/src/repos/fundings.ts` (nouveau) | accès à `fundings`, vue du bandeau, annulation |
| `server/src/repos/transactions.ts`, `recurring-rules.ts` | nouveaux champs |
| `core/budget.ts` | `planAutoFunding` |
| `core/forecast.ts` | budget des mois futurs net des allocations déjà datées |
| `server/src/services/auto-funding.ts` (nouveau) | `autoFund` |
| `server/src/services/import.ts`, `routes/transactions.ts` | appels à `autoFund` |
| `server/src/routes/fundings.ts` (nouveau) | annuler, fermer |
| `server/src/services/overview.ts`, `export.ts` | `latestFunding`, export de `fundings` |
| `client/src/components/recurring/RecurringRuleForm.tsx` | deux cases |
| `client/src/components/budget/FundingBanner.tsx` (nouveau) | bandeau |
| `client/src/pages/Home.tsx`, `Budget.tsx`, `client/src/api/hooks.ts` | intégration |

---

### Task 1 : modèle de données (schémas, migration, repos)

**Files:**
- Modify: `shared/schemas.ts`, `server/src/db/schema.ts`, `server/src/repos/transactions.ts`, `server/src/repos/recurring-rules.ts`, `core/test-fixtures.ts`
- Create: `server/src/db/migrations/0006_auto_funding.sql` (généré), `server/src/repos/fundings.ts`
- Test: `server/test/routes.test.ts`, `server/test/repos.test.ts`

**Interfaces:**
- Produces : `RecurringRule.triggersFunding: boolean`, `RecurringRule.fundsNextMonth: boolean`, `Transaction.fundingId: number | null`, `TransactionInsert.fundingId?: number | null`, type `Funding`, table `fundings`.
- Produces (`repos/fundings.ts`) : `createFunding(db, { sourceTransactionId, month, shortfallCount }): Funding`, `findFundingBySource(db, transactionId): Funding | undefined`, `getFunding(db, id): Funding`.

- [ ] **Step 1 : tests qui échouent**

Dans `server/test/routes.test.ts`, bloc `describe('recurring rules')` (le créer s'il n'existe pas) :

```ts
const salaire = (over: Record<string, unknown> = {}) => ({
  name: 'Salaire', kind: 'income', amount: 2000_00, label: 'VIR SALAIRE', accountId: t.courant.id,
  frequency: 'monthly', dayOfMonth: 28, startDate: '2026-03-01', ...over,
});

it('mémorise le déclenchement de la répartition sur un revenu', async () => {
  const r = await t.call('POST', '/api/recurring-rules', salaire({ triggersFunding: true, fundsNextMonth: true }));
  expect(r.status).toBe(201);
  expect(r.body).toMatchObject({ triggersFunding: true, fundsNextMonth: true });
  const plain = await t.call('POST', '/api/recurring-rules', salaire({ name: 'Prime' }));
  expect(plain.body).toMatchObject({ triggersFunding: false, fundsNextMonth: false });
});

it('refuse le déclenchement hors revenu ou le mois suivant sans déclenchement', async () => {
  const expense = await t.call('POST', '/api/recurring-rules', salaire({ kind: 'expense', triggersFunding: true }));
  expect(expense.status).toBe(400);
  const orphan = await t.call('POST', '/api/recurring-rules', salaire({ fundsNextMonth: true }));
  expect(orphan.status).toBe(400);
});
```

Dans `server/test/repos.test.ts` :

```ts
import { createFunding, findFundingBySource } from '../src/repos/fundings';
import { createTransaction, deleteTransaction, getTransaction } from '../src/repos/transactions';

it('fundings : unicité par salaire et cascade à la suppression du salaire', () => {
  const { db, courant, courses } = createTestDb();
  const salary = createTransaction(db, { kind: 'income', date: '2026-03-28', amount: 2000_00, label: 'Salaire', accountId: courant.id });
  const funding = createFunding(db, { sourceTransactionId: salary.id, month: '2026-04', shortfallCount: 0 });
  const alloc = createTransaction(db, { kind: 'allocation', date: '2026-04-01', amount: 300_00, label: 'Budget avril 2026', envelopeId: courses.id, fundingId: funding.id });
  expect(findFundingBySource(db, salary.id)?.id).toBe(funding.id);
  expect(() => createFunding(db, { sourceTransactionId: salary.id, month: '2026-04', shortfallCount: 0 })).toThrow();
  deleteTransaction(db, salary.id);
  expect(findFundingBySource(db, salary.id)).toBeUndefined();
  expect(() => getTransaction(db, alloc.id)).toThrow('Opération introuvable');
});
```

- [ ] **Step 2 : vérifier l'échec**

Run : `npx vitest run server/test/routes.test.ts server/test/repos.test.ts`
Attendu : FAIL (champs inconnus, module `fundings` introuvable).

- [ ] **Step 3 : schémas partagés** (`shared/schemas.ts`)

Dans `recurringRuleSchema`, ajouter :

```ts
  triggersFunding: z.boolean(),
  fundsNextMonth: z.boolean(),
```

Dans `recurringRuleInputSchema`, ajouter aux champs puis au `superRefine` :

```ts
    triggersFunding: z.boolean().default(false),
    fundsNextMonth: z.boolean().default(false),
```

```ts
    if (rule.triggersFunding && rule.kind !== 'income') {
      ctx.addIssue({ code: 'custom', message: 'Seul un revenu peut déclencher la répartition', path: ['triggersFunding'] });
    }
    if (rule.fundsNextMonth && !rule.triggersFunding) {
      ctx.addIssue({ code: 'custom', message: 'Le mois suivant ne vaut que pour un revenu qui déclenche la répartition', path: ['fundsNextMonth'] });
    }
```

Dans `transactionSchema`, ajouter `fundingId: idSchema.nullable(),`.
Ajouter à la suite des schémas d'opérations :

```ts
export const fundingStatuses = ['applied', 'undone'] as const;

/** Répartition automatique déclenchée par un revenu confirmé. */
export const fundingSchema = z.object({
  id: idSchema,
  sourceTransactionId: idSchema,
  month: z.string(),
  status: z.enum(fundingStatuses),
  shortfallCount: z.number().int().nonnegative(),
  dismissedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Funding = z.infer<typeof fundingSchema>;
```

- [ ] **Step 4 : schéma Drizzle** (`server/src/db/schema.ts`)

Importer `type AnySQLiteColumn` depuis `drizzle-orm/sqlite-core` et `fundingStatuses` depuis `@shared/schemas`.
Dans `recurringRules` :

```ts
  /** Revenu dont la confirmation remplit les enveloppes jusqu'à leur budget. */
  triggersFunding: integer('triggers_funding', { mode: 'boolean' }).notNull().default(false),
  /** Versé en fin de mois pour vivre le mois suivant : finance le budget du mois d'après. */
  fundsNextMonth: integer('funds_next_month', { mode: 'boolean' }).notNull().default(false),
```

Dans `transactions`, après `fingerprint` :

```ts
    fundingId: integer('funding_id').references((): AnySQLiteColumn => fundings.id, { onDelete: 'cascade' }),
```

Après la table `transactions` :

```ts
export const fundings = sqliteTable('fundings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sourceTransactionId: integer('source_transaction_id')
    .notNull()
    .unique()
    .references((): AnySQLiteColumn => transactions.id, { onDelete: 'cascade' }),
  /** Mois financé, `YYYY-MM`. */
  month: text('month').notNull(),
  status: text('status', { enum: fundingStatuses }).notNull().default('applied'),
  shortfallCount: integer('shortfall_count').notNull().default(0),
  dismissedAt: text('dismissed_at'),
  createdAt: text('created_at').notNull().default(now),
});
```

- [ ] **Step 5 : migration**

Run : `npm run db:generate -- --name auto_funding`
Attendu : `server/src/db/migrations/0006_auto_funding.sql` créé.
Relire le SQL : il doit ajouter les deux colonnes de `recurring_rules`, la colonne `funding_id` (directement ou par reconstruction de `transactions` avec `PRAGMA foreign_keys=OFF`), et créer `fundings` avec l'index unique.
Si la reconstruction de `transactions` perd un index (`transactions_fingerprint_idx`, etc.), corriger le SQL à la main.

- [ ] **Step 6 : repos**

`server/src/repos/recurring-rules.ts`, dans `toRow` :

```ts
    triggersFunding: input.triggersFunding,
    fundsNextMonth: input.fundsNextMonth,
```

`server/src/repos/transactions.ts` : ajouter `fundingId?: number | null;` à `TransactionInsert` et `fundingId: input.fundingId ?? null,` dans `toRow`.

Créer `server/src/repos/fundings.ts` :

```ts
import { eq } from 'drizzle-orm';
import type { Funding } from '@shared/schemas';
import type { Db } from '../db/client';
import { fundings } from '../db/schema';
import { NotFoundError } from '../errors';

export function createFunding(db: Db, input: { sourceTransactionId: number; month: string; shortfallCount: number }): Funding {
  return db.insert(fundings).values(input).returning().get();
}

export function findFundingBySource(db: Db, transactionId: number): Funding | undefined {
  return db.select().from(fundings).where(eq(fundings.sourceTransactionId, transactionId)).get();
}

export function getFunding(db: Db, id: number): Funding {
  const row = db.select().from(fundings).where(eq(fundings.id, id)).get();
  if (!row) throw new NotFoundError('Répartition introuvable');
  return row;
}

export function listFundings(db: Db): Funding[] {
  return db.select().from(fundings).all();
}
```

- [ ] **Step 7 : fixtures**

`core/test-fixtures.ts` : ajouter `fundingId: null,` dans `tx()` et `triggersFunding: false, fundsNextMonth: false,` dans `rule()`.

- [ ] **Step 8 : vérifier**

Run : `npx vitest run server/test/routes.test.ts server/test/repos.test.ts && npm run typecheck`
Attendu : PASS.
Corriger les erreurs de type qui apparaissent ailleurs (objets `Transaction` ou `RecurringRule` construits à la main dans des tests client) en ajoutant les nouveaux champs.

- [ ] **Step 9 : commit**

```bash
git add -A && git commit -m "feat(server): modèle de la répartition automatique (règles déclencheuses, table fundings)"
```

---

### Task 2 : `planAutoFunding` (cœur pur)

**Files:**
- Modify: `core/budget.ts`
- Test: `core/budget.test.ts`

**Interfaces:**
- Produces : `export type FundingPlan = { items: { envelopeId: number; amount: number }[]; shortfallCount: number }` et `planAutoFunding(envelopes: Envelope[], allocated: Map<number, number>, available: number): FundingPlan`.

- [ ] **Step 1 : tests qui échouent** (`core/budget.test.ts`, importer `planAutoFunding`)

```ts
describe('planAutoFunding', () => {
  beforeEach(resetIds);

  it('complète chaque enveloppe jusqu’à son budget, le surplus reste', () => {
    const courses = envelope({ name: 'Courses', monthlyTarget: 300_00, sortOrder: 0 });
    const loisirs = envelope({ name: 'Loisirs', monthlyTarget: 100_00, sortOrder: 1 });
    const plan = planAutoFunding([courses, loisirs], new Map([[courses.id, 50_00]]), 2000_00);
    expect(plan).toEqual({ items: [{ envelopeId: courses.id, amount: 250_00 }, { envelopeId: loisirs.id, amount: 100_00 }], shortfallCount: 0 });
  });

  it('en cas de manque, suit l’ordre de la page Budget et compte les incomplètes', () => {
    const a = envelope({ name: 'A', monthlyTarget: 100_00, sortOrder: 2 });
    const b = envelope({ name: 'B', monthlyTarget: 100_00, sortOrder: 0 });
    const c = envelope({ name: 'C', monthlyTarget: 100_00, sortOrder: 1 });
    const plan = planAutoFunding([a, b, c], new Map(), 150_00);
    expect(plan).toEqual({ items: [{ envelopeId: b.id, amount: 100_00 }, { envelopeId: c.id, amount: 50_00 }], shortfallCount: 2 });
  });

  it('ignore les enveloppes archivées, sans budget ou déjà complètes', () => {
    const archived = envelope({ name: 'Vieux', monthlyTarget: 100_00, archived: true });
    const free = envelope({ name: 'Libre', monthlyTarget: null });
    const full = envelope({ name: 'Pleine', monthlyTarget: 100_00 });
    expect(planAutoFunding([archived, free, full], new Map([[full.id, 100_00]]), 1000_00)).toEqual({ items: [], shortfallCount: 0 });
  });

  it('sans argent disponible, ne crée rien et signale les manques', () => {
    const courses = envelope({ name: 'Courses', monthlyTarget: 300_00 });
    expect(planAutoFunding([courses], new Map(), 0)).toEqual({ items: [], shortfallCount: 1 });
    expect(planAutoFunding([courses], new Map(), -50_00)).toEqual({ items: [], shortfallCount: 1 });
  });
});
```

- [ ] **Step 2 : vérifier l'échec**

Run : `npx vitest run core/budget.test.ts`
Attendu : FAIL, `planAutoFunding` non exporté.

- [ ] **Step 3 : implémentation** (`core/budget.ts`, après `remainingToFund`)

```ts
export type FundingPlan = { items: { envelopeId: number; amount: number }[]; shortfallCount: number };

/**
 * Répartition automatique : chaque enveloppe active qui a un budget reçoit ce qui lui manque pour le mois,
 * dans l'ordre de la page Budget, tant qu'il reste de l'argent. Le surplus reste à répartir.
 */
export function planAutoFunding(envelopes: Envelope[], allocated: Map<number, number>, available: number): FundingPlan {
  const ordered = envelopes.filter((e) => !e.archived && e.monthlyTarget).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
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

- [ ] **Step 4 : vérifier**

Run : `npx vitest run core/budget.test.ts`
Attendu : PASS.

- [ ] **Step 5 : commit**

```bash
git add core/budget.ts core/budget.test.ts && git commit -m "feat(core): plan de répartition automatique par ordre des enveloppes"
```

---

### Task 3 : prévision sans double comptage

**Files:**
- Modify: `core/forecast.ts` (`budgetEvents`)
- Test: `core/forecast.test.ts`

**Interfaces:**
- Consumes : `monthActivity`, `remainingToFund` de `core/budget.ts`.

- [ ] **Step 1 : test qui échoue** (`core/forecast.test.ts`, suivre les imports existants du fichier)

```ts
it('un mois futur déjà réparti ne prévoit que le reste de son budget', () => {
  const courant = account({ name: 'Courant', initialBalance: 3000_00 });
  const courses = envelope({ name: 'Courses', monthlyTarget: 300_00 });
  const state = {
    accounts: [courant],
    envelopes: [courses],
    transactions: [tx({ kind: 'allocation', amount: 200_00, envelopeId: courses.id, date: '2026-10-01', label: 'Budget octobre 2026' })],
  };
  const events = projectEvents(state, [], '2026-09-28', '2026-11-15').filter((e) => e.source === 'budget');
  expect(events.map((e) => [e.date, e.amount])).toEqual([
    ['2026-09-28', 300_00],
    ['2026-10-01', 100_00],
    ['2026-11-01', 300_00],
  ]);
});
```

Avant d'écrire le test, lire le haut de `core/forecast.ts` pour reprendre le nom exact de la fonction exportée qui renvoie les événements (celle qui contient `events.push(...budgetEvents(state, today, end))`) et sa signature, et adapter l'appel `projectEvents(...)` en conséquence.

- [ ] **Step 2 : vérifier l'échec**

Run : `npx vitest run core/forecast.test.ts`
Attendu : FAIL, le 1er octobre vaut 300_00 au lieu de 100_00.

- [ ] **Step 3 : implémentation** : remplacer la boucle de `budgetEvents`

```ts
  // Allocations déjà datées de chaque mois futur (salaire de fin de mois réparti d'avance, par exemple).
  const futureMonths: { month: ISODate; allocated: Map<number, number> }[] = [];
  for (let month = addMonths(startOfMonth(today), 1); month <= end; month = addMonths(month, 1)) {
    futureMonths.push({ month, allocated: monthActivity(state.transactions, month).allocated });
  }
  for (const env of state.envelopes) {
    if (env.archived || !env.monthlyTarget) continue;
    const label = `Budget ${env.name}`;
    const rest = remainingToFund(env, allocated.get(env.id) ?? 0);
    if (rest > 0) events.push(event(today, env.id, label, rest));
    for (const { month, allocated: already } of futureMonths) {
      const amount = remainingToFund(env, already.get(env.id) ?? 0);
      if (amount > 0) events.push(event(month, env.id, label, amount));
    }
  }
```

- [ ] **Step 4 : vérifier**

Run : `npx vitest run core/`
Attendu : PASS, y compris les tests de prévision existants.

- [ ] **Step 5 : commit**

```bash
git add core/forecast.ts core/forecast.test.ts && git commit -m "fix(core): la prévision ne recompte pas un budget futur déjà réparti"
```

---

### Task 4 : service `autoFund` et déclenchement

**Files:**
- Create: `server/src/services/auto-funding.ts`
- Modify: `server/src/services/import.ts` (`commitImport`), `server/src/routes/transactions.ts` (`/:id/confirm`)
- Test: `server/test/auto-funding.test.ts`

**Interfaces:**
- Consumes : `planAutoFunding` (Task 2), `createFunding`, `findFundingBySource` (Task 1).
- Produces : `autoFund(db: Db, transactionId: number): Funding | null`.

- [ ] **Step 1 : tests qui échouent** (`server/test/auto-funding.test.ts`)

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { updateEnvelope } from '../src/repos/envelopes';
import { createTestApp, type TestApp } from './helpers';

const fixture = readFileSync(fileURLToPath(new URL('./fixtures/lbp.csv', import.meta.url)));

let t: TestApp;
beforeEach(() => {
  t = createTestApp('2026-03-12');
  updateEnvelope(t.db, t.courses.id, { monthlyTarget: 300_00 });
  updateEnvelope(t.db, t.loisirs.id, { monthlyTarget: 100_00 });
});

const salaire = (over: Record<string, unknown> = {}) => ({
  name: 'Salaire', kind: 'income', amount: 2000_00, label: 'Salaire', accountId: t.courant.id,
  frequency: 'monthly', dayOfMonth: 10, startDate: '2026-03-01', triggersFunding: true, ...over,
});

async function plannedSalary() {
  const planned = await t.call('GET', '/api/transactions?status=planned');
  return planned.body.find((p: any) => p.kind === 'income');
}

const allocations = async () => (await t.call('GET', '/api/transactions?kind=allocation')).body;

describe('répartition automatique', () => {
  it('confirmer le salaire complète les enveloppes et l’annonce dans la vue d’ensemble', async () => {
    await t.call('POST', '/api/recurring-rules', salaire());
    const salary = await plannedSalary();
    await t.call('POST', `/api/transactions/${salary.id}/confirm`);
    const allocs = await allocations();
    expect(allocs.map((a: any) => [a.envelopeId, a.amount, a.date, a.label]).sort()).toEqual(
      [[t.courses.id, 300_00, '2026-03-10', 'Budget mars 2026'], [t.loisirs.id, 100_00, '2026-03-10', 'Budget mars 2026']].sort(),
    );
    const overview = await t.call('GET', '/api/overview');
    expect(overview.body.latestFunding).toMatchObject({ month: '2026-03', total: 400_00, envelopeCount: 2, shortfallCount: 0, sourceLabel: 'Salaire' });
  });

  it('une règle non marquée ne déclenche rien', async () => {
    await t.call('POST', '/api/recurring-rules', salaire({ triggersFunding: false }));
    await t.call('POST', `/api/transactions/${(await plannedSalary()).id}/confirm`);
    expect(await allocations()).toHaveLength(0);
  });

  it('versé pour le mois suivant : allocations datées du 1er du mois d’après', async () => {
    await t.call('POST', '/api/recurring-rules', salaire({ fundsNextMonth: true }));
    await t.call('POST', `/api/transactions/${(await plannedSalary()).id}/confirm`);
    const allocs = await allocations();
    expect(allocs.every((a: any) => a.date === '2026-04-01' && a.label === 'Budget avril 2026')).toBe(true);
    const overview = await t.call('GET', '/api/overview');
    expect(overview.body.envelopes.find((e: any) => e.id === t.courses.id).toFundThisMonth).toBe(300_00);
  });

  it('manque d’argent : par ordre des enveloppes, incomplètes signalées', async () => {
    // 1 000 € de solde initial + 2 000 € de salaire = 3 000 € disponibles pour 3 050 € de budgets.
    updateEnvelope(t.db, t.courses.id, { monthlyTarget: 2950_00 });
    await t.call('POST', '/api/recurring-rules', salaire());
    await t.call('POST', `/api/transactions/${(await plannedSalary()).id}/confirm`);
    const allocs = await allocations();
    expect(allocs.map((a: any) => [a.envelopeId, a.amount]).sort()).toEqual([[t.courses.id, 2950_00], [t.loisirs.id, 50_00]].sort());
    expect((await t.call('GET', '/api/overview')).body.latestFunding).toMatchObject({ shortfallCount: 1 });
  });

  it('import d’un relevé : le salaire rapproché déclenche la répartition', async () => {
    await t.call('POST', '/api/recurring-rules', salaire({ label: 'Salaire', dayOfMonth: 28, startDate: '2026-02-01', fundsNextMonth: true }));
    const form = new FormData();
    form.append('file', new File([fixture], 'export.csv', { type: 'text/csv' }));
    form.append('accountId', String(t.courant.id));
    const p: any = await (await t.app.request('/api/imports/preview', { method: 'POST', body: form })).json();
    expect(p.counts.matched).toBe(1);
    await t.call('POST', '/api/imports/commit', {
      fileName: p.fileName, accountId: p.accountId, bankAccountNumber: p.bankAccountNumber, duplicateCount: p.counts.duplicate,
      rows: p.rows.filter((r: any) => r.status !== 'duplicate').map(({ index, date, label, signedAmount, fingerprint, plannedId, envelopeId }: any) => ({ index, date, label, signedAmount, fingerprint, plannedId, envelopeId })),
    });
    const allocs = await allocations();
    expect(allocs).toHaveLength(2);
    expect(allocs.every((a: any) => a.date === '2026-03-01')).toBe(true);
  });

  it('idempotent : un salaire ne répartit qu’une fois', async () => {
    await t.call('POST', '/api/recurring-rules', salaire());
    const salary = await plannedSalary();
    await t.call('POST', `/api/transactions/${salary.id}/confirm`);
    await t.call('POST', `/api/transactions/${salary.id}/confirm`);
    expect(await allocations()).toHaveLength(2);
  });

  it('supprimer le salaire supprime sa répartition', async () => {
    await t.call('POST', '/api/recurring-rules', salaire());
    const salary = await plannedSalary();
    await t.call('POST', `/api/transactions/${salary.id}/confirm`);
    await t.call('DELETE', `/api/transactions/${salary.id}`);
    expect(await allocations()).toHaveLength(0);
    expect((await t.call('GET', '/api/overview')).body.latestFunding).toBeNull();
  });
});
```

Les assertions sur `latestFunding` (premier test, manque d’argent, suppression du salaire) dépendent de la Task 5 et restent en échec jusque-là.

- [ ] **Step 2 : vérifier l'échec**

Run : `npx vitest run server/test/auto-funding.test.ts`
Attendu : FAIL, aucune allocation créée.

- [ ] **Step 3 : service** (`server/src/services/auto-funding.ts`)

```ts
import { computeBalances } from '@core/balances';
import { monthActivity, planAutoFunding } from '@core/budget';
import { addMonths, formatMonth, monthKey, startOfMonth } from '@shared/dates';
import type { Funding } from '@shared/schemas';
import type { Db } from '../db/client';
import { createFunding, findFundingBySource } from '../repos/fundings';
import { getRule } from '../repos/recurring-rules';
import { createTransaction, getTransaction } from '../repos/transactions';
import { loadState } from './state';

/**
 * Après la confirmation d'une opération : si c'est l'occurrence d'un revenu qui déclenche la répartition,
 * complète les enveloppes jusqu'à leur budget du mois financé. Une seule fois par revenu, même après annulation.
 * À appeler dans la transaction qui confirme, une fois toutes les opérations du lot écrites.
 */
export function autoFund(db: Db, transactionId: number): Funding | null {
  const source = getTransaction(db, transactionId);
  if (source.kind !== 'income' || source.status !== 'confirmed' || source.recurringRuleId == null) return null;
  const rule = getRule(db, source.recurringRuleId);
  if (!rule.triggersFunding || findFundingBySource(db, source.id)) return null;

  const date = rule.fundsNextMonth ? addMonths(startOfMonth(source.date), 1) : source.date;
  const state = loadState(db);
  const { toAllocate } = computeBalances(state);
  const plan = planAutoFunding(state.envelopes, monthActivity(state.transactions, date).allocated, toAllocate);
  if (plan.items.length === 0) return null;

  const month = monthKey(date);
  const funding = createFunding(db, { sourceTransactionId: source.id, month, shortfallCount: plan.shortfallCount });
  const label = `Budget ${formatMonth(month)}`;
  for (const item of plan.items) {
    createTransaction(db, { kind: 'allocation', date, amount: item.amount, label, envelopeId: item.envelopeId, fundingId: funding.id });
  }
  return funding;
}
```

Écart à la spec à reporter dans la spec : sans aucun montant à répartir (argent épuisé), aucune répartition n'est créée ; la tâche « à répartir » ou l'alerte de dépassement de l'Accueil couvrent déjà ce cas.

- [ ] **Step 4 : déclenchement à l'import** (`server/src/services/import.ts`, `commitImport`)

Importer `autoFund`.
Déclarer `const confirmed: number[] = [];` à côté de `matched`, pousser `row.plannedId` juste après `updateTransaction(t, row.plannedId, ...)`, et juste avant `const record = createImport(...)` :

```ts
    // Après toutes les lignes : le disponible tient compte de tout le relevé, pas seulement de ce qui précède le salaire.
    for (const id of confirmed) autoFund(t, id);
```

La synchro bancaire passe par `commitImport` : rien d'autre à faire.

- [ ] **Step 5 : déclenchement à la confirmation** (`server/src/routes/transactions.ts`)

```ts
  .post('/:id/confirm', validate('param', idParam), (c) => {
    const db = c.get('db');
    const { id } = c.req.valid('param');
    getTransaction(db, id);
    return c.json(
      db.transaction((tx) => {
        const t = tx as unknown as Db;
        const confirmed = updateTransaction(t, id, { status: 'confirmed' });
        autoFund(t, id);
        return confirmed;
      }),
    );
  })
```

Importer `type Db` depuis `../db/client` et `autoFund` depuis `../services/auto-funding`.

- [ ] **Step 6 : vérifier**

Run : `npx vitest run server/test/auto-funding.test.ts server/test/import.test.ts server/test/bank-sync.test.ts`
Attendu : PASS, sauf les assertions `latestFunding` (Task 5).

- [ ] **Step 7 : commit**

```bash
git add -A && git commit -m "feat(server): répartition automatique à la confirmation du salaire (import, synchro, confirmation)"
```

---

### Task 5 : annulation, fermeture, vue d'ensemble, export

**Files:**
- Modify: `server/src/repos/fundings.ts`, `shared/api-types.ts`, `server/src/services/overview.ts`, `server/src/services/export.ts`, `server/src/app.ts`
- Create: `server/src/routes/fundings.ts`
- Test: `server/test/auto-funding.test.ts`

**Interfaces:**
- Produces : `type FundingView = { id: number; month: string; total: Cents; envelopeCount: number; shortfallCount: number; sourceLabel: string }`, `Overview.latestFunding: FundingView | null`, `POST /api/fundings/:id/undo` (204), `POST /api/fundings/:id/dismiss` (204).

- [ ] **Step 1 : tests qui échouent** (à la fin du `describe` de `server/test/auto-funding.test.ts`)

```ts
  it('annuler rend l’argent et ne répartit plus jamais ce salaire', async () => {
    await t.call('POST', '/api/recurring-rules', salaire());
    const salary = await plannedSalary();
    await t.call('POST', `/api/transactions/${salary.id}/confirm`);
    const funding = (await t.call('GET', '/api/overview')).body.latestFunding;
    expect((await t.call('POST', `/api/fundings/${funding.id}/undo`)).status).toBe(204);
    expect(await allocations()).toHaveLength(0);
    const overview = (await t.call('GET', '/api/overview')).body;
    expect(overview.latestFunding).toBeNull();
    expect(overview.toAllocate).toBe(3000_00);
    await t.call('POST', `/api/transactions/${salary.id}/confirm`);
    expect(await allocations()).toHaveLength(0);
    expect((await t.call('POST', `/api/fundings/${funding.id}/undo`)).status).toBe(400);
  });

  it('fermer le bandeau garde les allocations', async () => {
    await t.call('POST', '/api/recurring-rules', salaire());
    await t.call('POST', `/api/transactions/${(await plannedSalary()).id}/confirm`);
    const funding = (await t.call('GET', '/api/overview')).body.latestFunding;
    expect((await t.call('POST', `/api/fundings/${funding.id}/dismiss`)).status).toBe(204);
    expect((await t.call('GET', '/api/overview')).body.latestFunding).toBeNull();
    expect(await allocations()).toHaveLength(2);
  });

  it('l’export JSON contient les répartitions', async () => {
    await t.call('POST', '/api/recurring-rules', salaire());
    await t.call('POST', `/api/transactions/${(await plannedSalary()).id}/confirm`);
    const exported = await t.call('GET', '/api/export.json');
    expect(exported.body.fundings).toHaveLength(1);
  });
```

- [ ] **Step 2 : vérifier l'échec**

Run : `npx vitest run server/test/auto-funding.test.ts`
Attendu : FAIL (`latestFunding` absent, routes 404).

- [ ] **Step 3 : type partagé** (`shared/api-types.ts`)

```ts
/** Dernière répartition automatique à annoncer : total réparti, enveloppes servies, enveloppes restées incomplètes. */
export type FundingView = {
  id: number;
  month: string;
  total: Cents;
  envelopeCount: number;
  shortfallCount: number;
  sourceLabel: string;
};
```

Ajouter `latestFunding: FundingView | null;` à `Overview`.

- [ ] **Step 4 : repo** (`server/src/repos/fundings.ts`, compléter les imports avec `and, desc, isNull, sql` et `transactions`, `FundingView`, `BadRequestError`)

```ts
export function latestFundingView(db: Db): FundingView | null {
  const funding = db
    .select()
    .from(fundings)
    .where(and(eq(fundings.status, 'applied'), isNull(fundings.dismissedAt)))
    .orderBy(desc(fundings.id))
    .limit(1)
    .get();
  if (!funding) return null;
  const totals = db
    .select({ total: sql<number>`coalesce(sum(${transactions.amount}), 0)`, count: sql<number>`count(distinct ${transactions.envelopeId})` })
    .from(transactions)
    .where(eq(transactions.fundingId, funding.id))
    .get();
  const source = db.select({ label: transactions.label }).from(transactions).where(eq(transactions.id, funding.sourceTransactionId)).get();
  return {
    id: funding.id,
    month: funding.month,
    total: totals?.total ?? 0,
    envelopeCount: totals?.count ?? 0,
    shortfallCount: funding.shortfallCount,
    sourceLabel: source?.label ?? '',
  };
}

/** Supprime les allocations de la répartition et la marque annulée : l'argent revient à répartir. */
export function undoFunding(db: Db, id: number): void {
  const funding = getFunding(db, id);
  if (funding.status === 'undone') throw new BadRequestError('Répartition déjà annulée');
  db.transaction((tx) => {
    tx.delete(transactions).where(eq(transactions.fundingId, id)).run();
    tx.update(fundings).set({ status: 'undone' }).where(eq(fundings.id, id)).run();
  });
}

export function dismissFunding(db: Db, id: number): void {
  getFunding(db, id);
  db.update(fundings).set({ dismissedAt: new Date().toISOString() }).where(eq(fundings.id, id)).run();
}
```

- [ ] **Step 5 : routes** (`server/src/routes/fundings.ts`)

```ts
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../app';
import { dismissFunding, undoFunding } from '../repos/fundings';
import { validate } from '../validate';

const idParam = z.object({ id: z.coerce.number().int().positive() });

export const fundingRoutes = new Hono<AppEnv>()
  .post('/:id/undo', validate('param', idParam), (c) => {
    undoFunding(c.get('db'), c.req.valid('param').id);
    return c.body(null, 204);
  })
  .post('/:id/dismiss', validate('param', idParam), (c) => {
    dismissFunding(c.get('db'), c.req.valid('param').id);
    return c.body(null, 204);
  });
```

Dans `server/src/app.ts`, importer `fundingRoutes` et ajouter `app.route('/api/fundings', fundingRoutes);` après la route des enveloppes.

- [ ] **Step 6 : vue d'ensemble et export**

`server/src/services/overview.ts` : importer `latestFundingView` et ajouter `latestFunding: latestFundingView(db),` à l'objet renvoyé, après `latePlanned`.
`server/src/services/export.ts` : importer `listFundings` et ajouter `fundings: listFundings(db),` après `imports`.

- [ ] **Step 7 : vérifier**

Run : `npx vitest run server/ && npm run typecheck`
Attendu : PASS. Les tests client qui construisent un `Overview` à la main échouent au typage : leur ajouter `latestFunding: null`.

- [ ] **Step 8 : commit**

```bash
git add -A && git commit -m "feat(server): annulation et fermeture d'une répartition, annoncée dans la vue d'ensemble"
```

---

### Task 6 : cases du formulaire de charge fixe

**Files:**
- Modify: `client/src/components/recurring/RecurringRuleForm.tsx`, éventuellement `RecurringRuleForm.module.css`
- Test: `client/src/components/recurring/RecurringRuleForm.test.tsx`

**Interfaces:**
- Consumes : `RecurringRuleInput.triggersFunding`, `fundsNextMonth` (Task 1) ; composant `Checkbox` de `@/components/ui` (`label`, `hint`, props d'`<input>`).

- [ ] **Step 1 : tests qui échouent** (dans le `describe` existant, reprendre son helper de rendu)

```ts
it('un revenu peut déclencher la répartition, versée pour le mois suivant', async () => {
  const onSubmit = vi.fn();
  renderForm({ onSubmit });
  const user = userEvent.setup();
  expect(screen.queryByLabelText('Déclenche la répartition')).not.toBeInTheDocument();
  await user.click(screen.getByRole('radio', { name: 'Revenu' }));
  expect(screen.queryByLabelText('Versé pour le mois suivant')).not.toBeInTheDocument();
  await user.click(screen.getByLabelText('Déclenche la répartition'));
  await user.click(screen.getByLabelText('Versé pour le mois suivant'));
  // Remplir montant et nom comme les autres tests du fichier, puis soumettre.
  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ kind: 'income', triggersFunding: true, fundsNextMonth: true }));
});

it('repasser en dépense retire le déclenchement', async () => {
  const onSubmit = vi.fn();
  renderForm({ onSubmit });
  const user = userEvent.setup();
  await user.click(screen.getByRole('radio', { name: 'Revenu' }));
  await user.click(screen.getByLabelText('Déclenche la répartition'));
  await user.click(screen.getByRole('radio', { name: 'Dépense' }));
  // Remplir montant et nom, soumettre.
  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ kind: 'expense', triggersFunding: false, fundsNextMonth: false }));
});
```

Compléter les deux commentaires avec les mêmes interactions de saisie que les tests de soumission existants du fichier (rôle et libellé exacts du `Segmented` et des champs à vérifier dans le fichier de test).

- [ ] **Step 2 : vérifier l'échec**

Run : `npx vitest run client/src/components/recurring/RecurringRuleForm.test.tsx`
Attendu : FAIL, cases introuvables.

- [ ] **Step 3 : implémentation**

Dans `Values` : `triggersFunding: boolean; fundsNextMonth: boolean;`.
Dans `initialValues` : `triggersFunding: initial?.triggersFunding ?? false, fundsNextMonth: initial?.fundsNextMonth ?? false,`.
Dans `toInput` :

```ts
    triggersFunding: v.kind === 'income' && v.triggersFunding,
    fundsNextMonth: v.kind === 'income' && v.triggersFunding && v.fundsNextMonth,
```

Importer `Checkbox` depuis `@/components/ui`, et après le bloc `values.kind === 'expense' ? <Field label="Enveloppe"...> : null` :

```tsx
      {values.kind === 'income' ? (
        <div className={styles.funding}>
          <Checkbox
            label="Déclenche la répartition"
            hint="Remplit les enveloppes jusqu’à leur budget quand ce revenu arrive"
            checked={values.triggersFunding}
            onChange={(e) => set('triggersFunding', e.target.checked)}
          />
          {values.triggersFunding ? (
            <Checkbox
              label="Versé pour le mois suivant"
              hint="Un salaire reçu fin septembre remplit le budget d’octobre"
              checked={values.fundsNextMonth}
              onChange={(e) => set('fundsNextMonth', e.target.checked)}
            />
          ) : null}
        </div>
      ) : null}
```

Dans `RecurringRuleForm.module.css` :

```css
.funding {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
}
```

- [ ] **Step 4 : vérifier**

Run : `npx vitest run client/src/components/recurring/`
Attendu : PASS.

- [ ] **Step 5 : commit**

```bash
git add client/src/components/recurring && git commit -m "feat(client): une charge fixe de revenu peut déclencher la répartition"
```

---

### Task 7 : bandeau de répartition

**Files:**
- Create: `client/src/components/budget/FundingBanner.tsx`, `FundingBanner.module.css`, `FundingBanner.test.tsx`
- Modify: `client/src/api/hooks.ts`, `client/src/pages/Home.tsx`, `client/src/pages/Budget.tsx`

**Interfaces:**
- Consumes : `Overview.latestFunding: FundingView | null`, routes `/api/fundings/:id/undo` et `/dismiss` (Task 5).
- Produces : `useUndoFunding(opts?)`, `useDismissFunding(opts?)` (mutations sur un `number`), `<FundingBanner funding={FundingView} budgetLink?: boolean />`.

- [ ] **Step 1 : hooks** (`client/src/api/hooks.ts`, section enveloppes)

```ts
export function useUndoFunding(opts?: MutOpts<void, number>) {
  const invalidate = useInvalidate();
  return useMutation({ ...opts, mutationFn: (id) => api.post<void>(`/api/fundings/${id}/undo`), onSuccess: (...a) => { invalidate(['envelopes']); opts?.onSuccess?.(...a); } });
}

export function useDismissFunding(opts?: MutOpts<void, number>) {
  const invalidate = useInvalidate();
  return useMutation({ ...opts, mutationFn: (id) => api.post<void>(`/api/fundings/${id}/dismiss`), onSuccess: (...a) => { invalidate(); opts?.onSuccess?.(...a); } });
}
```

- [ ] **Step 2 : tests qui échouent** (`FundingBanner.test.tsx`, sur le modèle de `RuleBanner.test.tsx`)

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FundingView } from '@shared/api-types';
import { ToastProvider } from '@/components/ui';
import { FundingBanner } from './FundingBanner';

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetchMock);
});

const funding: FundingView = { id: 7, month: '2026-10', total: 2340_00, envelopeCount: 8, shortfallCount: 0, sourceLabel: 'VIR SALAIRE' };

function renderBanner(over: Partial<FundingView> = {}, budgetLink = false) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter>
          <FundingBanner funding={{ ...funding, ...over }} budgetLink={budgetLink} />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('FundingBanner', () => {
  it('annonce le total, les enveloppes et le mois', () => {
    renderBanner();
    expect(screen.getByRole('status')).toHaveTextContent(/Salaire réparti\s*:\s*2\s340,00\s€ dans 8 enveloppes pour octobre 2026/);
    expect(screen.queryByText(/incomplète/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Voir le budget' })).not.toBeInTheDocument();
  });

  it('signale les enveloppes incomplètes et propose le budget sur l’accueil', () => {
    renderBanner({ shortfallCount: 2 }, true);
    expect(screen.getByText(/2 enveloppes incomplètes faute d’argent/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voir le budget' })).toHaveAttribute('href', '/budget');
  });

  it('annule la répartition', async () => {
    renderBanner();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Annuler la répartition' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/fundings/7/undo', expect.objectContaining({ method: 'POST' })));
    expect(await screen.findByText('Répartition annulée')).toBeInTheDocument();
  });

  it('se ferme', async () => {
    renderBanner();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Fermer' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/fundings/7/dismiss', expect.objectContaining({ method: 'POST' })));
  });
});
```

Vérifier le format exact de `formatEuros` (espace insécable, séparateur) et de `formatMonth` dans `shared/` et ajuster l'expression régulière du premier test.

- [ ] **Step 3 : vérifier l'échec**

Run : `npx vitest run client/src/components/budget/FundingBanner.test.tsx`
Attendu : FAIL, module introuvable.

- [ ] **Step 4 : composant** (`FundingBanner.tsx`)

```tsx
import { WalletCards, X } from 'lucide-react';
import type { FundingView } from '@shared/api-types';
import { formatMonth } from '@shared/dates';
import { formatEuros } from '@shared/money';
import { errorMessage } from '@/api/client';
import { useDismissFunding, useUndoFunding } from '@/api/hooks';
import { Button, ButtonLink, useToast } from '@/components/ui';
import { plural } from '@/lib/format';
import styles from './FundingBanner.module.css';

type FundingBannerProps = {
  funding: FundingView;
  /** Lien vers la page Budget, utile depuis l'accueil. */
  budgetLink?: boolean;
};

/** Annonce la répartition automatique du dernier salaire, annulable. */
export function FundingBanner({ funding, budgetLink = false }: FundingBannerProps) {
  const toast = useToast();
  const undo = useUndoFunding({ onSuccess: () => toast.success('Répartition annulée'), onError: (e) => toast.error(errorMessage(e)) });
  const dismiss = useDismissFunding({ onError: (e) => toast.error(errorMessage(e)) });

  return (
    <div className={styles.banner} role="status">
      <WalletCards className={styles.icon} aria-hidden />
      <p className={styles.text}>
        Salaire réparti : <strong>{formatEuros(funding.total)}</strong> dans {plural(funding.envelopeCount, 'enveloppe')} pour {formatMonth(funding.month)}
        {funding.shortfallCount > 0 ? <span className={styles.shortfall}> · {plural(funding.shortfallCount, 'enveloppe incomplète', 'enveloppes incomplètes')} faute d’argent</span> : null}
      </p>
      <div className={styles.actions}>
        {budgetLink ? (
          <ButtonLink to="/budget" size="sm" variant="ghost">
            Voir le budget
          </ButtonLink>
        ) : null}
        <Button size="sm" variant="ghost" aria-label="Annuler la répartition" loading={undo.isPending} onClick={() => undo.mutate(funding.id)}>
          Annuler
        </Button>
        <Button size="sm" variant="ghost" icon={<X />} aria-label="Fermer" onClick={() => dismiss.mutate(funding.id)} />
      </div>
    </div>
  );
}
```

Vérifier dans `client/src/components/ui/Button.tsx` que `ButtonLink` accepte `size` et qu'un `Button` sans enfant avec `icon` est supporté ; sinon suivre le motif de bouton icône déjà utilisé ailleurs (chercher `aria-label="Fermer"` dans `client/src`).

`FundingBanner.module.css`, même langage que `RuleBanner` :

```css
.banner {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  flex-wrap: wrap;
  padding: var(--s-2) var(--s-3);
  border-radius: var(--radius-md);
  background: var(--marking-soft);
  color: var(--marking-ink);
  font-size: var(--text-sm);
  animation: open var(--dur) var(--ease-out);
}

.icon {
  width: 16px;
  height: 16px;
  flex: none;
}

.text {
  margin: 0;
  flex: 1;
  min-width: 0;
}

.shortfall {
  white-space: nowrap;
}

.actions {
  display: flex;
  align-items: center;
  gap: var(--s-1);
  margin-left: auto;
}

@keyframes open {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
}

@media (max-width: 767px) {
  .actions {
    margin-left: 0;
    width: 100%;
    justify-content: flex-end;
  }
}
```

- [ ] **Step 5 : intégration**

`client/src/pages/Home.tsx` : importer `FundingBanner`, et entre le `</header>` et `<MonthHero data={data} />` :

```tsx
      {data.latestFunding ? <FundingBanner funding={data.latestFunding} budgetLink /> : null}
```

`client/src/pages/Budget.tsx` : juste après `</PageHeader>` (avant la section « Pas encore réparti ») :

```tsx
      {data?.latestFunding ? <FundingBanner funding={data.latestFunding} /> : null}
```

Vérifier l'espacement vertical dans le navigateur ; si la page n'utilise pas d'espacement automatique entre blocs (`.page` en `gap`), ajouter une marge cohérente via une classe de page.

- [ ] **Step 6 : vérifier**

Run : `npx vitest run client/ && npm run typecheck && npm run lint`
Attendu : PASS.

- [ ] **Step 7 : commit**

```bash
git add -A && git commit -m "feat(client): bandeau de la répartition automatique sur l'accueil et le budget"
```

---

### Task 8 : recette de bout en bout

**Files:** aucun nouveau, corrections au fil de l'eau.

- [ ] **Step 1 : sauvegarder la vraie base** (la branche ajoute une migration)

```bash
mkdir -p ~/projects/runway/data/backups && sqlite3 ~/projects/runway/data/runway.db ".backup $HOME/projects/runway/data/backups/runway-before-repartition-salaire-2026-10-08.db"
```

- [ ] **Step 2 : base de recette**

Copier la sauvegarde dans `tmp/recette.db` du worktree et lancer `RUNWAY_DB=tmp/recette.db PORT=3100 npm run dev` (ports différents si le dépôt principal tourne déjà).
La recette se fait sur cette copie : la vraie base n'est migrée qu'au merge.

- [ ] **Step 3 : parcours** (Chrome DevTools MCP, 1440px puis 390px, clair puis sombre)

1. Réglages, charges fixes : ouvrir la règle du salaire, cocher « Déclenche la répartition » et « Versé pour le mois suivant », enregistrer, rouvrir pour vérifier la persistance.
2. Vérifier que les cases n'apparaissent pas pour une dépense ni un virement.
3. Confirmer l'occurrence prévue du salaire (ou importer le relevé du mois qui la contient depuis `~/Documents/releves-bancaires/`).
4. Vérifier : allocations créées dans l'ordre de la page Budget, bandeau sur Accueil (avec « Voir le budget ») et Budget (sans), montant et mois justes.
5. Analyse, à venir : le budget du mois financé n'est pas compté deux fois.
6. « Annuler » : toast, bandeau disparu, « Pas encore réparti » revenu à sa valeur d'avant.
7. Refaire avec une nouvelle confirmation puis « Fermer » : bandeau disparu, allocations gardées.
8. Contrôler l'alignement, les retours à la ligne à 390px, le contraste en sombre, la navigation au clavier.

- [ ] **Step 4 : vérification finale**

Run : `npm run typecheck && npm run lint && npm test`
Attendu : tout au vert, sans test instable.

- [ ] **Step 5 : commit des corrections éventuelles**

```bash
git add -A && git commit -m "fix(client): finitions de la recette de la répartition automatique"
```
