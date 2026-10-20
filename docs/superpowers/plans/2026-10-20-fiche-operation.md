# Fiche d'une opération - plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cliquer une opération confirmée ouvre une fiche de consultation (qui est le marchand, historique chez lui, le même jour, détails bancaires), avec une description de marchand donnée par Claude, cherchable sur le web, corrigeable à la main.

**Architecture:** Trois colonnes de plus dans `merchants` ; le nommeur de fond nomme et décrit dans le même appel ; une route `POST /api/merchants/:key/describe` lance Claude avec WebSearch pour un seul marchand.
Côté client, `TransactionEditDialog` gagne un état `view`/`edit` et affiche `TransactionSheet` en `view`.

**Tech Stack:** Hono, Drizzle (better-sqlite3), zod, React 19, TanStack Query, Vitest + Testing Library, CSS modules.

**Spec:** `docs/superpowers/specs/2026-10-20-fiche-operation-design.md`

## Global Constraints

- Description : une phrase, 140 caractères au plus (`MERCHANT_DESCRIPTION_MAX = 140`).
- `description_source` : `claude`, `web` ou `user`. Claude sans web n'écrase jamais `web` ni `user` ; le web n'écrase jamais `user`.
- Le prompt web ne contient que la clé et jusqu'à 3 libellés bruts : jamais de montant, de date ni de compte.
- Délai max de la recherche web : 120 s (`MERCHANT_WEB_TIMEOUT_MS = 120_000`).
- Textes d'interface en français, sans tiret cadratin.
- Migration : la branche `operations-en-cours` crée déjà `0016_pending_transactions`. À la fusion, renuméroter la nôtre après la sienne avec un `when` postérieur (voir le test `server/test/migrations.test.ts`).
- Travail dans un worktree `fiche-operation` ; la vraie base n'est jamais touchée par les tests.
- Commandes : `npx vitest run <fichier>`, `npm run typecheck`, `npm run lint`.

---

### Task 1 : stockage et API de lecture

**Files:**
- Modify: `server/src/db/schema.ts` (table `merchants`)
- Create: migration générée par `npm run db:generate` (nom `merchant_descriptions`)
- Modify: `shared/schemas.ts` (`merchantDescriptionSources`, `transactionFilterSchema`, `merchantRenameSchema`)
- Modify: `shared/api-types.ts` (`MerchantDetail`)
- Modify: `server/src/repos/merchants.ts` (`getMerchant`, `renameMerchant`)
- Modify: `server/src/repos/transactions.ts` (`listTransactions`, filtre `merchant`)
- Modify: `server/src/routes/merchants.ts` (passer `c.get('today')`)
- Test: `server/test/merchant-routes.test.ts`, `server/test/repos.test.ts`

**Interfaces:**
- Produces: `merchantDescriptionSources = ['claude', 'web', 'user'] as const`, type `MerchantDescriptionSource`.
- Produces: `MerchantDetail = { key; name; source; transactionCount; description: string | null; descriptionSource: MerchantDescriptionSource | null; describedAt: string | null; total12Months: Cents; firstDate: ISODate | null }`.
- Produces: `getMerchant(db, key, today: ISODate): MerchantDetail`, `renameMerchant(db, key, input: { name: string; description?: string }, today): MerchantDetail`.
- Produces: `transactionFilterSchema.merchant?: string`.

- [ ] **Step 1 : tests qui échouent**

Dans `server/test/merchant-routes.test.ts`, mettre à jour les `toEqual` existants du détail pour inclure les nouveaux champs, et ajouter :

```ts
it('détail : total signé sur 12 mois, première date, description vide par défaut', async () => {
  await t.call('POST', '/api/transactions', { kind: 'expense', date: '2025-02-01', amount: 99_00, label: 'ACHAT CB CAFE DU PORT', accountId: t.courant.id });
  await t.call('POST', '/api/transactions', { kind: 'expense', date: '2025-06-01', amount: 4_00, label: 'ACHAT CB CAFE DU PORT', accountId: t.courant.id });
  await expense('ACHAT CB CAFE DU PORT');
  const body = (await t.call('GET', path('CAFE DU PORT'))).body;
  // today = 2026-03-12 : 2025-02-01 est hors des 365 jours, 2025-06-01 et 2026-03-02 dedans.
  expect(body).toMatchObject({ transactionCount: 3, total12Months: -14_00, firstDate: '2025-02-01', description: null, descriptionSource: null, describedAt: null });
});

it('description donnée à la main, puis rendue à Claude', async () => {
  await expense('ACHAT CB CAFE DU PORT');
  const set = await t.call('PUT', path('CAFE DU PORT'), { name: 'Café du Port', description: '  Bar-tabac, Marseille ' });
  expect(set.body).toMatchObject({ name: 'Café du Port', source: 'user', description: 'Bar-tabac, Marseille', descriptionSource: 'user' });
  const kept = await t.call('PUT', path('CAFE DU PORT'), { name: 'Café du Port' });
  expect(kept.body).toMatchObject({ description: 'Bar-tabac, Marseille', descriptionSource: 'user' });
  const reset = await t.call('PUT', path('CAFE DU PORT'), { name: 'Café du Port', description: '' });
  expect(reset.body).toMatchObject({ description: null, descriptionSource: null, describedAt: null });
  expect((await t.call('PUT', path('CAFE DU PORT'), { name: 'x', description: 'y'.repeat(141) })).status).toBe(400);
});

it('liste les opérations d’un marchand', async () => {
  await expense('ACHAT CB CAFE DU PORT');
  await expense('ACHAT CB LIBRAIRIE');
  const list = (await t.call('GET', '/api/transactions?merchant=CAFE%20DU%20PORT')).body;
  expect(list.map((x: any) => x.merchantKey)).toEqual(['CAFE DU PORT']);
});
```

Le revenu compte en positif dans `total12Months`, la dépense en négatif (somme de `CASE kind WHEN 'income' THEN amount ELSE -amount END`), seulement `status = 'confirmed'`.

- [ ] **Step 2 : vérifier l'échec**

