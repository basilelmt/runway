# Idées : chercheurs multiples et critique - plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** n'afficher que des idées d'investissement vraiment prometteuses, trouvées par quatre chercheurs aux angles différents puis passées au crible par un critique séparé.

**Architecture:** une fournée devient un pipeline dans `server/src/services/ideas.ts` : quatre appels `claude -p` en parallèle (un par angle), filtres et faits de marché calculés par le serveur (variations 1 et 3 mois via Yahoo), puis un appel `claude -p` critique qui rend un verdict par piste.
Les prompts et schémas JSON imposés à Claude vivent dans un nouveau fichier `server/src/services/idea-prompts.ts`.
Les écartées sont enregistrées (`verdict = 'dropped'`) et suivies comme les autres, mais jamais renvoyées dans `open`/`closed` ; le Bilan compare retenues et écartées.

**Tech Stack:** TypeScript, Hono, Drizzle + better-sqlite3 (drizzle-kit pour les migrations), zod 4, React 19 + TanStack Query 5, vitest + Testing Library.

**Spec :** `docs/superpowers/specs/2026-10-08-idees-sources-critique-design.md`.

## Global Constraints

- Tout le texte d'interface, les messages et les commentaires sont en français, avec accents ; jamais de tiret cadratin, seulement « - ».
- Côté client, apostrophes typographiques « ’ » dans les textes affichés ; côté serveur, les prompts gardent l'apostrophe droite comme aujourd'hui.
- Aucun écrit dans `/tmp` : les fichiers temporaires vont dans `tmp/` du projet (gitignoré).
- Ne jamais modifier ni effacer `data/runway.db` : toute vérification sur données réelles se fait sur une copie dans `tmp/`.
- Aucune nouvelle dépendance npm.
- Le binaire `claude` et Yahoo sont injectables ; aucun test ne touche le réseau.
- Outils web des chercheurs et du critique : `--tools WebSearch,WebFetch --allowedTools WebSearch,WebFetch`.
- Délais : `RESEARCH_TIMEOUT_MS = 600_000` par chercheur, `REVIEW_TIMEOUT_MS = 900_000` pour le critique.
- Raison d'une piste sans verdict : `'Non évaluée par le critique'`.
- Commandes de vérification : `npm test`, `npm run typecheck`, `npm run lint`, toutes au vert à la fin de chaque tâche.
- Commits en français au format du dépôt (`feat(core): ...`, `feat(server): ...`, `feat(client): ...`), sans co-auteur.

## Structure des fichiers

| Fichier | Rôle |
|---|---|
| `core/invest.ts` (modifié) | `trailingReturn` (variation sur N jours) et `filterSummary` (retenues contre écartées) |
| `shared/invest.ts` (modifié) | `IDEA_ANGLES`, `IdeaAngle`, `ideaAngleKeys` |
| `shared/schemas.ts` (modifié) | `ideaCandidateSchema` avec `sources`, `ideaReviewSchema`, `ideaReviewBatchSchema` |
| `shared/api-types.ts` (modifié) | `IdeaView`, `IdeaRunView`, `IdeasSummary` enrichis |
| `server/src/db/schema.ts` (modifié) | nouvelles colonnes de `ideas` et `idea_runs` |
| `server/src/db/migrations/0007_*.sql`, `0008_*.sql` (créés) | ajout des colonnes et reprise des données, puis suppression de `source_url` |
| `server/src/repos/ideas.ts` (modifié) | `NewIdea`, `insertIdea`, `setRunPhase`, filtre `shown` |
| `server/src/services/idea-prompts.ts` (créé) | angles, schémas JSON imposés, prompts du chercheur et du critique |
| `server/src/services/ideas.ts` (modifié) | pipeline chercheurs, filtres, faits de marché, critique ; vue |
| `client/src/lib/invest.ts` (modifié) | `formatMarketContext`, `runOutcome`, `failedAnglesText` |
| `client/src/components/invest/IdeaCard.tsx` (modifié) | sources multiples, risque, contexte de marché |
| `client/src/components/invest/IdeasSection.tsx` (modifié) | message selon la phase, rapport de fin |
| `client/src/components/invest/IdeasScore.tsx` (modifié) | ligne retenues contre écartées |
| `client/src/components/invest/Ideas.module.css` (modifié) | styles `.sources`, `.market` |

---

### Task 1: Calculs purs (variation sur N jours, bilan du tri)

**Files:**
- Modify: `core/invest.ts` (après `simpleReturn` et `ideasSummary`, vers les lignes 120-150)
- Test: `core/invest.test.ts`

**Interfaces:**
- Consumes: `priceOn(series, date)`, `simpleReturn(start, end)`, `DatedPrice`, `ClosedIdea` (déjà dans `core/invest.ts`), `addDays` de `@shared/dates`.
- Produces:
  - `trailingReturn(series: DatedPrice[], today: ISODate, days: number): number | null`
  - `type FilterSummaryResult = { keptCount: number; keptAvgExcess: number; droppedCount: number; droppedAvgExcess: number }`
  - `filterSummary(kept: ClosedIdea[], dropped: ClosedIdea[]): FilterSummaryResult | null`

- [ ] **Step 1: Write the failing tests**

Dans `core/invest.test.ts`, ajouter `filterSummary` et `trailingReturn` à l'import depuis `./invest`, puis ajouter à la fin du bloc `describe('rendements des idées', ...)` :

```ts
  it('trailingReturn compare la dernière clôture à celle d’il y a N jours', () => {
    const series = [
      { date: '2026-07-01', close: 10 },
      { date: '2026-09-07', close: 11 },
      { date: '2026-10-07', close: 12 },
    ];
    expect(trailingReturn(series, '2026-10-07', 30)).toBeCloseTo(12 / 11 - 1);
    expect(trailingReturn(series, '2026-10-07', 91)).toBeCloseTo(0.2);
    // Trou de cotation : la dernière clôture connue avant la date de départ.
    expect(trailingReturn(series, '2026-10-07', 20)).toBeCloseTo(12 / 11 - 1);
    // Historique trop court ou vide.
    expect(trailingReturn(series, '2026-10-07', 120)).toBeNull();
    expect(trailingReturn([], '2026-10-07', 30)).toBeNull();
  });
  it('filterSummary compare retenues et écartées face à la référence', () => {
    const kept = [
      { return: 0.2, benchReturn: 0.05 },
      { return: 0, benchReturn: 0.05 },
    ];
    const dropped = [{ return: -0.1, benchReturn: 0.02 }];
    expect(filterSummary(kept, dropped)).toEqual({
      keptCount: 2,
      keptAvgExcess: expect.closeTo(0.05),
      droppedCount: 1,
      droppedAvgExcess: expect.closeTo(-0.12),
    });
    expect(filterSummary([], dropped)).toBeNull();
    expect(filterSummary(kept, [])).toBeNull();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run core/invest.test.ts`
Expected: FAIL, `trailingReturn` et `filterSummary` ne sont pas exportés.

- [ ] **Step 3: Implement**

Dans `core/invest.ts`, juste après `simpleReturn` :

```ts
/** Variation entre la dernière clôture au plus tard `days` jours avant `today` et la dernière clôture de `series` (triée) ; null si l'historique ne remonte pas assez loin. */
export function trailingReturn(series: DatedPrice[], today: ISODate, days: number): number | null {
  const last = series.at(-1);
  const start = priceOn(series, addDays(today, -days));
  if (!last || !start) return null;
  return simpleReturn(start.close, last.close);
}
```

Remplacer `ideasSummary` et ajouter `filterSummary` juste après :

```ts
const avgExcess = (ideas: ClosedIdea[]): number => ideas.reduce((s, c) => s + c.return - c.benchReturn, 0) / ideas.length;

export function ideasSummary(closed: ClosedIdea[]): IdeasSummaryResult {
  const n = closed.length;
  const hundred = (r: number) => Math.round(100_00 * (1 + r));
  return {
    closedCount: n,
    beatCount: closed.filter((c) => c.return > c.benchReturn).length,
    avgExcess: n ? avgExcess(closed) : null,
    hundredEach: {
      invested: n * 100_00,
      ideas: closed.reduce((s, c) => s + hundred(c.return), 0),
      bench: closed.reduce((s, c) => s + hundred(c.benchReturn), 0),
    },
  };
}

export type FilterSummaryResult = { keptCount: number; keptAvgExcess: number; droppedCount: number; droppedAvgExcess: number };

/** Le tri du critique a-t-il de la valeur ? Écart moyen à la référence des retenues et des écartées ; null tant qu'un des deux groupes est vide. */
export function filterSummary(kept: ClosedIdea[], dropped: ClosedIdea[]): FilterSummaryResult | null {
  if (kept.length === 0 || dropped.length === 0) return null;
  return { keptCount: kept.length, keptAvgExcess: avgExcess(kept), droppedCount: dropped.length, droppedAvgExcess: avgExcess(dropped) };
}
```

`addDays` est déjà importé en tête de `core/invest.ts`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run core/invest.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify and commit**

Run: `npm run typecheck && npm run lint`
Expected: aucune erreur.

```bash
git add core/invest.ts core/invest.test.ts
git commit -m "feat(core): variation sur N jours et bilan retenues contre écartées"
```

---

### Task 2: Modèle de données des idées critiquées

Ajoute les colonnes, la migration, le dépôt, les types d'API et la vue, en gardant l'ancienne fournée à un seul appel en état de marche (elle sera remplacée à la tâche 3).

**Files:**
- Modify: `shared/invest.ts`
- Modify: `server/src/db/schema.ts:216-253`
- Create: `server/src/db/migrations/0007_idea_critique.sql` (généré puis complété), `server/src/db/migrations/0008_drop_idea_source_url.sql` (généré), et leurs fichiers `meta/`
- Modify: `server/src/repos/ideas.ts`
- Modify: `shared/api-types.ts:305-345`
- Modify: `server/src/services/ideas.ts` (`toRunView`, `toView`, `buildIdeasView`, appel à `insertIdea`)
- Modify: `client/src/components/invest/IdeaCard.tsx`, `client/src/components/invest/IdeaCard.test.tsx`, `client/src/components/invest/Ideas.module.css`
- Test: `server/test/invest-repos.test.ts`

**Interfaces:**
- Consumes: `filterSummary`, `ClosedIdea` (tâche 1).
- Produces:
  - `shared/invest.ts` : `IDEA_ANGLES` (tableau `{ key, label }` constant), `type IdeaAngle = 'calendar' | 'international' | 'primary' | 'supply'`, `ideaAngleKeys: [IdeaAngle, ...IdeaAngle[]]`.
  - `server/src/repos/ideas.ts` :
    - `type NewIdea` (objet plat : colonnes insérables de `ideas` sauf `id`, `runId`, `createdOn`, `status`, `finalReturn`, `benchFinalReturn`, avec `sources: string[]` et `reasoning: string[]`)
    - `insertIdea(db, runId, createdOn, idea: NewIdea): IdeaRow`
    - `setRunPhase(db, id, phase: 'research' | 'review'): void`
    - `finishRun(db, id, patch)` accepte en plus `candidateCount?: number` et `failedAngles?: IdeaAngle[]`, et remet toujours `phase` à `null`
    - `listIdeas(db, filter?: { status?; since?; shown?: true })`
  - `shared/api-types.ts` :
    - `IdeaRunView` : `+ phase: 'research' | 'review' | null; candidateCount: number; failedAngles: { key: IdeaAngle; label: string }[]`
    - `IdeaView` : `sourceUrl` devient `sources: string[]`, `+ risk: string | null; marketContext: { perf3m: number; benchPerf3m: number } | null`
    - `IdeasSummary` : `+ filter: { keptCount: number; keptAvgExcess: number; droppedCount: number; droppedAvgExcess: number } | null`

- [ ] **Step 1: Angles partagés**

À la fin de `shared/invest.ts` :

```ts
/** Les quatre chercheurs d'une fournée d'idées, chacun avec son angle. */
export const IDEA_ANGLES = [
  { key: 'calendar', label: 'Calendrier' },
  { key: 'international', label: 'International' },
  { key: 'primary', label: 'Sources primaires' },
  { key: 'supply', label: 'Approvisionnement' },
] as const;
export type IdeaAngle = (typeof IDEA_ANGLES)[number]['key'];
export const ideaAngleKeys = IDEA_ANGLES.map((a) => a.key) as [IdeaAngle, ...IdeaAngle[]];
```

- [ ] **Step 2: Colonnes ajoutées (première migration)**

Dans `server/src/db/schema.ts`, importer `ideaAngleKeys` depuis `@shared/invest` (à côté de `platforms`).
Dans `ideaRuns`, après `error` :

```ts
  phase: text('phase', { enum: ['research', 'review'] }),
  candidateCount: integer('candidate_count').notNull().default(0),
  /** JSON : clés des angles dont le chercheur a échoué. */
  failedAngles: text('failed_angles').notNull().default('[]'),
```

Dans `ideas`, garder `sourceUrl` pour l'instant et ajouter après `sourceUrl` :

```ts
    /** JSON : URL des pages lues qui appuient l'idée. */
    sources: text('sources').notNull().default('[]'),
```

et après `benchFinalReturn` :

```ts
    /** Verdict du critique ; null pour les idées d'avant la critique, traitées comme affichées. */
    verdict: text('verdict', { enum: ['kept', 'dropped'] }),
    critique: text('critique'),
    risk: text('risk'),
    angle: text('angle', { enum: ideaAngleKeys }),
    /** Variations de cours vues par le critique, en fraction. */
    perf1m: real('perf_1m'),
    perf3m: real('perf_3m'),
    benchPerf1m: real('bench_perf_1m'),
    benchPerf3m: real('bench_perf_3m'),
```

Run: `npm run db:generate -- --name idea_critique`
Expected: un fichier `server/src/db/migrations/0007_idea_critique.sql` avec uniquement des `ALTER TABLE ... ADD ...`, aucune question interactive.

Ajouter à la fin de ce fichier SQL la reprise des idées existantes :

```sql
--> statement-breakpoint
UPDATE `ideas` SET `sources` = json_array(`source_url`);
```

- [ ] **Step 3: Suppression de `source_url` (seconde migration)**

Dans `server/src/db/schema.ts`, supprimer la ligne `sourceUrl: text('source_url').notNull(),`.