Run: `npx vitest run server/test/merchant-routes.test.ts`
Expected: FAIL (champs absents, filtre `merchant` ignoré).

- [ ] **Step 3 : schéma et migration**

Dans `shared/schemas.ts`, à côté de `merchantSources` :

```ts
export const merchantDescriptionSources = ['claude', 'web', 'user'] as const;
export type MerchantDescriptionSource = (typeof merchantDescriptionSources)[number];
export const MERCHANT_DESCRIPTION_MAX = 140;
```

Dans `server/src/db/schema.ts`, table `merchants`, après `source` :

```ts
    /** Une phrase qui dit ce qu'est ce marchand ; nulle si personne ne l'a décrit ou si Claude ne l'a pas reconnu. */
    description: text('description'),
    descriptionSource: text('description_source', { enum: merchantDescriptionSources }),
    /** Dernier essai de description (Claude, web ou utilisateur), même sans résultat. */
    describedAt: text('described_at'),
```

Run: `npm run db:generate -- --name merchant_descriptions`, puis vérifier que le SQL ne contient que trois `ALTER TABLE merchants ADD ...`.

- [ ] **Step 4 : repos, types, route**

`shared/api-types.ts` :

```ts
/** Un marchand, sa description et son historique (`GET /api/merchants/:key`). */
export type MerchantDetail = {
  key: string;
  name: string;
  source: MerchantSource | null;
  transactionCount: number;
  description: string | null;
  descriptionSource: MerchantDescriptionSource | null;
  describedAt: string | null;
  /** Revenus moins dépenses confirmés des 365 derniers jours. */
  total12Months: Cents;
  firstDate: ISODate | null;
};
```

`shared/schemas.ts` :

```ts
export const merchantRenameSchema = z.object({
  name: z.string().trim().max(60, '60 caractères au plus'),
  /** Absente : description inchangée. Vide : rendue à Claude. */
  description: z.string().trim().max(MERCHANT_DESCRIPTION_MAX, `${MERCHANT_DESCRIPTION_MAX} caractères au plus`).optional(),
});
```

et dans `transactionFilterSchema` : `merchant: z.string().min(1).max(200).optional(),`.

`server/src/repos/transactions.ts`, dans `listTransactions` : `if (filter.merchant) where.push(eq(transactions.merchantKey, filter.merchant));`.

`server/src/repos/merchants.ts` :

```ts
export function getMerchant(db: Db, key: string, today: ISODate): MerchantDetail {
  const since = addDays(today, -365);
  const stats = db
    .select({
      n: sql<number>`count(*)`,
      first: sql<string | null>`min(${transactions.date})`,
      total: sql<number>`coalesce(sum(case when ${transactions.status} = 'confirmed' and ${transactions.date} > ${since} and ${transactions.date} <= ${today}
        then case when ${transactions.kind} = 'income' then ${transactions.amount} else -${transactions.amount} end end), 0)`,
    })
    .from(transactions)
    .where(eq(transactions.merchantKey, key))
    .get();
  const count = stats?.n ?? 0;
  const row = db.select().from(merchants).where(eq(merchants.key, key)).get();
  if (!row && count === 0) throw new NotFoundError('Marchand introuvable');
  const label = row?.name ? '' : sampleLabels(db, key, 1)[0] ?? '';
  return {
    key,
    name: row?.name ?? merchantFallbackName(key, label),
    source: row?.source ?? null,
    transactionCount: count,
    description: row?.description ?? null,
    descriptionSource: row?.descriptionSource ?? null,
    describedAt: row?.describedAt ?? null,
    total12Months: stats?.total ?? 0,
    firstDate: stats?.first ?? null,
  };
}

/**
 * Nom choisi par l'utilisateur (source `user`, jamais écrasé par Claude) ; un nom vide remet le marchand à nommer par Claude.
 * Une description non vide devient `user` ; vide, elle est rendue au passage de fond ; absente, elle ne change pas.
 */
export function renameMerchant(db: Db, key: string, input: MerchantRename, today: ISODate): MerchantDetail {
  getMerchant(db, key, today);
  const updatedAt = new Date().toISOString();
  const naming = input.name === '' ? { name: null, source: null } : { name: input.name, source: 'user' as const };
  const describing =
    input.description === undefined
      ? {}
      : input.description === ''
        ? { description: null, descriptionSource: null, describedAt: null }
        : { description: input.description, descriptionSource: 'user' as const, describedAt: updatedAt };
  const values = { ...naming, ...describing, updatedAt };
  db.insert(merchants).values({ key, ...values }).onConflictDoUpdate({ target: merchants.key, set: values }).run();
  return getMerchant(db, key, today);
}
```