Run: `npm run db:generate -- --name drop_idea_source_url`
Expected: `server/src/db/migrations/0008_drop_idea_source_url.sql` contenant `ALTER TABLE \`ideas\` DROP COLUMN \`source_url\`;`, sans question interactive (une seule colonne retirée, rien d'ajouté).
Si drizzle-kit propose à la place une reconstruction de table, vérifier qu'elle recopie bien `sources` et toutes les autres colonnes.

- [ ] **Step 4: Write the failing repo tests**

Dans `server/test/invest-repos.test.ts`, ajouter `setRunPhase` et `getRun` à l'import depuis `../src/repos/ideas`, remplacer la constante `candidate` par :

```ts
const idea = {
  title: 'Fête des nouilles', event: 'La fête approche', sources: ['https://exemple.fr/a', 'https://exemple.jp/b'], reasoning: ['a', 'b'],
  pricedIn: 'Probablement en partie', ticker: 'BAG.PA', assetName: 'Baguettes SA', whereToBuy: 'trade_republic' as const, horizon: '2026-10-28',
  startPriceEur: 10, benchStartPriceEur: 700,
};
```

et remplacer le bloc `describe('repos idées', ...)` par :

```ts
describe('repos idées', () => {
  it('fournées, idées et clôture', () => {
    const { db } = createTestDb();
    const run = createRun(db, 'manual', '2026-10-07T10:00:00Z');
    expect(runningRun(db)?.id).toBe(run.id);
    expect(run.phase).toBe('research');
    const row = insertIdea(db, run.id, '2026-10-07', idea);
    expect(JSON.parse(row.sources)).toEqual(['https://exemple.fr/a', 'https://exemple.jp/b']);
    expect(row.verdict).toBeNull();
    const done = finishRun(db, run.id, {
      status: 'done', finishedAt: '2026-10-07T10:05:00Z', acceptedCount: 1, candidateCount: 3, failedAngles: ['supply'], rejected: [{ ticker: 'XX', reason: 'inconnu' }],
    });
    expect(done).toMatchObject({ phase: null, candidateCount: 3, failedAngles: '["supply"]' });
    expect(lastSuccessfulRun(db)?.id).toBe(run.id);
    expect(listIdeas(db, { status: 'open' })).toHaveLength(1);
    closeIdea(db, row.id, 0.1, 0.02);
    expect(listIdeas(db, { status: 'closed' })[0]).toMatchObject({ finalReturn: 0.1, benchFinalReturn: 0.02 });
  });

  it('suit la phase d’une fournée', () => {
    const { db } = createTestDb();
    const run = createRun(db, 'manual', '2026-10-07T10:00:00Z');
    setRunPhase(db, run.id, 'review');
    expect(getRun(db, run.id).phase).toBe('review');
  });

  it('n’affiche pas les écartées', () => {
    const { db } = createTestDb();
    const run = createRun(db, 'manual', '2026-10-07T10:00:00Z');
    insertIdea(db, run.id, '2026-10-07', idea);
    insertIdea(db, run.id, '2026-10-07', { ...idea, ticker: 'KEEP.PA', verdict: 'kept', critique: 'Personne n’en parle', angle: 'calendar' });
    insertIdea(db, run.id, '2026-10-07', { ...idea, ticker: 'DROP.PA', verdict: 'dropped', critique: 'Déjà dans les prix', angle: 'supply' });
    expect(listIdeas(db)).toHaveLength(3);
    expect(listIdeas(db, { shown: true }).map((i) => i.ticker).sort()).toEqual(['BAG.PA', 'KEEP.PA']);
    expect(listIdeas(db, { status: 'open', shown: true })).toHaveLength(2);
  });

  it('marque les fournées interrompues', () => {
    const { db } = createTestDb();
    createRun(db, 'weekly', '2026-10-07T10:00:00Z');
    expect(failInterruptedRuns(db, '2026-10-07T11:00:00Z')).toBe(1);
    expect(runningRun(db)).toBeNull();
  });
});
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `npx vitest run server/test/invest-repos.test.ts`
Expected: FAIL (`setRunPhase` absent, `insertIdea` attend l'ancienne signature, `phase` vaut `null`).

- [ ] **Step 6: Implement the repo**

Dans `server/src/repos/ideas.ts` :
- remplacer l'import de `drizzle-orm` par `import { and, desc, eq, gte, isNull, or } from 'drizzle-orm';` ;
- supprimer l'import de `IdeaCandidate` et ajouter `import type { IdeaAngle } from '@shared/invest';`.

Remplacer `createRun`, `finishRun`, `failInterruptedRuns`, `insertIdea` et `listIdeas`, et ajouter `NewIdea` et `setRunPhase` :

```ts
export function createRun(db: Db, trigger: 'manual' | 'weekly', startedAt: string): IdeaRunRow {
  return db.insert(ideaRuns).values({ trigger, startedAt, phase: 'research' }).returning().get();
}

export function setRunPhase(db: Db, id: number, phase: 'research' | 'review'): void {
  db.update(ideaRuns).set({ phase }).where(eq(ideaRuns.id, id)).run();
}

export function finishRun(
  db: Db,
  id: number,
  patch: {
    status: 'done' | 'failed';
    finishedAt: string;
    acceptedCount?: number;
    candidateCount?: number;
    failedAngles?: IdeaAngle[];
    rejected?: { ticker: string; reason: string }[];
    error?: string | null;
  },
): IdeaRunRow {
  getRun(db, id);
  const set: Partial<typeof ideaRuns.$inferInsert> = { status: patch.status, finishedAt: patch.finishedAt, phase: null };
  if (patch.acceptedCount !== undefined) set.acceptedCount = patch.acceptedCount;
  if (patch.candidateCount !== undefined) set.candidateCount = patch.candidateCount;
  if (patch.failedAngles !== undefined) set.failedAngles = JSON.stringify(patch.failedAngles);
  if (patch.rejected !== undefined) set.rejected = JSON.stringify(patch.rejected);
  if (patch.error !== undefined) set.error = patch.error;
  return db.update(ideaRuns).set(set).where(eq(ideaRuns.id, id)).returning().get()!;
}
```

```ts
export function failInterruptedRuns(db: Db, at: string): number {
  const result = db
    .update(ideaRuns)
    .set({ status: 'failed', finishedAt: at, phase: null, error: 'Interrompue par un redémarrage' })
    .where(eq(ideaRuns.status, 'running'))
    .run();
  return result.changes;
}

/** Une idée à enregistrer : retenue, écartée, ou (`verdict` absent) d'avant la critique. */
export type NewIdea = Omit<typeof ideas.$inferInsert, 'id' | 'runId' | 'createdOn' | 'status' | 'finalReturn' | 'benchFinalReturn' | 'sources' | 'reasoning'> & {
  sources: string[];
  reasoning: string[];
};

export function insertIdea(db: Db, runId: number, createdOn: string, idea: NewIdea): IdeaRow {
  return db
    .insert(ideas)
    .values({ ...idea, runId, createdOn, sources: JSON.stringify(idea.sources), reasoning: JSON.stringify(idea.reasoning) })
    .returning()
    .get();
}

/** `shown` : seulement les idées affichées (retenues, ou d'avant la critique). */
export function listIdeas(db: Db, filter?: { status?: 'open' | 'closed'; since?: string; shown?: true }): IdeaRow[] {
  const conditions = [];
  if (filter?.status !== undefined) conditions.push(eq(ideas.status, filter.status));
  if (filter?.since !== undefined) conditions.push(gte(ideas.createdOn, filter.since));
  if (filter?.shown) conditions.push(or(isNull(ideas.verdict), eq(ideas.verdict, 'kept')));
  const order = [desc(ideas.createdOn), desc(ideas.id)] as const;
  const query = db.select().from(ideas);
  return conditions.length > 0 ? query.where(and(...conditions)).orderBy(...order).all() : query.orderBy(...order).all();
}
```

- [ ] **Step 7: Run repo tests**

Run: `npx vitest run server/test/invest-repos.test.ts`
Expected: PASS.

- [ ] **Step 8: Types d'API**

Dans `shared/api-types.ts`, importer `IdeaAngle` depuis `./invest` (à côté de `Platform`, même chemin que l'import existant de `Platform`), puis :

```ts
export type IdeaRunView = {
  id: number;
  trigger: 'manual' | 'weekly';
  status: 'running' | 'done' | 'failed';
  /** Étape en cours : les chercheurs, puis le critique ; null une fois finie. */
  phase: 'research' | 'review' | null;
  startedAt: string;
  finishedAt: string | null;
  acceptedCount: number;
  /** Pistes proposées par les chercheurs, avant tout filtre. */
  candidateCount: number;
  failedAngles: { key: IdeaAngle; label: string }[];
  rejected: { ticker: string; reason: string }[];
  error: string | null;
};
```

Dans `IdeaView`, remplacer `sourceUrl: string;` par `sources: string[];` et ajouter après `pricedIn: string;` :

```ts
  /** Ce qui peut mal tourner, selon le critique ; null pour les idées d'avant la critique. */
  risk: string | null;
  /** Variation sur 3 mois au moment de l'idée, et celle du S&P 500 ; null si inconnue. */
  marketContext: { perf3m: number; benchPerf3m: number } | null;
```

Dans `IdeasSummary`, ajouter :

```ts
  /** Retenues contre écartées, sur les idées closes passées par le critique ; null tant qu'un des deux groupes est vide. */
  filter: { keptCount: number; keptAvgExcess: number; droppedCount: number; droppedAvgExcess: number } | null;
```

- [ ] **Step 9: Vue serveur et ancienne fournée adaptée**

Dans `server/src/services/ideas.ts` :
- importer `filterSummary` depuis `@core/invest` et `IDEA_ANGLES, type IdeaAngle` depuis `@shared/invest` ;
- dans `execute`, l'ancienne fournée enregistre ses idées sous la nouvelle forme (remplacée à la tâche 3) :

```ts
    for (const a of accepted) {
      const { sourceUrl, ...rest } = a.candidate;
      insertIdea(t, runId, today, { ...rest, sources: [sourceUrl], startPriceEur: a.priceEur, benchStartPriceEur: bench.eur });
    }
```

- les idées ouvertes qui bloquent un actif sont seulement les affichées : `const open = new Set(listIdeas(db, { status: 'open', shown: true }).map((i) => i.ticker));` ;
- remplacer `toRunView` :

```ts
export function toRunView(row: IdeaRunRow): IdeaRunView {
  return {
    id: row.id,
    trigger: row.trigger,
    status: row.status,
    phase: row.phase,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    acceptedCount: row.acceptedCount,
    candidateCount: row.candidateCount,
    failedAngles: (JSON.parse(row.failedAngles) as IdeaAngle[]).map((key) => ({ key, label: IDEA_ANGLES.find((a) => a.key === key)?.label ?? key })),
    rejected: JSON.parse(row.rejected) as IdeaRunView['rejected'],
    error: row.error,
  };
}
```

- dans `toView`, remplacer `sourceUrl: row.sourceUrl,` par `sources: JSON.parse(row.sources) as string[],` et ajouter après `pricedIn: row.pricedIn,` :

```ts
    risk: row.risk,
    marketContext: row.perf3m !== null && row.benchPerf3m !== null ? { perf3m: row.perf3m, benchPerf3m: row.benchPerf3m } : null,
```

- dans `buildIdeasView`, n'afficher que les idées affichées et calculer le bilan du tri :

```ts
export async function buildIdeasView(db: Db, prices: Prices, today: ISODate): Promise<IdeasView> {
  await closeDueIdeas(db, prices, today);
  const open = listIdeas(db, { status: 'open', shown: true });
  const closedAll = listIdeas(db, { status: 'closed' });
  const closed = closedAll.filter((r) => r.verdict !== 'dropped');

  // ... (openViews et closedViews inchangés, construits à partir de `open` et `closed`)

  const results = (rows: IdeaRow[]) =>
    rows.flatMap((r) => (r.finalReturn !== null && r.benchFinalReturn !== null ? [{ return: r.finalReturn, benchReturn: r.benchFinalReturn }] : []));
  const summary = {
    ...ideasSummary(results(closed)),
    filter: filterSummary(results(closedAll.filter((r) => r.verdict === 'kept')), results(closedAll.filter((r) => r.verdict === 'dropped'))),
  };
  const last = latestRun(db);

  return { open: openViews, closed: closedViews, summary, lastRun: last ? toRunView(last) : null };
}
```

`closeDueIdeas` reste sur `listIdeas(db, { status: 'open' })` : les écartées sont closes à l'horizon comme les autres.

- [ ] **Step 10: Carte d'idée, sources multiples**

Dans `client/src/components/invest/IdeaCard.tsx`, remplacer le lien unique par la liste des sources :

```tsx
      <p className={styles.event}>
        {idea.event}{' '}
        <span className={styles.sources}>
          {idea.sources.map((url) => (
            <a key={url} href={url} target="_blank" rel="noreferrer" className={styles.source}>
              {domainOf(url)}
              <ArrowUpRight aria-hidden />
            </a>
          ))}
        </span>
      </p>
```

Dans `client/src/components/invest/Ideas.module.css`, juste avant `.source {` :

```css
.sources {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0 var(--s-2);
}
```

Dans `client/src/components/invest/IdeaCard.test.tsx`, remplacer `sourceUrl: 'https://www.exemple.fr/fete',` par :

```ts
  sources: ['https://www.exemple.fr/fete', 'https://news.exemple.jp/men'],
  risk: null,
  marketContext: null,
```

et dans le premier test, après l'assertion sur `exemple\.fr`, ajouter :

```ts
    expect(screen.getByRole('link', { name: /news\.exemple\.jp/ })).toHaveAttribute('href', 'https://news.exemple.jp/men');
```

- [ ] **Step 11: Vérifier la migration sur une copie de la vraie base**

```bash
mkdir -p tmp
sqlite3 data/runway.db ".backup tmp/migration-check.db"
RUNWAY_DB=tmp/migration-check.db npx tsx -e "const { openDb } = await import('./server/src/db/client.ts'); openDb(process.env.RUNWAY_DB);"
sqlite3 tmp/migration-check.db "select id, ticker, sources, verdict from ideas; select id, phase, candidate_count, failed_angles from idea_runs;"
```

Expected : les 5 idées existantes avec `sources` en liste JSON d'une URL (celle de l'ancienne `source_url`) et `verdict` vide ; les fournées avec `candidate_count` 0 et `failed_angles` `[]`.
Puis `rm tmp/migration-check.db*`.

- [ ] **Step 12: Full verification and commit**

Run: `npm test && npm run typecheck && npm run lint`
Expected: tout au vert (les tests existants de `server/test/ideas.test.ts` passent encore avec l'ancienne fournée).

```bash
git add shared/invest.ts shared/api-types.ts server/src/db/schema.ts server/src/db/migrations server/src/repos/ideas.ts server/src/services/ideas.ts server/test/invest-repos.test.ts client/src/components/invest/IdeaCard.tsx client/src/components/invest/IdeaCard.test.tsx client/src/components/invest/Ideas.module.css
git commit -m "feat(server): idées à plusieurs sources, verdict du critique et faits de marché en base"
```

---

### Task 3: Pipeline chercheurs, faits de marché et critique

**Files:**
- Modify: `shared/schemas.ts:355-370`
- Create: `server/src/services/idea-prompts.ts`
- Modify: `server/src/services/ideas.ts` (constantes, `buildIdeasPrompt` et `ideasJsonSchema` supprimés, `execute` réécrit)
- Test: `server/test/ideas.test.ts` (réécrit)

**Interfaces:**
- Consumes: `trailingReturn` (tâche 1) ; `IDEA_ANGLES`, `IdeaAngle`, `NewIdea`, `insertIdea`, `setRunPhase`, `finishRun` avec `candidateCount`/`failedAngles`, `listIdeas({ shown: true })` (tâche 2) ; `prices.historyEur`, `prices.quoteEur` ; `runClaude`, `execClaude`, `ClaudeError`.
- Produces:
  - `shared/schemas.ts` : `ideaCandidateSchema` (champ `sources: string[]`, plus de `sourceUrl` ni de `pricedIn`), `type IdeaCandidate`, `ideaReviewSchema`, `type IdeaReview`, `ideaReviewBatchSchema`.
  - `server/src/services/idea-prompts.ts` : `type MarketFacts = { perf1m: number | null; perf3m: number | null }`, `researchJsonSchema`, `reviewJsonSchema`, `buildResearchPrompt(input)`, `buildReviewPrompt(input)`, `pctText(n)`.
  - `server/src/services/ideas.ts` : `RESEARCH_TIMEOUT_MS`, `REVIEW_TIMEOUT_MS`, `NOT_REVIEWED` exportés ; `startIdeaRun` et `buildIdeasView` inchangés côté signature.
  - Le prompt du chercheur contient `Ton angle : <label>.` ; celui du critique commence par `Nous sommes le ...` et contient `Tu es le critique`. Les tests s'appuient sur ces deux marqueurs.

- [ ] **Step 1: Schémas zod**

Dans `shared/schemas.ts`, remplacer `ideaCandidateSchema` et ajouter les schémas du critique après `ideaBatchSchema` :

```ts
/** Une piste telle qu'un chercheur la propose, avant vérification du ticker. */
export const ideaCandidateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  event: z.string().trim().min(1).max(1000),
  sources: z.array(z.url({ protocol: /^https?$/, error: 'Lien http(s) attendu' })).min(1).max(8),
  reasoning: z.array(z.string().trim().min(1).max(400)).min(1).max(5),
  ticker: z.string().trim().min(1).max(32),
  assetName: z.string().trim().min(1).max(120),
  whereToBuy: z.enum(platforms),
  horizon: isoDateSchema,
});
export type IdeaCandidate = z.infer<typeof ideaCandidateSchema>;

/** Sortie brute d'un chercheur : chaque piste est validée séparément pour ne pas tout rejeter pour une seule. */
export const ideaBatchSchema = z.object({ ideas: z.array(z.unknown()) });

/** Verdict du critique sur une piste. */
export const ideaReviewSchema = z.object({
  ticker: z.string().trim().min(1).max(32),
  verdict: z.enum(['kept', 'dropped']),
  reason: z.string().trim().min(1).max(600),
  pricedIn: z.string().trim().min(1).max(600),
  risk: z.string().trim().min(1).max(600),
});
export type IdeaReview = z.infer<typeof ideaReviewSchema>;

/** Sortie brute du critique, validée verdict par verdict. */
export const ideaReviewBatchSchema = z.object({ reviews: z.array(z.unknown()) });
```

- [ ] **Step 2: Write the failing tests**

Remplacer entièrement `server/test/ideas.test.ts` par :

```ts
import { describe, expect, it, vi } from 'vitest';
import { IDEA_ANGLES, type IdeaAngle } from '@shared/invest';
import { listIdeas } from '../src/repos/ideas';
import type { Exec, ExecResult } from '../src/services/claude';
import { buildResearchPrompt, buildReviewPrompt } from '../src/services/idea-prompts';
import { chart, fakeFetch } from './fixtures/yahoo';
import { createTestApp } from './helpers';

const idea = (over: Record<string, unknown> = {}) => ({
  title: 'La fête des nouilles fait vendre des baguettes',
  event: 'La fête des nouilles a lieu le 20 octobre',
  sources: ['https://exemple.fr/fete-des-nouilles', 'https://exemple.jp/men-matsuri'],
  reasoning: ['La fête des nouilles approche', 'Les gens vont acheter des baguettes', 'Le fabricant de baguettes va vendre plus'],
  ticker: 'BAG.PA',
  assetName: 'Baguettes SA',
  whereToBuy: 'trade_republic',
  horizon: '2026-10-28',
  ...over,
});
const keep = (ticker: string) => ({ ticker, verdict: 'kept', reason: 'Personne n’en parle encore', pricedIn: 'Pas encore : le cours n’a pas bougé.', risk: 'La fête peut être annulée.' });
const drop = (ticker: string) => ({ ticker, verdict: 'dropped', reason: 'Déjà dans les prix', pricedIn: 'Oui : +20 % en 3 mois.', risk: 'Retournement.' });

const TIMEOUT: ExecResult = { stdout: '', stderr: 'TIMEOUT', exitCode: 124 };
const ALL_FAIL = { calendar: 'fail', international: 'fail', primary: 'fail', supply: 'fail' } as const;

function ok(structured: unknown): ExecResult {
  return { stdout: JSON.stringify({ is_error: false, result: 'ok', structured_output: structured }), stderr: '', exitCode: 0 };
}

const isReview = (args: string[]) => args.at(-1)!.includes('Tu es le critique');
const angleOf = (args: string[]): IdeaAngle => IDEA_ANGLES.find((a) => args.at(-1)!.includes(`Ton angle : ${a.label}.`))!.key;

type Script = { research?: Partial<Record<IdeaAngle, unknown[] | 'fail'>>; review?: unknown[] | 'fail' };

/** Faux `claude` : répond selon le prompt (chercheur d'un angle, ou critique), relu à chaque appel ; `gates` suspend une étape. */
function fakeClaude(script: Script, gates: { research?: Promise<void>; review?: Promise<void> } = {}) {
  return vi.fn<Exec>(async (args) => {
    if (isReview(args)) {
      await gates.review;
      return script.review === 'fail' ? TIMEOUT : ok({ reviews: script.review ?? [] });
    }
    await gates.research;
    const ideas = script.research?.[angleOf(args)] ?? [];
    return ideas === 'fail' ? TIMEOUT : ok({ ideas });
  });
}

function setup(exec: Exec) {
  const routes: Record<string, unknown> = {
    'chart/SXR8.DE': chart('SXR8.DE', 'EUR', [['2026-07-01', 650], ['2026-09-07', 690], ['2026-10-06', 700]], { date: '2026-10-07', price: 700 }),
    'chart/BAG.PA': chart('BAG.PA', 'EUR', [['2026-07-01', 10], ['2026-09-07', 11], ['2026-10-06', 11]], { date: '2026-10-07', price: 12 }),
    'chart/NOU.PA': chart('NOU.PA', 'EUR', [['2026-10-06', 30]], { date: '2026-10-07', price: 30 }),
    'chart/NOPE': { chart: { result: null, error: { code: 'Not Found' } } },
  };
  let now = new Date('2026-10-07T10:00:00Z');
  const runs: Promise<void>[] = [];
  const t = createTestApp('2026-10-07', {
    exec,
    investDeps: { fetch: fakeFetch(routes), now: () => now, onRunStarted: (done) => runs.push(done) },
  });
  const settle = () => Promise.all(runs);
  return {
    ...t,
    routes,
    moveTo: (iso: string) => {
      now = new Date(`${iso}T10:00:00Z`);
      t.setToday(iso);
    },
    settle,
    /** Lance une fournée, attend sa fin et renvoie son état. */
    runOnce: async (trigger: 'manual' | 'weekly' = 'manual') => {
      const r = await t.call('POST', '/api/invest/ideas/runs', { trigger });
      await settle();
      return (await t.call('GET', `/api/invest/ideas/runs/${r.body.run.id}`)).body;
    },
  };
}

describe('prompts', () => {
  it('chercheur : angle, positions et idées récentes', () => {
    const p = buildResearchPrompt({
      today: '2026-10-07',
      angle: 'supply',
      holdings: [{ name: 'S&P 500', ticker: 'SXR8.DE' }],
      recent: [{ title: 'Cuivre', ticker: 'HG=F', dropped: false }, { title: 'Riz', ticker: 'ZR=F', dropped: true }],
    });
    expect(p).toContain('Nous sommes le 2026-10-07');
    expect(p).toContain('Ton angle : Approvisionnement.');
    expect(p).toContain('fournisseur du fournisseur');
    expect(p).toContain('- S&P 500 (SXR8.DE)');
    expect(p).toContain('- Cuivre (HG=F)');
    expect(p).toContain('- Riz (ZR=F), écartée');
  });

  it('critique : pistes, sources et variations de cours', () => {
    const p = buildReviewPrompt({
      today: '2026-10-07',
      bench: { perf1m: 0.01, perf3m: null },
      candidates: [{ ...idea(), market: { perf1m: -0.032, perf3m: 0.2 } }],
    });
    expect(p).toContain('Tu es le critique');
    expect(p).toContain('### BAG.PA - Baguettes SA');
    expect(p).toContain('- https://exemple.jp/men-matsuri');
    expect(p).toContain('Cours : -3,2 % sur 1 mois, +20,0 % sur 3 mois.');
    expect(p).toContain('S&P 500 : +1,0 % sur 1 mois, inconnue sur 3 mois.');
  });
});