Le comparateur `date > since` exclut le jour d'il y a 365 jours pile : c'est voulu (fenêtre glissante d'un an).
Remplacer les appels : `getMerchant(c.get('db'), key, c.get('today'))`, `renameMerchant(db, key, c.req.valid('json'), c.get('today'))`.
Dans la route `PUT`, relancer `namer.request()` si `name === ''` **ou** `description === ''`.
Mettre à jour les autres appelants (`grep -rn "getMerchant\|renameMerchant" server`), y compris `server/test/merchant-naming.test.ts` : `renameMerchant(ctx.db, 'LIBRAIRIE', { name: 'Librairie du Centre' }, '2026-03-12')`.

- [ ] **Step 5 : vérifier**

Run: `npx vitest run server/test/merchant-routes.test.ts server/test/merchant-naming.test.ts server/test/migrations.test.ts server/test/repos.test.ts && npm run typecheck`
Expected: PASS (le typecheck client peut échouer sur les tests client qui construisent un `MerchantDetail` : compléter leurs objets avec les nouveaux champs).

- [ ] **Step 6 : commit**

```bash
git add -A server shared client && git commit -m "feat(server): description des marchands et historique dans leur détail"
```

---

### Task 2 : le nommeur de fond décrit aussi

**Files:**
- Modify: `server/src/services/merchants.ts` (schéma JSON, prompt, boucle)
- Modify: `server/src/repos/merchants.ts` (`listUnnamedKeys` → `listKeysToProcess`, `setClaudeNames` → `setClaudeResults`)
- Modify: `shared/schemas.ts` (`merchantNamesResultSchema`)
- Test: `server/test/merchant-naming.test.ts`

**Interfaces:**
- Consumes: colonnes de la Task 1.
- Produces: `listKeysToProcess(db, limit, exclude): string[]` (nom nul **ou** `described_at` nul), `setClaudeResults(db, results: { key: string; name: string; description: string }[], describedAt: string): number` (renvoie le nombre de marchands nommés).

- [ ] **Step 1 : tests qui échouent**

Adapter `namingExec` pour renvoyer aussi une description :

```ts
function namingExec(nameOf: (key: string) => string, describe: (key: string) => string = () => '') {
  return vi.fn<Exec>(async (args) => ok({ names: askedKeys(args).map((key) => ({ key, name: nameOf(key), description: describe(key) })) }));
}
```

Ajouter :

```ts
it('décrit les marchands, y compris ceux déjà nommés, sans toucher aux noms ni aux descriptions web ou utilisateur', async () => {
  expense('ACHAT CB CAFE DU PORT');
  expense('ACHAT CB LIBRAIRIE');
  expense('ACHAT CB BK K0010 PARIS');
  expense('ACHAT CB INCONNU XZ');
  renameMerchant(ctx.db, 'LIBRAIRIE', { name: 'Librairie du Centre' }, '2026-03-12');
  renameMerchant(ctx.db, 'CAFE DU PORT', { name: 'Café du Port', description: 'Bar-tabac' }, '2026-03-12');
  const exec = namingExec(
    (key) => key,
    (key) => ({ 'CAFE DU PORT': 'Café', LIBRAIRIE: 'Librairie', 'BK K PARIS': 'Chaîne de fast-food, Paris', 'INCONNU XZ': '' })[key] ?? '',
  );

  await nameMerchants(ctx.db, { exec });

  const prompt = exec.mock.calls[0]![0].at(-1)!;
  expect(prompt).toContain('ne jamais deviner');
  // Café du Port a déjà nom et description utilisateur : rien à demander.
  expect(askedKeys(exec.mock.calls[0]![0]).sort()).toEqual(['BK K PARIS', 'INCONNU XZ', 'LIBRAIRIE']);
  expect(merchant('LIBRAIRIE')).toMatchObject({ name: 'Librairie du Centre', source: 'user', description: 'Librairie', descriptionSource: 'claude' });
  expect(merchant('CAFE DU PORT')).toMatchObject({ description: 'Bar-tabac', descriptionSource: 'user' });
  expect(merchant('BK K PARIS')).toMatchObject({ description: 'Chaîne de fast-food, Paris', descriptionSource: 'claude' });
  expect(merchant('INCONNU XZ')).toMatchObject({ description: null, descriptionSource: null });
  expect(merchant('INCONNU XZ')!.describedAt).not.toBeNull();

  // Second tour : tout est essayé, plus rien à demander.
  exec.mockClear();
  await nameMerchants(ctx.db, { exec });
  expect(exec).not.toHaveBeenCalled();
});

it('une description trop longue est ignorée mais compte comme essayée', async () => {
  expense('ACHAT CB CAFE DU PORT');
  await nameMerchants(ctx.db, { exec: namingExec(() => 'Café du Port', () => 'x'.repeat(141)) });
  expect(merchant('CAFE DU PORT')).toMatchObject({ description: null, descriptionSource: null });
  expect(merchant('CAFE DU PORT')!.describedAt).not.toBeNull();
});
```

Vérifier que la clé de `BK K0010 PARIS` est bien `BK K PARIS` avec `merchantKey` (voir la base réelle : `BK K PARIS|Burger King`) ; sinon ajuster le test.
Mettre à jour les tests existants qui listent `listUnnamedKeys` ou supposent qu'un marchand nommé n'est jamais redemandé (un marchand nommé par l'utilisateur mais jamais décrit est désormais demandé une fois).

- [ ] **Step 2 : vérifier l'échec**

Run: `npx vitest run server/test/merchant-naming.test.ts`
Expected: FAIL.

- [ ] **Step 3 : implémentation**

`shared/schemas.ts` :

```ts
export const merchantNamesResultSchema = z.object({
  names: z.array(z.object({ key: z.string(), name: z.string(), description: z.string().default('') })),
});
```

`server/src/services/merchants.ts` : ajouter `description: { type: 'string' }` dans `items.properties` et dans `required`.
Consignes ajoutées en fin de liste du prompt (titre du prompt : « Tu donnes un nom lisible et une courte description aux marchands… ») :

```
- Dans "description", une phrase courte qui dit ce qu'est ce marchand : « Chaîne de fast-food », « Éditeur de jeux vidéo (League of Legends) », « Boulangerie ».
- Ajoute la ville ou le quartier si le libellé en donne un : « BK K0010 PARIS » donne « Chaîne de fast-food, Paris ».
- Pour une personne : la relation si elle est claire, sinon « Virement à un particulier ».
- 140 caractères au plus.
- Si tu ne reconnais pas le marchand, laisse "description" vide : ne jamais deviner.
```

Boucle : `listKeysToProcess` à la place de `listUnnamedKeys`, puis :

```ts
const asked = new Set(keys);
const results = parsed.data.names
  .filter(({ key }) => asked.has(key))
  .map(({ key, name, description }) => ({ key, name: name.trim(), description: description.trim() }));
// Une clé demandée mais absente de la réponse compte aussi comme essayée.
for (const key of keys) if (!results.some((r) => r.key === key)) results.push({ key, name: '', description: '' });
total += setClaudeResults(db, results, new Date().toISOString());
```

`server/src/repos/merchants.ts` :

```ts
/** Clés portées par au moins une opération, sans nom ou jamais décrites, les plus fréquentes d'abord, hors `exclude`. */
export function listKeysToProcess(db: Db, limit: number, exclude: Iterable<string> = []): string[] {
  const excluded = [...exclude];
  const todo = or(isNull(merchants.name), isNull(merchants.describedAt))!;
  const where = excluded.length > 0 ? and(todo, notInArray(merchants.key, excluded)) : todo;
  // ... même requête que listUnnamedKeys
}

/**
 * Écrit ce que Claude a répondu, sans jamais écraser ce qu'un humain ou le web a fourni :
 * le nom seulement si personne ne l'a nommé, la description seulement si elle n'est ni `web` ni `user`.
 * `described_at` est posé pour chaque clé, même sans description : elle ne sera pas redemandée.
 * Renvoie le nombre de marchands nommés.
 */
export function setClaudeResults(db: Db, results: { key: string; name: string; description: string }[], describedAt: string): number {
  return db.transaction((tx) => {
    let named = 0;
    for (const { key, name, description } of results) {
      if (name.length > 0 && name.length <= MERCHANT_NAME_MAX) {
        named += tx.update(merchants).set({ name, source: 'claude', updatedAt: describedAt }).where(and(eq(merchants.key, key), isNull(merchants.source))).run().changes;
      }
      const ok = description.length > 0 && description.length <= MERCHANT_DESCRIPTION_MAX;
      tx.update(merchants)
        .set({ description: ok ? description : null, descriptionSource: ok ? 'claude' : null, describedAt, updatedAt: describedAt })
        .where(and(eq(merchants.key, key), or(isNull(merchants.descriptionSource), eq(merchants.descriptionSource, 'claude'))))
        .run();
    }
    return named;
  });
}
```

Déplacer `MERCHANT_NAME_MAX` dans `shared/schemas.ts` à côté de `MERCHANT_DESCRIPTION_MAX` (le repo ne doit pas importer le service), et réexporter depuis le service si des tests l'importent.
Le `MerchantStatus.named` ne change pas de sens.

- [ ] **Step 4 : vérifier**

Run: `npx vitest run server/test/merchant-naming.test.ts server/test/merchant-routes.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5 : commit**

```bash
git add -A server shared && git commit -m "feat(server): Claude décrit chaque marchand en le nommant"
```

---

### Task 3 : recherche web à la demande

**Files:**
- Create: `server/src/services/merchant-web.ts`
- Modify: `server/src/routes/merchants.ts` (route `POST /:key/describe`)
- Modify: `server/src/app.ts` (passer `exec` à `merchantRoutes`)
- Modify: `shared/schemas.ts` (`merchantWebResultSchema`)
- Test: `server/test/merchant-web.test.ts`

**Interfaces:**
- Consumes: `getMerchant`, `sampleLabels`, `runClaude`, `execClaude`, `getSettings`.
- Produces: `describeMerchantOnWeb(db, key, today, deps?: { exec?: Exec }): Promise<MerchantDetail>` ; route `POST /api/merchants/:key/describe` → `MerchantDetail`.

- [ ] **Step 1 : tests qui échouent**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Exec, ExecResult } from '../src/services/claude';
import { createTestApp, type TestApp } from './helpers';

const ok = (structured: unknown): ExecResult => ({ stdout: JSON.stringify({ is_error: false, result: 'ok', structured_output: structured }), stderr: '', exitCode: 0 });
const path = (key: string) => `/api/merchants/${encodeURIComponent(key)}/describe`;

describe('POST /api/merchants/:key/describe', () => {
  let t: TestApp;
  let exec: ReturnType<typeof vi.fn<Exec>>;
  beforeEach(async () => {
    exec = vi.fn<Exec>(async () => ok({ description: 'Boutique de vêtements, Paris (3e)' }));
    t = createTestApp('2026-03-12', { exec });
    await t.call('POST', '/api/transactions', { kind: 'expense', date: '2026-03-02', amount: 42_00, label: 'ACHAT CB SC-FOURTEEN CA 15.10.26 CARTE NUMERO 089', accountId: t.courant.id });
  });

  it('cherche sur le web avec la clé et les libellés seulement, et garde le résultat', async () => {
    const res = await t.call('POST', path('SC-FOURTEEN CA'));
    expect(res.body).toMatchObject({ description: 'Boutique de vêtements, Paris (3e)', descriptionSource: 'web' });
    const args = exec.mock.calls[0]![0];
    expect(args.slice(args.indexOf('--tools'), args.indexOf('--tools') + 2)).toEqual(['--tools', 'WebSearch,WebFetch']);
    const prompt = args.at(-1)!;
    expect(prompt).toContain('SC-FOURTEEN CA');
    expect(prompt).not.toContain('42');
    expect(prompt).not.toContain('2026-03-02');
    expect(exec.mock.calls[0]![1]).toBe(120_000);
  });

  it('rien trouvé : description nulle, essai noté', async () => {
    exec.mockResolvedValueOnce(ok({ description: '  ' }));
    const res = await t.call('POST', path('SC-FOURTEEN CA'));
    expect(res.body).toMatchObject({ description: null, descriptionSource: 'web' });
    expect(res.body.describedAt).not.toBeNull();
  });

  it('dédoublonne deux appels simultanés', async () => {
    const [a, b] = await Promise.all([t.call('POST', path('SC-FOURTEEN CA')), t.call('POST', path('SC-FOURTEEN CA'))]);
    expect(exec).toHaveBeenCalledTimes(1);
    expect(a.body).toEqual(b.body);
  });

  it('ne remplace pas une description de l’utilisateur', async () => {
    await t.call('PUT', `/api/merchants/${encodeURIComponent('SC-FOURTEEN CA')}`, { name: 'SC-Fourteen', description: 'Friperie' });
    const res = await t.call('POST', path('SC-FOURTEEN CA'));
    expect(res.status).toBe(409);
    expect(exec).not.toHaveBeenCalled();
  });

  it('propage une erreur de Claude', async () => {
    exec.mockResolvedValueOnce({ stdout: '', stderr: 'ENOENT', exitCode: 127 });
    const res = await t.call('POST', path('SC-FOURTEEN CA'));
    expect(res.status).toBe(503);
  });

  it('404 pour une clé inconnue', async () => {
    expect((await t.call('POST', path('INCONNU'))).status).toBe(404);
  });
});
```

Avant d'écrire le test 409, vérifier qu'il existe une erreur 409 dans `server/src/errors.ts` (`ConflictError`) ; sinon l'ajouter sur le modèle de `BadRequestError`.
Vérifier aussi le code retourné par `runClaude` quand `exitCode` vaut 127 (`claudeNotInstalled` → 503) et ajuster si besoin.

- [ ] **Step 2 : vérifier l'échec**

Run: `npx vitest run server/test/merchant-web.test.ts`
Expected: FAIL (404 sur la route).

- [ ] **Step 3 : implémentation**

`shared/schemas.ts` : `export const merchantWebResultSchema = z.object({ description: z.string() });`

`server/src/services/merchant-web.ts` :

```ts
import { eq } from 'drizzle-orm';
import { MERCHANT_DESCRIPTION_MAX, merchantWebResultSchema } from '@shared/schemas';
import type { MerchantDetail } from '@shared/api-types';
import type { ISODate } from '@shared/dates';
import type { Db } from '../db/client';
import { merchants } from '../db/schema';
import { ConflictError } from '../errors';
import { getMerchant, sampleLabels } from '../repos/merchants';
import { getSettings } from '../repos/settings';
import { ClaudeError, execClaude, runClaude, type Exec } from './claude';

export const MERCHANT_WEB_TIMEOUT_MS = 120_000;

const outputJsonSchema = { type: 'object', properties: { description: { type: 'string' } }, required: ['description'] };

/** Le prompt ne porte que la clé et des libellés bruts : jamais de montant, de date ni de compte. */
export function buildMerchantWebPrompt(key: string, labels: string[]): string {
  return `Tu identifies un marchand vu sur un relevé bancaire français, en cherchant sur le web.

Clé du marchand : ${JSON.stringify(key)}
Libellés bruts : ${labels.map((l) => JSON.stringify(l)).join(', ')}

Consignes :
- Cherche avec WebSearch le nom du marchand tiré de la clé ou du libellé, rien d'autre.
- Réponds par une phrase courte qui dit ce qu'est ce marchand : son type et, pour un commerce local, sa ville ou son quartier. Exemple : « Boutique de vêtements de seconde main, Paris (11e) ».
- ${MERCHANT_DESCRIPTION_MAX} caractères au plus, sans URL.
- Si rien de fiable ne correspond, laisse "description" vide : ne jamais deviner.
- Réponds uniquement avec le JSON demandé.`;
}

const inFlight = new Map<string, Promise<MerchantDetail>>();

/** Décrit un marchand d'après le web ; un appel en cours pour la même clé est partagé. */
export function describeMerchantOnWeb(db: Db, key: string, today: ISODate, deps: { exec?: Exec } = {}): Promise<MerchantDetail> {
  const current = inFlight.get(key);
  if (current) return current;
  const run = (async () => {
    const before = getMerchant(db, key, today);
    if (before.descriptionSource === 'user') throw new ConflictError('Ce marchand a déjà une description donnée à la main');
    const model = getSettings(db).claudeModel || undefined;
    const args = ['-p', '--tools', 'WebSearch,WebFetch', '--allowedTools', 'WebSearch WebFetch', '--output-format', 'json', '--json-schema', JSON.stringify(outputJsonSchema)];
    if (model) args.push('--model', model);
    args.push(buildMerchantWebPrompt(key, sampleLabels(db, key, 3)));
    const parsed = merchantWebResultSchema.safeParse(await runClaude(args, MERCHANT_WEB_TIMEOUT_MS, deps.exec ?? execClaude));
    if (!parsed.success) throw new ClaudeError('Réponse de Claude invalide (format inattendu)', 'claude_invalid_output');
    const text = parsed.data.description.trim();
    const description = text.length > 0 && text.length <= MERCHANT_DESCRIPTION_MAX ? text : null;
    const now = new Date().toISOString();
    db.update(merchants).set({ description, descriptionSource: 'web', describedAt: now, updatedAt: now }).where(eq(merchants.key, key)).run();
    return getMerchant(db, key, today);
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, run);
  return run;
}
```

Vérifier comment `ideas.ts` passe `WEB_TOOLS` à la CLI (`--tools` et `--allowedTools`) et reprendre exactement la même forme.
La ligne `merchants` existe toujours quand une opération porte la clé (`ensureMerchants` à la création) ; si `getMerchant` réussit sans ligne, faire un `insert ... onConflictDoUpdate` comme `renameMerchant`.

`server/src/routes/merchants.ts` : `merchantRoutes(namer, exec?: Exec)`, et

```ts
.post('/:key/describe', validate('param', keyParam), async (c) =>
  c.json(await describeMerchantOnWeb(c.get('db'), c.req.valid('param').key, c.get('today'), { exec })),
)
```

`server/src/app.ts` : `app.route('/api/merchants', merchantRoutes(namer, exec));`.
Comme pour les autres routes, la base vient de `c.get('db')` : pendant une restauration, la route échoue comme les autres.

- [ ] **Step 4 : vérifier**

Run: `npx vitest run server/test/merchant-web.test.ts server/test/merchant-routes.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5 : commit**

```bash
git add -A server shared && git commit -m "feat(server): recherche web d'un marchand à la demande"
```

---

### Task 4 : hooks client et description dans le formulaire du marchand

**Files:**
- Modify: `client/src/api/hooks.ts`
- Modify: `client/src/components/transactions/MerchantHeading.tsx`
- Test: `client/src/components/transactions/TransactionEditDialog.test.tsx`

**Interfaces:**
- Produces: `useRenameMerchant` prend `{ key: string; name: string; description?: string }` ; `useDescribeMerchantOnWeb(opts?)` mutation `(key: string) => MerchantDetail`, qui écrit le résultat dans `keys.merchant(key)` (`qc.setQueryData`) en plus d'invalider `['merchants']`.

- [ ] **Step 1 : test qui échoue**

Dans `TransactionEditDialog.test.tsx`, le faux `fetch` répond déjà au détail marchand : y ajouter les nouveaux champs (`description: 'Supérette de quartier'`, `descriptionSource: 'claude'`, `describedAt: '2026-10-20T10:00:00Z'`, `total12Months: -4500`, `firstDate: '2025-03-01'`) et mémoriser le corps du `PUT`.
Test (le dialogue ouvre la fiche à partir de la Task 5 : ici on part du formulaire, ouvert pour une opération prévue `status: 'planned'`) :

```ts
it('modifie nom et description du marchand', async () => {
  renderDialog({ ...expense, status: 'planned' });
  await userEvent.click(await screen.findByRole('button', { name: 'Modifier le marchand' }));
  const description = screen.getByLabelText('Description');
  expect(description).toHaveValue('Supérette de quartier');
  await userEvent.clear(description);
  await userEvent.type(description, 'Supérette, Paris 11e');
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le marchand' }));
  expect(lastPut).toEqual({ name: 'Carrefour Express', description: 'Supérette, Paris 11e' });
});
```

Adapter `renderDialog` et `lastPut` à la forme exacte du fichier de test existant.
Mettre à jour les tests existants qui cherchent « Renommer » et « Enregistrer le nom ».

- [ ] **Step 2 : vérifier l'échec**

Run: `npx vitest run client/src/components/transactions/TransactionEditDialog.test.tsx`
Expected: FAIL.

- [ ] **Step 3 : implémentation**

`hooks.ts` :

```ts
/** Renomme un marchand et corrige sa description pour toutes ses opérations ; un nom ou une description vides sont rendus à Claude. */
export function useRenameMerchant(opts?: MutOpts<MerchantDetail, { key: string; name: string; description?: string }>) {
  const invalidate = useInvalidate();
  return useMutation({
    ...opts,
    mutationFn: ({ key, ...body }) => api.put<MerchantDetail>(`/api/merchants/${encodeURIComponent(key)}`, body),
    onSuccess: (...a) => {
      invalidate(['merchants']);
      opts?.onSuccess?.(...a);
    },
  });
}

/** Demande à Claude de chercher le marchand sur le web (jusqu'à deux minutes). */
export function useDescribeMerchantOnWeb(opts?: MutOpts<MerchantDetail, string>) {
  const qc = useQueryClient();
  return useMutation({
    ...opts,
    mutationFn: (key) => api.post<MerchantDetail>(`/api/merchants/${encodeURIComponent(key)}/describe`),
    onSuccess: (...a) => {
      qc.setQueryData(keys.merchant(a[0].key), a[0]);
      opts?.onSuccess?.(...a);
    },
  });
}
```

Vérifier que `api.post` accepte un appel sans corps et que le client HTTP n'a pas de délai inférieur à 120 s.

`MerchantHeading.tsx` : le brouillon devient `{ name: string; description: string } | null`, initialisé avec `merchant.data?.name ?? ''` et `merchant.data?.description ?? ''`.
Sous le champ « Nom du marchand », ajouter :

```tsx
<Field label="Description" hint="Ce qu'est ce marchand, en une phrase. Vide pour laisser Claude le décrire.">
  {(id, describedBy) => <Input id={id} aria-describedby={describedBy} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} maxLength={140} />}
</Field>
```

Bouton d'en-tête : « Modifier le marchand » ; bouton d'envoi : « Enregistrer le marchand » ; envoi `rename.mutate({ key: merchantKey, name: draft.name.trim(), description: draft.description.trim() })`.
Champ `Field` du nom : garder `hint` sur la portée (`scope`) mais le libeller « Le nom et la description vaudront pour … ».
Toast de succès : « Marchand modifié » (ou l'existant « Claude renommera ce marchand » si le nom est vide).

- [ ] **Step 4 : vérifier**

Run: `npx vitest run client/src/components/transactions && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5 : commit**

```bash
git add -A client && git commit -m "feat(client): description du marchand modifiable avec son nom"
```

---

### Task 5 : la fiche

**Files:**
- Create: `client/src/components/transactions/TransactionSheet.tsx`, `TransactionSheet.module.css`
- Create: `client/src/components/transactions/MerchantAbout.tsx`, `MerchantAbout.module.css`
- Modify: `client/src/components/transactions/TransactionEditDialog.tsx`
- Modify: `client/src/components/transactions/QuickEntry.tsx` (seulement si besoin d'un `onCancel` qui revient à la fiche)
- Test: `client/src/components/transactions/TransactionSheet.test.tsx`, `TransactionEditDialog.test.tsx`

**Interfaces:**
- Consumes: `useMerchant`, `useTransactions({ merchant, limit })`, `useTransactions({ from, to, excludeAllocations })`, `useAccounts`, `useEnvelopes`, `useDescribeMerchantOnWeb`, `TransactionRow`.
- Produces: `TransactionSheet({ transaction, onEdit, onOpen }: { transaction: Transaction; onEdit: () => void; onOpen: (t: Transaction) => void })`, `MerchantAbout({ merchantKey }: { merchantKey: string })`.
- Produces: `opensSheet(t: Transaction): boolean` exporté de `TransactionEditDialog.tsx` : `t.status === 'confirmed' && t.kind !== 'allocation'`.

- [ ] **Step 1 : tests qui échouent**

`TransactionSheet.test.tsx` : faux `fetch` sur le modèle de `TransactionEditDialog.test.tsx`, qui répond selon l'URL :
- `/api/merchants/CARREFOUR%20EXPR` → détail avec `transactionCount: 14`, `total12Months: -18240`, `firstDate: '2025-03-01'`, description réglable par test ;
- `/api/transactions?merchant=…` → l'opération courante plus deux autres (ids 8 et 9) ;
- `/api/transactions?from=2026-10-03&to=2026-10-03…` → l'opération courante plus une autre (id 20, « SNCF ») ;
- `/api/accounts`, `/api/envelopes` → les listes du test existant ;
- `POST …/describe` → détail avec `description: 'Supérette de quartier, Paris'`, `descriptionSource: 'web'`.

```ts
it('montre qui est le marchand, l’historique et le même jour, sans répéter l’opération ouverte', async () => {
  renderSheet(expense);
  expect(await screen.findByText('Supérette de quartier')).toBeInTheDocument();
  expect(screen.getByText('d’après Claude')).toBeInTheDocument();
  expect(await screen.findByText(/14 passages depuis mars 2025/)).toBeInTheDocument();
  expect(screen.getByText(/182,40 € sur 12 mois/)).toBeInTheDocument();
  const history = screen.getByRole('region', { name: 'Chez ce marchand' });
  expect(within(history).getAllByRole('listitem')).toHaveLength(2);
  const sameDay = screen.getByRole('region', { name: 'Le même jour' });
  expect(within(sameDay).getByText('SNCF')).toBeInTheDocument();
  expect(screen.getByText(expense.label)).toBeInTheDocument();
});

it('marchand pas reconnu : recherche web, attente puis résultat', async () => {
  detail.description = null; detail.descriptionSource = 'claude'; detail.describedAt = '2026-10-20T10:00:00Z';
  renderSheet(expense);
  expect(await screen.findByText('Claude n’a pas reconnu ce marchand.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Chercher sur le web' }));
  expect(await screen.findByText('Supérette de quartier, Paris')).toBeInTheDocument();
  expect(screen.getByText('d’après le web')).toBeInTheDocument();
});

it('pas de bouton web pour une description donnée à la main', async () => {
  detail.descriptionSource = 'user';
  renderSheet(expense);
  await screen.findByText('Supérette de quartier');
  expect(screen.queryByRole('button', { name: 'Chercher sur le web' })).toBeNull();
});

it('un clic sur une opération voisine demande son ouverture', async () => {
  const onOpen = vi.fn();
  renderSheet(expense, { onOpen });
  const sameDay = await screen.findByRole('region', { name: 'Le même jour' });
  await userEvent.click(within(sameDay).getByRole('button', { name: /SNCF/ }));
  expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 20 }));
});
```

Dans `TransactionEditDialog.test.tsx` :

```ts
it('une opération confirmée ouvre la fiche, Modifier puis Annuler y revient', async () => {
  renderDialog(expense);
  await userEvent.click(await screen.findByRole('button', { name: 'Modifier' }));
  expect(screen.getByLabelText('Montant')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
  expect(await screen.findByRole('region', { name: 'Chez ce marchand' })).toBeInTheDocument();
});

it('une opération prévue ouvre directement le formulaire', async () => {
  renderDialog({ ...expense, status: 'planned' });
  expect(await screen.findByLabelText('Montant')).toBeInTheDocument();
});
```

Les tests existants du dialogue partent du formulaire : leur faire cliquer « Modifier » d'abord, ou leur passer une opération prévue quand le test porte sur le formulaire seul.
Vérifier les libellés exacts (`Montant`, `Annuler`) dans `QuickEntry.tsx`.

- [ ] **Step 2 : vérifier l'échec**

Run: `npx vitest run client/src/components/transactions`
Expected: FAIL (`TransactionSheet` introuvable).

- [ ] **Step 3 : `MerchantAbout`**

```tsx
import { Globe } from 'lucide-react';
import { errorMessage } from '@/api/client';
import { useDescribeMerchantOnWeb, useMerchant } from '@/api/hooks';
import { Button, Notice, Skeleton } from '@/components/ui';
import styles from './MerchantAbout.module.css';

const SOURCE_LABELS = { claude: 'd’après Claude', web: 'd’après le web', user: null } as const;

/** « Qui c'est » : la description du marchand, et la recherche web quand Claude ne l'a pas reconnu ou qu'on veut mieux. */
export function MerchantAbout({ merchantKey }: { merchantKey: string }) {
  const merchant = useMerchant(merchantKey);
  const web = useDescribeMerchantOnWeb();
  const m = merchant.data;
  if (!m) return <Skeleton height={40} />;

  const text = web.isPending
    ? 'Claude cherche sur le web…'
    : m.description ?? (m.describedAt === null ? 'Claude n’a pas encore décrit ce marchand.' : m.descriptionSource === 'web' ? 'Rien trouvé sur le web.' : 'Claude n’a pas reconnu ce marchand.');
  const source = m.description && m.descriptionSource ? SOURCE_LABELS[m.descriptionSource] : null;

  return (
    <section aria-label="Qui c'est" className={styles.about}>
      <h3 className={styles.heading}>Qui c'est</h3>
      <p className={m.description && !web.isPending ? styles.description : styles.missing}>{text}</p>
      {source ? <p className={styles.source}>{source}</p> : null}
      {web.error ? <Notice tone="error">{errorMessage(web.error)}</Notice> : null}
      {m.descriptionSource !== 'user' ? (
        <Button size="sm" variant="ghost" icon={<Globe />} loading={web.isPending} onClick={() => web.mutate(merchantKey)}>
          Chercher sur le web
        </Button>
      ) : null}
    </section>
  );
}
```

Vérifier les props réelles de `Notice` et `Skeleton` dans `client/src/components/ui/` et adapter.
CSS : réutiliser les tokens de `client/src/styles/tokens.css` (couleurs `--ink-*`, tailles `--text-*`, espacements `--space-*`) ; aucune valeur en dur que `css-guard.test.ts` refuserait.

- [ ] **Step 4 : `TransactionSheet`**

Structure (titres de section en `<h3>`, chaque section `<section aria-label="…">`) :

```tsx
/** Fiche de consultation d'une opération : de quoi se souvenir de ce qu'on a fait de son argent. */
export function TransactionSheet({ transaction: t, onEdit, onOpen }: TransactionSheetProps) {
  const accounts = useAccountMap();   // Map id → compte, voir comment Operations.tsx construit la sienne
  const envelopes = useEnvelopeMap();
  const merchant = useMerchant(t.merchantKey);
  const history = useTransactions({ merchant: t.merchantKey ?? undefined, limit: 6 }, { enabled: t.merchantKey !== null });
  const sameDay = useTransactions({ from: t.date, to: t.date, excludeAllocations: true, status: 'confirmed' });
  const others = (list: Transaction[] | undefined) => (list ?? []).filter((x) => x.id !== t.id);
  const row = (x: Transaction) => (
    <TransactionRow key={x.id} transaction={x} accounts={accounts} envelopes={envelopes} lead={listRowDate(x.date)} onClick={() => onOpen(x)} />
  );
  // ...
}
```

Contenu, dans l'ordre :
1. En-tête : `<Amount cents={signedAmount(t)} />` en grand, puis `formatDateWithWeekday(t.date)`, le nom du compte et `EnvelopeTag` (ou « À ranger ») ; bouton `Modifier` (`variant="secondary"`, icône `Pencil`) qui appelle `onEdit`.
2. `<MerchantAbout merchantKey={t.merchantKey} />` si `t.merchantKey`.
3. « Chez ce marchand » si `merchant.data.transactionCount > 1` : `${plural(n, 'passage')} depuis ${formatMonth(monthKey(firstDate)).toLowerCase()} · ${formatCents(Math.abs(total12Months))} sur 12 mois`, puis `<ul className="ledger">` des 5 premières de `others(history.data)`.
4. « Le même jour » si `others(sameDay.data)` n'est pas vide : `<ul className="ledger">`.
5. « Détails bancaires » : `<dl>` avec « Libellé de la banque » = `t.label`, « Note » si elle ne répète pas le libellé.
   Extraire `repeatsLabel` de `TransactionRow.tsx` dans `client/src/lib/merchants.ts` (exporté) et l'utiliser aux deux endroits.

Vérifier les noms réels : `signedAmount` (`./signed`), `listRowDate`, `formatMonth`, `monthKey`, la fonction de format des montants (`Amount` ou `formatCents`) et le libellé du mois (« mars 2025 »).
Vérifier si `ListRow` rend un `<button>` accessible avec `clickLabel` (« Modifier SNCF ») : dans la fiche, passer un `clickLabel` « Ouvrir SNCF » via une prop optionnelle `clickVerb` de `TransactionRow` (défaut « Modifier »).

- [ ] **Step 5 : le dialogue**

`TransactionEditDialog.tsx` :

```tsx
/** La fiche s'ouvre pour ce qu'on a vraiment dépensé ou reçu ; prévues et répartitions vont droit au formulaire. */
export const opensSheet = (t: Transaction) => t.status === 'confirmed' && t.kind !== 'allocation';

// dans le composant
const [current, setCurrent] = useState<Transaction | null>(transaction);
const [mode, setMode] = useState<'view' | 'edit'>(transaction && opensSheet(transaction) ? 'view' : 'edit');
const [lastOpened, setLastOpened] = useState(transaction);
if (lastOpened !== transaction) {
  setLastOpened(transaction);
  setCurrent(transaction);
  setMode(transaction && opensSheet(transaction) ? 'view' : 'edit');
}
const t = current;
```

En `view` : titre = nom du marchand (ou `displayLabel(t, accounts)`), pas de `headerAction`, contenu `<TransactionSheet transaction={t} onEdit={() => setMode('edit')} onOpen={(x) => { setCurrent(x); setMode(opensSheet(x) ? 'view' : 'edit'); }} />`, taille `lg`.
En `edit` : le contenu actuel inchangé, mais `onCancel` de `QuickEntry` (et `AllocationForm`) revient à `view` si `opensSheet(t)`, ferme sinon.
Si `QuickEntry` n'a pas de prop `onCancel`, en ajouter une (défaut : comportement actuel).
Le défilement du dialogue revient en haut quand `current` change (vérifier `bodyRef` dans `Dialog.tsx` ; sinon passer `key={t.id}` au contenu).

- [ ] **Step 6 : vérifier**

Run: `npx vitest run client && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 7 : commit**

```bash
git add -A client && git commit -m "feat(client): fiche d'une opération, avec qui est le marchand et ce qui s'est passé le même jour"
```

---

### Task 6 : recette dans le navigateur

- [ ] **Step 1 : base de recette**

Sauvegarder la vraie base puis en faire une copie (le code de la branche la migre) :

```bash
sqlite3 ~/projects/runway/data/runway.db ".backup ~/projects/runway/data/backups/runway-before-fiche-operation-2026-10-20.db"
mkdir -p tmp/e2e && sqlite3 ~/projects/runway/data/runway.db ".backup tmp/e2e/runway.db"
```

- [ ] **Step 2 : lancer**

```bash
PATH="$HOME/.local/bin:$PATH" RUNWAY_DB=tmp/e2e/runway.db PORT=3100 npx tsx server/src/index.ts
API_PORT=3100 npx vite --config client/vite.config.ts --port 5180
```

Le nommeur de fond démarre et décrit les ~740 marchands (5 lots de 150, quelques minutes) : suivre `GET /api/merchants/status`.

- [ ] **Step 3 : parcours**

Avec Chrome DevTools MCP, en 1440 px puis 390 px :
- Opérations → cliquer une dépense Burger King : description, « d'après Claude », historique, même jour, libellé brut ;
- cliquer une ligne de « Le même jour » : la fiche change, défile en haut ;
- « Modifier » puis « Annuler » : retour à la fiche ;
- un petit commerce non reconnu (ex. `SC-FOURTEEN CA`) : « Chercher sur le web », attente, résultat « d'après le web » ;
- « Modifier le marchand » : corriger la description, vérifier qu'elle s'affiche sans source ;
- une opération prévue et une répartition : formulaire direct ;
- Accueil : cliquer une dernière opération ouvre la fiche.
Captures dans `tmp/e2e/` ; corriger tout défaut visuel (alignements, espacements, troncatures).

- [ ] **Step 4 : finir**

`npm test && npm run typecheck && npm run lint`, puis proposer à Basile une relecture légère unique et la fusion (renuméroter la migration si `operations-en-cours` a fusionné avant).