describe('fournées d’idées', () => {
  it('passe les pistes de tous les chercheurs au critique et n’affiche que les retenues', async () => {
    const exec = fakeClaude({
      research: { calendar: [idea()], international: [idea({ ticker: 'NOU.PA', assetName: 'Nouilles SA' })] },
      review: [keep('BAG.PA'), drop('NOU.PA')],
    });
    const t = setup(exec);
    const r = await t.call('POST', '/api/invest/ideas/runs', { trigger: 'manual' });
    expect(r).toMatchObject({ status: 202, body: { started: true, run: { status: 'running', phase: 'research' } } });
    await t.settle();

    expect(exec).toHaveBeenCalledTimes(5);
    const [researchArgs, researchTimeout] = exec.mock.calls.find(([a]) => !isReview(a))!;
    expect(researchArgs.slice(0, 5)).toEqual(['-p', '--tools', 'WebSearch,WebFetch', '--allowedTools', 'WebSearch,WebFetch']);
    expect(researchArgs).toContain('--json-schema');
    expect(researchTimeout).toBe(600_000);
    const [reviewArgs, reviewTimeout] = exec.mock.calls.find(([a]) => isReview(a))!;
    expect(reviewTimeout).toBe(900_000);
    expect(reviewArgs.at(-1)).toContain('Cours : +9,1 % sur 1 mois, +20,0 % sur 3 mois.');

    const run = await t.call('GET', `/api/invest/ideas/runs/${r.body.run.id}`);
    expect(run.body).toMatchObject({ status: 'done', phase: null, acceptedCount: 1, candidateCount: 2, failedAngles: [] });
    expect(run.body.rejected).toEqual([{ ticker: 'NOU.PA', reason: 'Déjà dans les prix' }]);

    const view = await t.call('GET', '/api/invest/ideas');
    expect(view.body.open).toHaveLength(1);
    expect(view.body.open[0]).toMatchObject({
      ticker: 'BAG.PA',
      startPriceEur: 12,
      sources: idea().sources,
      pricedIn: 'Pas encore : le cours n’a pas bougé.',
      risk: 'La fête peut être annulée.',
    });
    expect(view.body.open[0].marketContext.perf3m).toBeCloseTo(0.2);
    expect(view.body.open[0].marketContext.benchPerf3m).toBeCloseTo(700 / 650 - 1);

    const dropped = listIdeas(t.db).find((i) => i.ticker === 'NOU.PA')!;
    expect(dropped).toMatchObject({ verdict: 'dropped', critique: 'Déjà dans les prix', angle: 'international', perf3m: null });
  });

  it('continue sans un chercheur en échec et le signale', async () => {
    const t = setup(fakeClaude({ research: { calendar: [idea()], supply: 'fail' }, review: [keep('BAG.PA')] }));
    const run = await t.runOnce();
    expect(run).toMatchObject({ status: 'done', acceptedCount: 1, failedAngles: [{ key: 'supply', label: 'Approvisionnement' }] });
  });

  it('échoue si tous les chercheurs échouent, sans appeler le critique', async () => {
    const exec = fakeClaude({ research: { ...ALL_FAIL } });
    const t = setup(exec);
    const run = await t.runOnce();
    expect(run).toMatchObject({ status: 'failed', phase: null, error: 'Claude a mis trop de temps à répondre' });
    expect(exec.mock.calls.some(([a]) => isReview(a))).toBe(false);
  });

  it('échoue sans rien enregistrer si le critique échoue', async () => {
    const t = setup(fakeClaude({ research: { calendar: [idea()] }, review: 'fail' }));
    const run = await t.runOnce();
    expect(run).toMatchObject({ status: 'failed', error: 'Claude a mis trop de temps à répondre' });
    expect(listIdeas(t.db)).toEqual([]);
  });

  it('se termine sans idée quand le critique écarte tout', async () => {
    const t = setup(fakeClaude({ research: { calendar: [idea()] }, review: [drop('BAG.PA')] }));
    const run = await t.runOnce();
    expect(run).toMatchObject({ status: 'done', acceptedCount: 0, candidateCount: 1 });
    expect((await t.call('GET', '/api/invest/ideas')).body.open).toEqual([]);
  });

  it('n’appelle pas le critique quand aucune piste ne passe les filtres', async () => {
    const exec = fakeClaude({ research: { calendar: [idea({ ticker: 'NOPE' }), { ticker: 'X' }] } });
    const t = setup(exec);
    const run = await t.runOnce();
    expect(run).toMatchObject({ status: 'done', acceptedCount: 0, candidateCount: 2 });
    expect(run.rejected).toEqual([
      { ticker: 'NOPE', reason: 'Ticker introuvable chez Yahoo' },
      { ticker: 'X', reason: 'Format invalide' },
    ]);
    expect(exec).toHaveBeenCalledTimes(4);
  });

  it('écarte une piste sans verdict et ignore un verdict sur un actif non soumis', async () => {
    const t = setup(fakeClaude({ research: { calendar: [idea()] }, review: [keep('ZZZ')] }));
    const run = await t.runOnce();
    expect(run).toMatchObject({ acceptedCount: 0, rejected: [{ ticker: 'BAG.PA', reason: 'Non évaluée par le critique' }] });
    expect(listIdeas(t.db)[0]).toMatchObject({ verdict: 'dropped', critique: 'Non évaluée par le critique', pricedIn: '', risk: null });
  });

  it('dédoublonne entre chercheurs ; une écartée ouverte ne bloque pas l’actif, une retenue si', async () => {
    const script: Script = { research: { calendar: [idea()], primary: [idea({ title: 'Autre angle' })] }, review: [drop('BAG.PA')] };
    const t = setup(fakeClaude(script));
    expect((await t.runOnce()).rejected).toEqual([
      { ticker: 'BAG.PA', reason: 'Doublon' },
      { ticker: 'BAG.PA', reason: 'Déjà dans les prix' },
    ]);

    script.review = [keep('BAG.PA')];
    expect(await t.runOnce()).toMatchObject({ acceptedCount: 1 });

    expect((await t.runOnce()).rejected).toContainEqual({ ticker: 'BAG.PA', reason: 'Idée déjà en cours sur cet actif' });
  });

  it('suit la phase de la fournée', async () => {
    let openResearch!: () => void;
    let openReview!: () => void;
    const research = new Promise<void>((r) => (openResearch = r));
    const review = new Promise<void>((r) => (openReview = r));
    const t = setup(fakeClaude({ research: { calendar: [idea()] }, review: [keep('BAG.PA')] }, { research, review }));
    const r = await t.call('POST', '/api/invest/ideas/runs', { trigger: 'manual' });
    const phase = async () => (await t.call('GET', `/api/invest/ideas/runs/${r.body.run.id}`)).body.phase;

    expect(await phase()).toBe('research');
    openResearch();
    await vi.waitFor(async () => expect(await phase()).toBe('review'));
    openReview();
    await t.settle();
    expect(await phase()).toBeNull();
  });

  it('ne relance pas la fournée hebdomadaire avant 7 jours, ni deux fournées à la fois', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const t = setup(fakeClaude({ research: { calendar: [idea()] }, review: [keep('BAG.PA')] }, { research: gate }));
    const first = await t.call('POST', '/api/invest/ideas/runs', { trigger: 'manual' });
    const second = await t.call('POST', '/api/invest/ideas/runs', { trigger: 'manual' });
    expect(second).toMatchObject({ status: 200, body: { started: false, run: { id: first.body.run.id, status: 'running' } } });
    release();
    await t.settle();

    expect(await t.call('POST', '/api/invest/ideas/runs', { trigger: 'weekly' })).toMatchObject({ status: 200, body: { started: false } });
    t.moveTo('2026-10-15');
    expect(await t.call('POST', '/api/invest/ideas/runs', { trigger: 'weekly' })).toMatchObject({ status: 202, body: { started: true } });
    await t.settle();
  });

  it('attend 24 h après un échec hebdomadaire et refuse un lien non http', async () => {
    const script: Script = { research: { ...ALL_FAIL } };
    const t = setup(fakeClaude(script));
    await t.runOnce('weekly');
    expect(await t.call('POST', '/api/invest/ideas/runs', { trigger: 'weekly' })).toMatchObject({ status: 200, body: { started: false, run: { status: 'failed' } } });

    script.research = { calendar: [idea(), idea({ ticker: 'SXR8.DE', sources: ['javascript:alert(1)'] })] };
    script.review = [keep('BAG.PA')];
    t.moveTo('2026-10-08');
    const run = await t.runOnce('weekly');
    expect(run).toMatchObject({ status: 'done', acceptedCount: 1, rejected: [{ ticker: 'SXR8.DE', reason: 'Format invalide' }] });
  });

  it('clôt retenues et écartées à l’horizon et compare le tri au S&P 500', async () => {
    const t = setup(
      fakeClaude({
        research: { calendar: [idea()], international: [idea({ ticker: 'NOU.PA', assetName: 'Nouilles SA' })] },
        review: [keep('BAG.PA'), drop('NOU.PA')],
      }),
    );
    await t.runOnce();

    t.routes['chart/SXR8.DE'] = chart('SXR8.DE', 'EUR', [['2026-10-06', 700], ['2026-10-28', 735], ['2026-11-02', 740]]);
    t.routes['chart/BAG.PA'] = chart('BAG.PA', 'EUR', [['2026-10-06', 11], ['2026-10-28', 15], ['2026-11-02', 9]]);
    t.routes['chart/NOU.PA'] = chart('NOU.PA', 'EUR', [['2026-10-06', 30], ['2026-10-28', 33], ['2026-11-02', 30]]);
    t.moveTo('2026-11-02');
    const view = await t.call('GET', '/api/invest/ideas');
    expect(view.body.open).toEqual([]);
    expect(view.body.closed).toHaveLength(1);
    expect(view.body.closed[0]).toMatchObject({ ticker: 'BAG.PA', status: 'closed', priceDate: '2026-10-28' });
    expect(view.body.closed[0].return).toBeCloseTo(0.25);
    expect(view.body.summary).toMatchObject({ closedCount: 1, beatCount: 1, hundredEach: { invested: 100_00, ideas: 125_00, bench: 105_00 } });
    expect(view.body.summary.filter).toMatchObject({ keptCount: 1, droppedCount: 1 });
    expect(view.body.summary.filter.keptAvgExcess).toBeCloseTo(0.2);
    expect(view.body.summary.filter.droppedAvgExcess).toBeCloseTo(0.05);
  });

  it('ne clôt pas une idée tant que les cours de l’horizon sont périmés', async () => {
    const t = setup(fakeClaude({ research: { calendar: [idea()] }, review: [keep('BAG.PA')] }));
    await t.runOnce();

    t.routes['chart/SXR8.DE'] = new Error('réseau');
    t.routes['chart/BAG.PA'] = new Error('réseau');
    t.moveTo('2026-11-02');
    const view = await t.call('GET', '/api/invest/ideas');
    expect(view.body.closed).toEqual([]);
    expect(view.body.open).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run server/test/ideas.test.ts`
Expected: FAIL, `../src/services/idea-prompts` introuvable.

- [ ] **Step 4: Prompts et schémas imposés à Claude**

Créer `server/src/services/idea-prompts.ts` :

```ts
import type { ISODate } from '@shared/dates';
import { IDEA_ANGLES, platforms, type IdeaAngle } from '@shared/invest';
import type { IdeaCandidate } from '@shared/schemas';

/** Variations de cours en fraction, null si l'historique ne remonte pas assez loin. */
export type MarketFacts = { perf1m: number | null; perf3m: number | null };

const ANGLE_FOCUS: Record<IdeaAngle, string> = {
  calendar:
    'Cherche les événements datés des semaines et mois à venir : sorties de produits, décisions réglementaires, salons, compétitions sportives, fêtes, saisons, publications de résultats, échéances politiques.',
  international:
    "Lis la presse étrangère hors anglophone dans sa langue (japonaise, coréenne, chinoise, taïwanaise, indienne, allemande, italienne, espagnole, nordique...) et cherche les sujets que la presse financière américaine n'a pas encore repris.",
  primary:
    "Va aux sources primaires plutôt qu'à la presse : communiqués d'entreprises, régulateurs (FDA, EMA, Commission européenne, autorités de la concurrence), appels d'offres publics, brevets, publications officielles et statistiques.",
  supply:
    "Suis les pénuries, les matières premières, la météo, la logistique et l'énergie, et remonte les chaînes d'approvisionnement jusqu'aux effets de second ordre : le fournisseur du fournisseur, le seul fabricant d'un composant critique.",
};

/** Schémas imposés à Claude, écrits à la main comme celui du tri (`--json-schema` refuse les schémas zod). */
export const researchJsonSchema = {
  type: 'object',
  properties: {
    ideas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          event: { type: 'string' },
          sources: { type: 'array', items: { type: 'string' } },
          reasoning: { type: 'array', items: { type: 'string' } },
          ticker: { type: 'string' },
          assetName: { type: 'string' },
          whereToBuy: { type: 'string', enum: [...platforms] },
          horizon: { type: 'string' },
        },
        required: ['title', 'event', 'sources', 'reasoning', 'ticker', 'assetName', 'whereToBuy', 'horizon'],
      },
    },
  },
  required: ['ideas'],
};

export const reviewJsonSchema = {
  type: 'object',
  properties: {
    reviews: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ticker: { type: 'string' },
          verdict: { type: 'string', enum: ['kept', 'dropped'] },
          reason: { type: 'string' },
          pricedIn: { type: 'string' },
          risk: { type: 'string' },
        },
        required: ['ticker', 'verdict', 'reason', 'pricedIn', 'risk'],
      },
    },
  },
  required: ['reviews'],
};

export function buildResearchPrompt(input: {
  today: ISODate;
  angle: IdeaAngle;
  holdings: { name: string; ticker: string }[];
  recent: { title: string; ticker: string; dropped: boolean }[];
}): string {
  const label = IDEA_ANGLES.find((a) => a.key === input.angle)!.label;
  const holdings = input.holdings.length ? input.holdings.map((h) => `- ${h.name} (${h.ticker})`).join('\n') : '(aucune)';
  const recent = input.recent.length ? input.recent.map((i) => `- ${i.title} (${i.ticker})${i.dropped ? ', écartée' : ''}`).join('\n') : '(aucune)';
  return `Nous sommes le ${input.today}. Tu es l'un des quatre chercheurs qui aident un particulier français à trouver des idées d'investissement tirées de l'actualité.
Ton angle : ${label}. ${ANGLE_FOCUS[input.angle]}

Positions déjà détenues :
${holdings}

Idées déjà étudiées ces 4 dernières semaines :
${recent}

Consignes :
- Cherche sur le web (WebSearch) et lis les pages en entier (WebFetch) avant de t'appuyer dessus. Ne cite que des pages que tu as réellement lues.
- Propose 2 à 4 pistes. Ne te censure pas : un critique indépendant les passera ensuite au crible, ton travail est de trouver de la matière.
- Chaque piste part d'un événement précis. Mets dans "sources" les URL de toutes les pages lues qui l'appuient (au moins une).
- Cherche le bénéficiaire le moins évident : le fournisseur, le sous-traitant, le concurrent qui en profite, plutôt que le nom auquel tout le monde pense déjà.
- La déduction tient en 2 ou 3 étapes simples dans "reasoning", du type : "La fête des nouilles approche" → "Les gens vont acheter des baguettes" → "Le fabricant de baguettes va vendre plus".
- Vise un actif coté précis et donne son ticker Yahoo Finance exact, avec le suffixe de place : .PA (Paris), .DE (Xetra), .AS (Amsterdam), .L (Londres), .T (Tokyo), .KS (Séoul), rien pour les actions américaines, -EUR pour une crypto (BTC-EUR), =F pour un contrat à terme (GC=F).
- "horizon" : la date (YYYY-MM-DD) à laquelle juger l'idée, entre 7 jours et 1 an après aujourd'hui.
- "whereToBuy" : "trade_republic" pour les actions et ETF européens et américains, "binance" pour les cryptos, sinon "other".
- "title" : une phrase courte qui résume l'idée.
- Ne repropose ni un actif déjà détenu ni une idée déjà étudiée, sauf si un événement nouveau change la donne.
- Réponds uniquement avec le JSON demandé.`;
}

/** Variation en texte pour le critique : « +12,3 % », ou « inconnue ». */
export function pctText(n: number | null): string {
  if (n === null) return 'inconnue';
  const v = (Math.round(n * 1000) / 10).toFixed(1).replace('.', ',');
  return `${n > 0 ? '+' : ''}${v} %`;
}

const factsLine = (m: MarketFacts) => `${pctText(m.perf1m)} sur 1 mois, ${pctText(m.perf3m)} sur 3 mois.`;

export function buildReviewPrompt(input: {
  today: ISODate;
  bench: MarketFacts;
  candidates: (Pick<IdeaCandidate, 'ticker' | 'assetName' | 'title' | 'event' | 'sources' | 'reasoning' | 'horizon'> & { market: MarketFacts })[];
}): string {
  const pistes = input.candidates
    .map(
      (c) => `### ${c.ticker} - ${c.assetName}
Titre : ${c.title}
Événement : ${c.event}
Sources :
${c.sources.map((s) => `- ${s}`).join('\n')}
Déduction :
${c.reasoning.map((s, i) => `${i + 1}. ${s}`).join('\n')}
Horizon : ${c.horizon}
Cours : ${factsLine(c.market)}`,
    )
    .join('\n\n');
  return `Nous sommes le ${input.today}. Tu es le critique. Des chercheurs ont proposé des pistes d'investissement tirées de l'actualité à un particulier français. Ton rôle est de le protéger des mauvaises idées, pas de lui en trouver de bonnes.

Référence, S&P 500 : ${factsLine(input.bench)}

Pistes :

${pistes}

Consignes :
- Pour chaque piste, cherche activement pourquoi elle est mauvaise : information déjà largement reprise par la presse financière, cours qui a déjà bougé, effet trop petit par rapport à la taille de l'entreprise, déduction fragile, source douteuse ou mal lue.
- Vérifie les sources toi-même (WebFetch) et cherche si l'information circule déjà largement (WebSearch).
- "verdict" : "kept" seulement s'il y a une vraie raison de penser que le marché n'a pas encore intégré l'événement et que l'effet sur l'actif peut être sensible d'ici l'horizon. Sinon "dropped". Dans le doute, "dropped".
- Ne retenir aucune piste est une réponse normale et fréquente.
- "reason" : la raison principale du verdict, en une phrase.
- "pricedIn" : le marché a-t-il déjà intégré l'événement dans le cours ? Une ou deux phrases, en t'appuyant sur les variations de cours ci-dessus.
- "risk" : ce qui peut le plus probablement faire perdre de l'argent sur cette piste, en une phrase.
- Rends un verdict pour chaque piste, avec son ticker exact.
- Réponds uniquement avec le JSON demandé.`;
}
```

Note : la ligne de référence du critique s'écrit `Référence, S&P 500 : ...`. Le test attend `S&P 500 : +1,0 % sur 1 mois, inconnue sur 3 mois.`, qui en est une sous-chaîne.

- [ ] **Step 5: Pipeline**

Dans `server/src/services/ideas.ts` :
- supprimer `IDEAS_TIMEOUT_MS`, `ideasJsonSchema` et `buildIdeasPrompt` ;
- remplacer les imports et constantes de tête par :

```ts
import { filterSummary, ideasSummary, simpleReturn, trailingReturn } from '@core/invest';
import type { IdeaRunStart, IdeaRunView, IdeasView, IdeaView } from '@shared/api-types';
import { addDays, compareISODate, daysBetween, toISODate, type ISODate } from '@shared/dates';
import { BENCHMARK_TICKER, IDEA_ANGLES, type IdeaAngle } from '@shared/invest';
import { ideaBatchSchema, ideaCandidateSchema, ideaReviewBatchSchema, ideaReviewSchema, type IdeaCandidate, type IdeaReview } from '@shared/schemas';
import type { Db } from '../db/client';
import { listHoldings } from '../repos/invest';
import {
  closeIdea,
  createRun,
  finishRun,
  insertIdea,
  lastSuccessfulRun,
  latestRun,
  listIdeas,
  runningRun,
  setRunPhase,
  type IdeaRow,
  type IdeaRunRow,
} from '../repos/ideas';
import { ClaudeError, execClaude, runClaude, type Exec } from './claude';
import { buildResearchPrompt, buildReviewPrompt, researchJsonSchema, reviewJsonSchema, type MarketFacts } from './idea-prompts';
import type { Prices } from './prices';

export const RESEARCH_TIMEOUT_MS = 600_000;
export const REVIEW_TIMEOUT_MS = 900_000;
export const WEEK_DAYS = 7;
export const NOT_REVIEWED = 'Non évaluée par le critique';
const RECENT_DAYS = 28;
const MIN_HORIZON_DAYS = 7;
const MAX_HORIZON_DAYS = 366;
/** Historique demandé pour la variation sur 3 mois, avec une marge pour les jours sans cotation. */
const HISTORY_DAYS = 100;
/** Après une fournée hebdomadaire en échec, on attend ce délai avant de relancer Claude tout seul. */
const RETRY_AFTER_FAILURE_HOURS = 24;
/** Une clôture plus ancienne que ce nombre de jours avant l'horizon ne suffit pas à juger une idée. */
const CLOSE_TOLERANCE_DAYS = 7;
const WEB_TOOLS = 'WebSearch,WebFetch';

export type IdeasDeps = { exec?: Exec; prices: Prices; now?: () => Date; model?: string };

type Rejection = { ticker: string; reason: string };
type Proposed = { angle: IdeaAngle; raw: unknown };
/** Piste qui a passé les filtres du serveur, en attente du critique. */
type Pending = { angle: IdeaAngle; candidate: IdeaCandidate; priceEur: number; market: MarketFacts };
```

- garder `toRunView`, `todayOf` et `startIdeaRun` tels quels ;
- remplacer `execute` par :

```ts
async function execute(db: Db, deps: IdeasDeps, runId: number, today: ISODate): Promise<void> {
  const now = deps.now ?? (() => new Date());
  // La référence d'abord : sans elle, inutile de faire chercher Claude pendant plusieurs minutes.
  const bench = await deps.prices.quoteEur(BENCHMARK_TICKER);
  if (!bench) throw new ClaudeError('Cours du S&P 500 indisponible', 'benchmark_unavailable');

  const { proposed, failedAngles } = await research(db, deps, today);
  const { pending, rejected } = await screen(db, deps.prices, proposed, today);

  let reviews = new Map<string, IdeaReview>();
  let benchMarket: MarketFacts = { perf1m: null, perf3m: null };
  if (pending.length > 0) {
    benchMarket = await marketFacts(deps.prices, BENCHMARK_TICKER, today);
    setRunPhase(db, runId, 'review');
    reviews = await review(deps, today, pending, benchMarket);
  }

  db.transaction((tx) => {
    const t = tx as unknown as Db;
    let kept = 0;
    for (const p of pending) {
      const r = reviews.get(p.candidate.ticker);
      if (r?.verdict === 'kept') kept++;
      else rejected.push({ ticker: p.candidate.ticker, reason: r?.reason ?? NOT_REVIEWED });
      insertIdea(t, runId, today, {
        ...p.candidate,
        angle: p.angle,
        verdict: r?.verdict ?? 'dropped',
        critique: r?.reason ?? NOT_REVIEWED,
        pricedIn: r?.pricedIn ?? '',
        risk: r?.risk ?? null,
        perf1m: p.market.perf1m,
        perf3m: p.market.perf3m,
        benchPerf1m: benchMarket.perf1m,
        benchPerf3m: benchMarket.perf3m,
        startPriceEur: p.priceEur,
        benchStartPriceEur: bench.eur,
      });
    }
    finishRun(t, runId, { status: 'done', finishedAt: now().toISOString(), acceptedCount: kept, candidateCount: proposed.length, failedAngles, rejected });
  });
}

const invalidOutput = () => new ClaudeError('Réponse de Claude invalide (format inattendu)', 'claude_invalid_output');

function claudeArgs(deps: IdeasDeps, schema: object, prompt: string): string[] {
  const args = ['-p', '--tools', WEB_TOOLS, '--allowedTools', WEB_TOOLS, '--output-format', 'json', '--json-schema', JSON.stringify(schema)];
  if (deps.model) args.push('--model', deps.model);
  args.push(prompt);
  return args;
}

/** Lance les quatre chercheurs en parallèle ; la fournée n'échoue que si aucun n'a répondu. */
async function research(db: Db, deps: IdeasDeps, today: ISODate): Promise<{ proposed: Proposed[]; failedAngles: IdeaAngle[] }> {
  const context = {
    today,
    holdings: listHoldings(db).map(({ name, ticker }) => ({ name, ticker })),
    recent: listIdeas(db, { since: addDays(today, -RECENT_DAYS) }).map(({ title, ticker, verdict }) => ({ title, ticker, dropped: verdict === 'dropped' })),
  };
  const results = await Promise.allSettled(
    IDEA_ANGLES.map(async ({ key }) => {
      const out = await runClaude(claudeArgs(deps, researchJsonSchema, buildResearchPrompt({ ...context, angle: key })), RESEARCH_TIMEOUT_MS, deps.exec ?? execClaude);
      const batch = ideaBatchSchema.safeParse(out);
      if (!batch.success) throw invalidOutput();
      return batch.data.ideas.map((raw): Proposed => ({ angle: key, raw }));
    }),
  );
  const proposed: Proposed[] = [];
  const failedAngles: IdeaAngle[] = [];
  let firstError: unknown = undefined;
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') proposed.push(...r.value);
    else {
      failedAngles.push(IDEA_ANGLES[i]!.key);
      firstError ??= r.reason;
    }
  });
  if (failedAngles.length === IDEA_ANGLES.length) throw firstError;
  return { proposed, failedAngles };
}

/** Filtres du serveur (format, horizon, doublon, déjà détenu, déjà ouverte, ticker connu) et faits de marché. */
async function screen(db: Db, prices: Prices, proposed: Proposed[], today: ISODate): Promise<{ pending: Pending[]; rejected: Rejection[] }> {
  const rejected: Rejection[] = [];
  const pending: Pending[] = [];
  const held = new Set(listHoldings(db).map((h) => h.ticker));
  // Une écartée encore ouverte ne bloque pas : seule une idée affichée occupe l'actif.
  const open = new Set(listIdeas(db, { status: 'open', shown: true }).map((i) => i.ticker));
  const seen = new Set<string>();
  for (const { angle, raw } of proposed) {
    const parsed = ideaCandidateSchema.safeParse(raw);
    const rawTicker = (raw as { ticker?: unknown } | null)?.ticker;
    if (!parsed.success) {
      rejected.push({ ticker: typeof rawTicker === 'string' ? rawTicker : '?', reason: 'Format invalide' });
      continue;
    }
    const c = parsed.data;
    if (compareISODate(c.horizon, addDays(today, MIN_HORIZON_DAYS)) < 0 || compareISODate(c.horizon, addDays(today, MAX_HORIZON_DAYS)) > 0) {
      rejected.push({ ticker: c.ticker, reason: 'Horizon hors limites' });
      continue;
    }
    if (seen.has(c.ticker)) {
      rejected.push({ ticker: c.ticker, reason: 'Doublon' });
      continue;
    }
    if (held.has(c.ticker)) {
      rejected.push({ ticker: c.ticker, reason: 'Déjà détenu' });
      continue;
    }
    if (open.has(c.ticker)) {
      rejected.push({ ticker: c.ticker, reason: 'Idée déjà en cours sur cet actif' });
      continue;
    }
    seen.add(c.ticker);
    const quote = await prices.quoteEur(c.ticker);
    if (!quote) {
      rejected.push({ ticker: c.ticker, reason: 'Ticker introuvable chez Yahoo' });
      continue;
    }
    pending.push({ angle, candidate: c, priceEur: quote.eur, market: await marketFacts(prices, c.ticker, today) });
  }
  return { pending, rejected };
}

async function marketFacts(prices: Prices, ticker: string, today: ISODate): Promise<MarketFacts> {
  const h = await prices.historyEur(ticker, addDays(today, -HISTORY_DAYS));
  if (!h) return { perf1m: null, perf3m: null };
  return { perf1m: trailingReturn(h.closesEur, today, 30), perf3m: trailingReturn(h.closesEur, today, 91) };
}

/** Le critique rend un verdict par piste ; un verdict illisible ou sur un actif non soumis est ignoré. */
async function review(deps: IdeasDeps, today: ISODate, pending: Pending[], bench: MarketFacts): Promise<Map<string, IdeaReview>> {
  const prompt = buildReviewPrompt({ today, bench, candidates: pending.map((p) => ({ ...p.candidate, market: p.market })) });
  const out = await runClaude(claudeArgs(deps, reviewJsonSchema, prompt), REVIEW_TIMEOUT_MS, deps.exec ?? execClaude);
  const batch = ideaReviewBatchSchema.safeParse(out);
  if (!batch.success) throw invalidOutput();
  const submitted = new Set(pending.map((p) => p.candidate.ticker));
  const reviews = new Map<string, IdeaReview>();
  for (const raw of batch.data.reviews) {
    const r = ideaReviewSchema.safeParse(raw);
    if (r.success && submitted.has(r.data.ticker) && !reviews.has(r.data.ticker)) reviews.set(r.data.ticker, r.data);
  }
  return reviews;
}
```

- garder `closeDueIdeas`, `toView` et `buildIdeasView` tels qu'à la fin de la tâche 2.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run server/test/ideas.test.ts`
Expected: PASS.

- [ ] **Step 7: Full verification and commit**

Run: `npm test && npm run typecheck && npm run lint`
Expected: tout au vert.

```bash
git add shared/schemas.ts server/src/services/idea-prompts.ts server/src/services/ideas.ts server/test/ideas.test.ts
git commit -m "feat(server): quatre chercheurs en parallèle puis un critique qui ne garde que les idées prometteuses"
```

---

### Task 4: Écran Idées (carte, fournée en cours, rapport, Bilan)

**Files:**
- Modify: `client/src/lib/invest.ts`, `client/src/lib/invest.test.ts`
- Modify: `client/src/components/invest/IdeaCard.tsx`, `client/src/components/invest/IdeaCard.test.tsx`
- Modify: `client/src/components/invest/IdeasSection.tsx`
- Modify: `client/src/components/invest/IdeasScore.tsx`
- Create: `client/src/components/invest/IdeasScore.test.tsx`
- Modify: `client/src/components/invest/Ideas.module.css`

**Interfaces:**
- Consumes: `IdeaView` (`sources`, `risk`, `marketContext`), `IdeaRunView` (`phase`, `candidateCount`, `failedAngles`), `IdeasSummary.filter` (tâche 2) ; `IDEA_ANGLES` ; `plural` de `client/src/lib/format.ts`.
- Produces dans `client/src/lib/invest.ts` :
  - `formatMarketContext(m: { perf3m: number; benchPerf3m: number }): string`
  - `runOutcome(run: { acceptedCount: number; candidateCount: number }): string`
  - `failedAnglesText(angles: { label: string }[]): string`

- [ ] **Step 1: Write the failing tests (formatage)**

Dans `client/src/lib/invest.test.ts`, ajouter `failedAnglesText`, `formatMarketContext` et `runOutcome` à l'import et, dans le `describe` :

```ts
  it('formatMarketContext', () => {
    expect(formatMarketContext({ perf3m: 0.18, benchPerf3m: 0.04 })).toBe('+18,0 % sur 3 mois (S&P 500 +4,0 %)');
    expect(formatMarketContext({ perf3m: -0.052, benchPerf3m: 0.01 })).toBe('-5,2 % sur 3 mois (S&P 500 +1,0 %)');
  });
  it('runOutcome', () => {
    expect(runOutcome({ acceptedCount: 2, candidateCount: 9 })).toBe('2 idées retenues sur 9 pistes');
    expect(runOutcome({ acceptedCount: 1, candidateCount: 1 })).toBe('1 idée retenue sur 1 piste');
    expect(runOutcome({ acceptedCount: 0, candidateCount: 9 })).toBe('Rien de convaincant cette semaine · 9 pistes écartées');
    expect(runOutcome({ acceptedCount: 0, candidateCount: 1 })).toBe('Rien de convaincant cette semaine · 1 piste écartée');
    expect(runOutcome({ acceptedCount: 0, candidateCount: 0 })).toBe('Aucune piste trouvée');
  });
  it('failedAnglesText', () => {
    expect(failedAnglesText([{ label: 'International' }])).toBe('Le chercheur International n’a pas répondu.');
    expect(failedAnglesText([{ label: 'International' }, { label: 'Calendrier' }])).toBe('Les chercheurs International et Calendrier n’ont pas répondu.');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run client/src/lib/invest.test.ts`
Expected: FAIL, fonctions absentes.

- [ ] **Step 3: Implement**

À la fin de `client/src/lib/invest.ts` (ajouter `import { plural } from './format';` en tête) :

```ts
/** « +18,0 % sur 3 mois (S&P 500 +4,0 %) » : ce que le cours avait déjà fait quand l'idée a été proposée. */
export function formatMarketContext(m: { perf3m: number; benchPerf3m: number }): string {
  return `${formatPct(m.perf3m, { signed: true })} sur 3 mois (S&P 500 ${formatPct(m.benchPerf3m, { signed: true })})`;
}

/** Résultat d'une fournée en une ligne. */
export function runOutcome(run: { acceptedCount: number; candidateCount: number }): string {
  if (run.candidateCount === 0) return 'Aucune piste trouvée';
  const pistes = plural(run.candidateCount, 'piste');
  if (run.acceptedCount === 0) return `Rien de convaincant cette semaine · ${pistes} ${run.candidateCount > 1 ? 'écartées' : 'écartée'}`;
  return `${plural(run.acceptedCount, 'idée retenue', 'idées retenues')} sur ${pistes}`;
}

export function failedAnglesText(angles: { label: string }[]): string {
  const names = new Intl.ListFormat('fr', { type: 'conjunction' }).format(angles.map((a) => a.label));
  return angles.length > 1 ? `Les chercheurs ${names} n’ont pas répondu.` : `Le chercheur ${names} n’a pas répondu.`;
}
```

Run: `npx vitest run client/src/lib/invest.test.ts`
Expected: PASS.

- [ ] **Step 4: Write the failing component tests**

Dans `client/src/components/invest/IdeaCard.test.tsx`, ajouter :

```ts
  it('montre le risque et ce que le cours avait déjà fait', () => {
    render(<IdeaCard idea={{ ...open, risk: 'La fête peut être annulée.', marketContext: { perf3m: 0.18, benchPerf3m: 0.04 } }} />);
    expect(screen.getByText('Ce qui peut mal tourner')).toBeInTheDocument();
    expect(screen.getByText(/La fête peut être annulée\./)).toBeInTheDocument();
    expect(screen.getByText('+18,0 % sur 3 mois (S&P 500 +4,0 %)')).toBeInTheDocument();
  });

  it('une idée d’avant la critique n’a ni risque ni contexte de marché', () => {
    render(<IdeaCard idea={open} />);
    expect(screen.queryByText('Ce qui peut mal tourner')).not.toBeInTheDocument();
    expect(screen.queryByText(/sur 3 mois/)).not.toBeInTheDocument();
  });
```

Créer `client/src/components/invest/IdeasScore.test.tsx` :

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { IdeasSummary } from '@shared/api-types';
import { IdeasScore } from './IdeasScore';

const summary: IdeasSummary = {
  closedCount: 3,
  beatCount: 2,
  avgExcess: 0.04,
  hundredEach: { invested: 300_00, ideas: 315_00, bench: 303_00 },
  filter: null,
};

describe('IdeasScore', () => {
  it('sans écartée close, pas de comparaison du tri', () => {
    render(<IdeasScore summary={summary} />);
    expect(screen.queryByText(/tri de Claude/)).not.toBeInTheDocument();
  });

  it('compare retenues et écartées', () => {
    const { rerender } = render(<IdeasScore summary={{ ...summary, filter: { keptCount: 3, keptAvgExcess: 0.04, droppedCount: 5, droppedAvgExcess: -0.01 } }} />);
    expect(screen.getByText(/les retenues ont fait/)).toHaveTextContent(
      'Face au S&P 500, les retenues ont fait +4,0 % en moyenne (3 idées), les écartées -1,0 % (5 idées). Le tri de Claude aide.',
    );
    rerender(<IdeasScore summary={{ ...summary, filter: { keptCount: 1, keptAvgExcess: -0.02, droppedCount: 1, droppedAvgExcess: 0.03 } }} />);
    expect(screen.getByText(/les retenues ont fait/)).toHaveTextContent('(1 idée)');
    expect(screen.getByText(/les retenues ont fait/)).toHaveTextContent('Le tri de Claude n’aide pas encore.');
  });
});
```

Run: `npx vitest run client/src/components/invest`
Expected: FAIL sur les nouveaux tests.

- [ ] **Step 5: Carte d'idée**

Dans `client/src/components/invest/IdeaCard.tsx`, importer `formatMarketContext` depuis `@/lib/invest`.
Juste après le bloc `.asset` (le `</div>` qui ferme `styles.asset`), ajouter :

```tsx
      {idea.marketContext ? <p className={styles.market}>{formatMarketContext(idea.marketContext)}</p> : null}
```

Juste après le paragraphe « Déjà dans les prix ? », ajouter :

```tsx
      {idea.risk ? (
        <p className={styles.pricedIn}>
          <span className={styles.pricedInLabel}>Ce qui peut mal tourner</span> {idea.risk}
        </p>
      ) : null}
```

Dans `client/src/components/invest/Ideas.module.css`, après la règle `.where` :

```css
/* Ce que le cours avait déjà fait, rangé sous l'actif */
.market {
  margin-top: calc(-1 * var(--s-2));
  font-size: var(--text-xs);
  color: var(--ink-mute);
}
```

- [ ] **Step 6: Bilan**

Dans `client/src/components/invest/IdeasScore.tsx`, importer `plural` depuis `@/lib/format`, puis ajouter après le second `<p className={styles.scoreLine}>` :

```tsx
      {summary.filter ? (
        <p className={styles.scoreLine}>
          Face au S&P 500, les retenues ont fait{' '}
          <span className={['num', styles[gainTone(summary.filter.keptAvgExcess)]].join(' ')}>{formatPct(summary.filter.keptAvgExcess, { signed: true })}</span> en moyenne (
          {plural(summary.filter.keptCount, 'idée')}), les écartées{' '}
          <span className={['num', styles[gainTone(summary.filter.droppedAvgExcess)]].join(' ')}>{formatPct(summary.filter.droppedAvgExcess, { signed: true })}</span> (
          {plural(summary.filter.droppedCount, 'idée')}). {summary.filter.keptAvgExcess > summary.filter.droppedAvgExcess ? 'Le tri de Claude aide.' : 'Le tri de Claude n’aide pas encore.'}
        </p>
      ) : null}
```

Vérifier dans le test que le texte rendu contient bien `(3 idées)` sans espace parasite après la parenthèse ; ajuster les `{' '}` si Prettier reformate.

- [ ] **Step 7: Fournée en cours et rapport**

Dans `client/src/components/invest/IdeasSection.tsx` :
- importer `IDEA_ANGLES` depuis `@shared/invest` et `failedAnglesText, runOutcome` depuis `@/lib/invest` ; retirer l'import de `plural` s'il n'est plus utilisé ;
- sous-titre : `Trouvées par {IDEA_ANGLES.length} chercheurs, passées au crible par un critique, suivies face au S&P 500.` (dans le `<p className={styles.subtitle}>`) ;
- message pendant la fournée :

```tsx
          {current?.phase === 'review'
            ? 'Claude passe les pistes au crible. Encore quelques minutes.'
            : `${IDEA_ANGLES.length} chercheurs fouillent l’actualité. Ça prend plusieurs minutes, tu peux continuer ailleurs.`}
```

- description de l'état vide : `Quatre chercheurs fouillent l’actualité, un critique ne garde que ce que le marché n’a pas encore vu.` ;
- dans `RunReport`, remplacer le premier `<span>` par :

```tsx
      <span>{runOutcome(run)}</span>
      {run.failedAngles.length > 0 ? <span>{failedAnglesText(run.failedAngles)}</span> : null}
```

et garder le `<details>` « Voir pourquoi » tel quel (il liste rejets techniques et écartées par le critique, avec leur raison).

- [ ] **Step 8: Run tests**

Run: `npx vitest run client`
Expected: PASS.

- [ ] **Step 9: Full verification and commit**

Run: `npm test && npm run typecheck && npm run lint`
Expected: tout au vert.

```bash
git add client/src/lib/invest.ts client/src/lib/invest.test.ts client/src/components/invest
git commit -m "feat(client): idées passées au crible, avec sources, risque, contexte de marché et bilan du tri"
```

---

### Task 5: Validation de bout en bout sur une copie de la base

Aucun test automatisé ici : on lance une vraie fournée (vrais appels `claude` et Yahoo) sur une copie de la base, sur d'autres ports, et on juge le résultat.

**Files:**
- Modify (si besoin) : `server/src/services/idea-prompts.ts` (réglage des prompts), `client/src/components/invest/*` (retouches visuelles)

- [ ] **Step 1: Copie de la base et serveurs isolés**

```bash
mkdir -p tmp/e2e
sqlite3 data/runway.db ".backup tmp/e2e/runway.db"
RUNWAY_DB=tmp/e2e/runway.db PORT=3100 npx tsx server/src/index.ts
```

Dans un autre terminal (ou en arrière-plan) :

```bash
API_PORT=3100 npx vite --config client/vite.config.ts --port 5180 --strictPort
```

Expected : le serveur annonce `base : tmp/e2e/runway.db`.

- [ ] **Step 2: Lancer une fournée réelle**

```bash
curl -s -X POST localhost:3100/api/invest/ideas/runs -H 'content-type: application/json' -d '{"trigger":"manual"}'
```

Suivre `GET /api/invest/ideas/runs/<id>` toutes les minutes jusqu'à `status` `done` ou `failed` (10 à 25 minutes).
Si `failed` avec une erreur d'arguments du binaire `claude` (`--tools` ou `--allowedTools`), corriger le format de `WEB_TOOLS` (par exemple deux arguments séparés), adapter l'assertion du test, et relancer.

- [ ] **Step 3: Lire le résultat d'un œil critique**

```bash
sqlite3 -header tmp/e2e/runway.db "select ticker, angle, verdict, critique, perf_3m, sources from ideas where run_id = (select max(id) from idea_runs);"
```

Vérifier :
- chaque angle a proposé des pistes, de sources variées et réellement différentes d'un angle à l'autre ;
- les écartées le sont pour de bonnes raisons (pas d'écartée « par défaut » sans argument) ;
- les retenues sont moins évidentes que celles du 7 octobre (Take-Two, Frontline, Cameco, Equinor, Samsung), et leur `pricedIn` ne dit pas « largement intégré » ;
- les URL de `sources` s'ouvrent et parlent bien de l'événement.

Si le critique retient des idées manifestement déjà dans les prix, ou si un chercheur rabâche les mêmes thèmes, ajuster les consignes dans `idea-prompts.ts` et relancer une fournée.
Chaque ajustement de prompt est commité séparément (`fix(server): ...`) avec `npm test` au vert.

- [ ] **Step 4: Vérification visuelle**

Ouvrir `http://localhost:5180/investir` (ordinateur, puis émulation mobile 390 × 844).
Vérifier au pixel près :
- cartes : sources multiples sur une ou plusieurs lignes sans débordement, ligne « Ce qui peut mal tourner », contexte de marché bien rangé sous l'actif ;
- anciennes idées (sans risque ni contexte) toujours propres ;
- message de phase pendant une fournée, puis rapport de fin (« N idées retenues sur M pistes » ou « Rien de convaincant cette semaine »), « Voir pourquoi » ;
- état « Rien de convaincant » si aucune retenue.

Pour voir la ligne du Bilan sans attendre les horizons, sur la copie uniquement :

```bash
sqlite3 tmp/e2e/runway.db "update ideas set status='closed', final_return=0.08, bench_final_return=0.02 where id = (select min(id) from ideas where verdict='kept'); update ideas set status='closed', final_return=0.01, bench_final_return=0.02 where id = (select min(id) from ideas where verdict='dropped');"
```

Corriger tout défaut visuel constaté, avec `npm test && npm run typecheck && npm run lint` au vert, et commiter (`fix(client): ...`).

- [ ] **Step 5: Ménage**

Arrêter les deux serveurs, puis `rm -rf tmp/e2e`.
`data/runway.db` n'a pas été touchée : la migration s'y appliquera au prochain démarrage normal.
