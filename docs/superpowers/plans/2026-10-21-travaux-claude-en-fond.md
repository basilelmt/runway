# Travaux de Claude en fond - plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La recherche web d'un marchand, la fournée d'idées et la description des marchands tournent en fond et sont annoncées par un panneau en bas de l'écran, visible partout.

**Architecture:** Un registre en mémoire côté serveur (`claude-tasks`) et une route `GET /api/claude/tasks` qui y ajoute les fournées d'idées lues en base.
Le client interroge la route (2 s si quelque chose tourne, 30 s sinon), affiche `ClaudeTasksTray` et invalide les données concernées à la fin d'une tâche.

**Tech Stack:** Hono, Drizzle (better-sqlite3), React 19, TanStack Query, CSS modules, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-21-travaux-claude-en-fond-design.md` (à lire en entier : libellés, types et comportements exacts).

## Global Constraints

- Tâches finies gardées 10 minutes (`FINISHED_TTL_MS = 600_000`), 20 au plus dans `list()`.
- Interrogation client : 2 000 ms si une tâche est `running`, 30 000 ms sinon.
- Une carte finie disparaît seule après 10 s (`DONE_DISMISS_MS = 10_000`) ; une carte en échec reste jusqu'à fermeture.
- Le panneau ne montre une tâche finie que s'il l'a vue `running` dans cet onglet.
- Libellés exacts : « Claude cherche <nom> sur le web », « Claude décrit tes marchands », « Claude cherche des idées d'investissement » ; résultats « Rien trouvé sur le web », « <n> marchands nommés ou décrits », « <n> idées retenues » (`plural` pour les accords).
- Textes en français, jamais de tiret cadratin « — ». Style du code voisin. TDD.
- `npx vitest run`, `npm run typecheck`, `npm run lint` verts à la fin de chaque tâche. CSS : tokens seulement (`client/src/styles/css-guard.test.ts`).
- Commits sans co-auteur.

---

### Task 1 : serveur

**Files:**
- Create: `server/src/services/claude-tasks.ts`, `server/src/routes/claude-tasks.ts`
- Modify: `shared/api-types.ts` (types `ClaudeTaskKind`, `ClaudeTaskView`, recopiés de la spec)
- Modify: `server/src/services/merchant-web.ts`, `server/src/routes/merchants.ts`
- Modify: `server/src/services/merchants.ts` (`createMerchantNamer`, `nameMerchants` renvoie déjà un total)
- Modify: `server/src/app.ts` (créer ou recevoir le registre, monter `/api/claude/tasks`), `server/test/helpers.ts` (option `claudeTasks`)
- Test: `server/test/claude-tasks.test.ts`, `server/test/merchant-web.test.ts`, `server/test/merchant-naming.test.ts`

**Interfaces:**
- Produces: `type ClaudeTasks = { start(kind: ClaudeTaskKind, label: string, subject?: string | null): string; finish(id: string, result?: string | null): void; fail(id: string, error: string): void; list(): ClaudeTaskView[]; find(kind: ClaudeTaskKind, subject: string): ClaudeTaskView | null }` et `createClaudeTasks(opts?: { now?: () => Date }): ClaudeTasks`.
- Produces: `startMerchantWebSearch(db, key, today, tasks, deps?: { exec?: Exec }): ClaudeTaskView` (lève 404/409 avant de lancer ; réutilise la tâche en cours de la même clé via `find`). Garder un `describeMerchantOnWeb` interne (ou exporté pour les tests) qui renvoie la promesse.
- Produces: `GET /api/claude/tasks` → `ClaudeTaskView[]` ; `POST /api/merchants/:key/describe` → 202 + `ClaudeTaskView`.

- [ ] **Step 1 : tests qui échouent**

`server/test/claude-tasks.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { createClaudeTasks } from '../src/services/claude-tasks';

describe('createClaudeTasks', () => {
  it('suit une tâche du début à la fin, puis l’oublie après 10 minutes', () => {
    let t = new Date('2026-10-21T10:00:00Z');
    const tasks = createClaudeTasks({ now: () => t });
    const id = tasks.start('merchant_web', 'Claude cherche SC-Fourteen sur le web', 'SC-FOURTEEN CA');
    expect(tasks.list()).toMatchObject([{ id, status: 'running', subject: 'SC-FOURTEEN CA', finishedAt: null }]);
    expect(tasks.find('merchant_web', 'SC-FOURTEEN CA')?.id).toBe(id);
    t = new Date('2026-10-21T10:01:00Z');
    tasks.finish(id, 'Bar-restaurant, Paris (14e)');
    expect(tasks.list()[0]).toMatchObject({ status: 'done', result: 'Bar-restaurant, Paris (14e)', finishedAt: '2026-10-21T10:01:00.000Z' });
    expect(tasks.find('merchant_web', 'SC-FOURTEEN CA')).toBeNull();
    t = new Date('2026-10-21T10:11:01Z');
    expect(tasks.list()).toEqual([]);
  });

  it('garde l’erreur d’un échec, et 20 tâches au plus, les plus récentes d’abord', () => {
    let n = 0;
    const tasks = createClaudeTasks({ now: () => new Date(Date.UTC(2026, 9, 21, 10, 0, n++)) });
    const failed = tasks.start('merchant_naming', 'Claude décrit tes marchands');
    tasks.fail(failed, 'Claude Code n’est pas installé');
    expect(tasks.list()[0]).toMatchObject({ status: 'failed', error: 'Claude Code n’est pas installé' });
    for (let i = 0; i < 25; i++) tasks.start('merchant_web', `t${i}`, `K${i}`);
    expect(tasks.list()).toHaveLength(20);
    expect(tasks.list()[0]!.label).toBe('t24');
  });
});
```

Dans `server/test/merchant-web.test.ts`, la route répond maintenant 202 avec la tâche ; le résultat se lit ensuite.
Adapter chaque test : après `POST`, attendre la fin (helper `settle = () => new Promise((r) => setTimeout(r, 0))`, ou exposer la promesse via le registre de test), puis lire `GET /api/merchants/:key` et `GET /api/claude/tasks`.
Cas à couvrir :

```ts
it('répond tout de suite avec la tâche, puis écrit la description et finit la tâche', async () => {
  const res = await t.call('POST', path('SC-FOURTEEN CA'));
  expect(res.status).toBe(202);
  expect(res.body).toMatchObject({ kind: 'merchant_web', status: 'running', subject: 'SC-FOURTEEN CA', label: 'Claude cherche Sc-Fourteen Ca sur le web' });
  await settle();
  expect((await t.call('GET', `/api/merchants/${encodeURIComponent('SC-FOURTEEN CA')}`)).body).toMatchObject({ description: 'Boutique de vêtements, Paris (3e)', descriptionSource: 'web' });
  expect((await t.call('GET', '/api/claude/tasks')).body).toMatchObject([{ status: 'done', result: 'Boutique de vêtements, Paris (3e)' }]);
});
```

Le libellé reprend le nom affiché du marchand (`getMerchant(...).name`) : ajuster l'attendu au nom réel du test.
Garder : prompt sans montant ni date, « Rien trouvé sur le web » quand la description est vide, un seul appel pour deux `POST` simultanés (même `id` de tâche), 409 pour une description `user` (sans tâche créée), erreur Claude → tâche `failed` avec le message, 404 clé inconnue.

Dans `server/test/merchant-naming.test.ts` : un `createMerchantNamer` avec registre ouvre une tâche `merchant_naming` « Claude décrit tes marchands » finie avec « 2 marchands nommés ou décrits » quand il y a des clés ; aucune tâche s'il n'y a rien à traiter ; `failed` avec l'erreur si Claude échoue.

Route des fournées (dans `claude-tasks.test.ts`, via `createTestApp`) : créer une fournée en base avec `createRun` (en cours) et une autre finie il y a 5 minutes avec `finishRun` (`acceptedCount: 3`), une troisième finie il y a 20 minutes ; `GET /api/claude/tasks` renvoie les deux premières (`id` `ideas-<id>`, libellé « Claude cherche des idées d'investissement », résultat « 3 idées retenues »), pas la troisième.

- [ ] **Step 2 : vérifier l'échec**

Run: `npx vitest run server/test/claude-tasks.test.ts server/test/merchant-web.test.ts server/test/merchant-naming.test.ts`
Expected: FAIL.

- [ ] **Step 3 : implémentation**

`server/src/services/claude-tasks.ts` :

```ts
import type { ClaudeTaskKind, ClaudeTaskView } from '@shared/api-types';

/** Une tâche finie reste visible ce temps-là, pour que le panneau du client ait le temps de l'annoncer. */
export const FINISHED_TTL_MS = 600_000;
const MAX_TASKS = 20;

export type ClaudeTasks = {
  start(kind: ClaudeTaskKind, label: string, subject?: string | null): string;
  finish(id: string, result?: string | null): void;
  fail(id: string, error: string): void;
  list(): ClaudeTaskView[];
  /** La tâche en cours de ce type pour ce sujet, s'il y en a une. */
  find(kind: ClaudeTaskKind, subject: string): ClaudeTaskView | null;
};

/** Registre en mémoire des travaux longs de Claude, pour le panneau du client. */
export function createClaudeTasks(opts: { now?: () => Date } = {}): ClaudeTasks {
  const now = opts.now ?? (() => new Date());
  const tasks = new Map<string, ClaudeTaskView>();
  let seq = 0;
  const prune = () => {
    const limit = now().getTime() - FINISHED_TTL_MS;
    for (const [id, t] of tasks) if (t.finishedAt && Date.parse(t.finishedAt) < limit) tasks.delete(id);
  };
  const end = (id: string, patch: Partial<ClaudeTaskView>) => {
    const t = tasks.get(id);
    if (t) tasks.set(id, { ...t, ...patch, finishedAt: now().toISOString() });
  };
  return {
    start(kind, label, subject = null) {
      const id = `${kind}-${++seq}`;
      tasks.set(id, { id, kind, label, subject, status: 'running', startedAt: now().toISOString(), finishedAt: null, result: null, error: null });
      return id;
    },
    finish: (id, result = null) => end(id, { status: 'done', result }),
    fail: (id, error) => end(id, { status: 'failed', error }),
    list() {
      prune();
      return [...tasks.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt) || b.id.localeCompare(a.id)).slice(0, MAX_TASKS);
    },
    find(kind, subject) {
      return [...tasks.values()].find((t) => t.kind === kind && t.subject === subject && t.status === 'running') ?? null;
    },
  };
}
```

Le tri par `id` à `startedAt` égal doit suivre l'ordre de création : utiliser un numéro (`seq`) dans la comparaison plutôt que la chaîne si `t10` < `t9` pose problème.

`merchant-web.ts` : remplacer la `Map inFlight` par le registre.

```ts
/** Lance la recherche web en fond et renvoie sa tâche ; une recherche en cours pour la même clé est réutilisée. */
export function startMerchantWebSearch(db: Db, key: string, today: ISODate, tasks: ClaudeTasks, deps: { exec?: Exec } = {}): ClaudeTaskView {
  const running = tasks.find('merchant_web', key);
  if (running) return running;
  const merchant = getMerchant(db, key, today);
  if (merchant.descriptionSource === 'user') throw new ConflictError('Ce marchand a déjà une description donnée à la main');
  const id = tasks.start('merchant_web', `Claude cherche ${merchant.name} sur le web`, key);
  describeMerchantOnWeb(db, key, today, deps).then(
    (m) => tasks.finish(id, m.description ?? 'Rien trouvé sur le web'),
    (e: unknown) => tasks.fail(id, e instanceof Error ? e.message : String(e)),
  );
  return tasks.find('merchant_web', key)!;
}
```

`describeMerchantOnWeb` garde son corps actuel sans la `Map` ni le contrôle 409 (fait avant).
Attention à la restauration de sauvegarde : la tâche de fond utilise la `db` reçue ; c'est le même comportement qu'avant.

`routes/merchants.ts` : `merchantRoutes(namer, tasks, exec?)` ; `POST /:key/describe` → `c.json(startMerchantWebSearch(...), 202)`.

`services/merchants.ts` : `createMerchantNamer(db, deps)` accepte `deps.tasks?: ClaudeTasks`.
Dans `start()`, avant `nameMerchants`, ouvrir la tâche seulement s'il y a du travail : `listKeysToProcess(holder.current(), 1).length > 0`.
`then(total)` → `tasks.finish(id, `${plural(total, 'marchand nommé ou décrit', 'marchands nommés ou décrits')}`)` ; `catch` → `tasks.fail(id, lastError)`.
`plural` côté serveur : vérifier s'il existe dans `shared/` ; sinon écrire l'accord en ligne (`total > 1 ? ... : ...`).

`routes/claude-tasks.ts` :

```ts
export const claudeTaskRoutes = (tasks: ClaudeTasks) =>
  new Hono<AppEnv>().get('/', (c) => {
    const db = c.get('db');
    const ideas = recentIdeaRuns(db, new Date(Date.now() - FINISHED_TTL_MS).toISOString()).map(ideaRunTask);
    return c.json([...tasks.list(), ...ideas].sort((a, b) => b.startedAt.localeCompare(a.startedAt)));
  });
```

`recentIdeaRuns(db, since)` dans `server/src/repos/ideas.ts` : fournées `running`, ou `finishedAt >= since`.
`ideaRunTask(row)` : `{ id: `ideas-${row.id}`, kind: 'ideas', label: "Claude cherche des idées d'investissement", subject: null, status: row.status, startedAt: row.startedAt, finishedAt: row.finishedAt, result: row.status === 'done' ? `${n} idée(s) retenue(s)` : null, error: row.error }`.
L'horloge : utiliser le `now` injecté de l'app si elle en a un pour les instants (les tests passent `now` sous forme de date du jour seulement) ; sinon `Date.now()` et, dans le test, des dates relatives à `Date.now()`.

`app.ts` : `const tasks = opts.claudeTasks ?? createClaudeTasks()` ; passer `tasks` au nommeur créé par l'app (`createMerchantNamer(holder, { exec, tasks })` ; voir où il est créé, `server/src/index.ts` ou `app.ts`) et monter `app.route('/api/claude/tasks', claudeTaskRoutes(tasks))`.
Si le nommeur est créé hors de l'app (`index.ts`), créer le registre au même endroit et le passer aux deux.

- [ ] **Step 4 : vérifier**

Run: `npx vitest run && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5 : commit**

```bash
git add -A server shared && git commit -m "feat(server): registre des travaux de Claude, recherche web en fond"
```

---

### Task 2 : client

**Files:**
- Modify: `client/src/api/hooks.ts` (`useClaudeTasks`, `useDescribeMerchantOnWeb`, suppression de `useMerchantNamingSync`)
- Create: `client/src/components/layout/ClaudeTasksTray.tsx`, `ClaudeTasksTray.module.css`, `ClaudeTasksTray.test.tsx`
- Modify: `client/src/components/layout/Shell.tsx` (monter le panneau, retirer `useMerchantNamingSync`)
- Modify: `client/src/components/transactions/MerchantAbout.tsx`
- Test: `client/src/components/transactions/TransactionSheet.test.tsx`, `client/src/components/layout/Shell.test.tsx`

**Interfaces:**
- Consumes: `GET /api/claude/tasks` → `ClaudeTaskView[]` ; `POST /api/merchants/:key/describe` → 202 `ClaudeTaskView`.
- Produces: `useClaudeTasks(): UseQueryResult<ClaudeTaskView[]>` (clé `['claude-tasks']`) ; `useClaudeTaskSync(): void` (invalidations de fin) ; `ClaudeTasksTray()`.

- [ ] **Step 1 : tests qui échouent**

`ClaudeTasksTray.test.tsx`, avec un faux `fetch` dont la réponse de `/api/claude/tasks` change entre deux appels et les minuteries simulées (`vi.useFakeTimers({ shouldAdvanceTime: true })`) :
- une tâche `running` affiche son libellé dans une région `status` ;
- quand elle passe à `done`, la carte montre `result`, puis disparaît après 10 s ;
- une tâche `failed` vue en cours montre `error` et reste après 10 s ; le bouton « Fermer » la retire ;
- une tâche déjà `done` au premier chargement n'est pas affichée ;
- une fournée `ideas` finie montre un lien « Voir » vers `/investir` (rendre dans un `MemoryRouter`) ;
- à la fin d'une tâche `merchant_web`, `invalidateQueries` est appelé sur `['merchants']` (espionner `QueryClient.prototype.invalidateQueries` ou passer un `QueryClient` espionné).

Dans `TransactionSheet.test.tsx`, adapter le test de la recherche web : le `POST` répond 202 avec une tâche `running` ; `/api/claude/tasks` renvoie cette tâche en cours puis `done` ; le détail du marchand renvoie ensuite la description web.
Vérifier « Claude cherche sur le web… » pendant l'attente puis la description ; ajouter : une tâche `merchant_web` en cours pour la clé au montage affiche « Claude cherche sur le web… » et désactive le bouton.

- [ ] **Step 2 : vérifier l'échec**

Run: `npx vitest run client/src/components/layout client/src/components/transactions`
Expected: FAIL.

- [ ] **Step 3 : implémentation**

`hooks.ts` :

```ts
/** Travaux longs de Claude (recherche web, fournée d'idées, description des marchands), pour le panneau en bas de l'écran. */
export const useClaudeTasks = () =>
  useQuery({
    queryKey: keys.claudeTasks,
    queryFn: () => api.get<ClaudeTaskView[]>('/api/claude/tasks'),
    refetchInterval: (q) => (q.state.data?.some((t) => t.status === 'running') ? 2000 : 30_000),
  });

/** À la fin d'un travail, rafraîchit ce qu'il a changé. Remplace l'ancien suivi du seul nommage. */
export function useClaudeTaskSync(): void {
  const qc = useQueryClient();
  const { data } = useClaudeTasks();
  const running = useRef(new Set<string>());
  useEffect(() => {
    for (const t of data ?? []) {
      if (t.status === 'running') running.current.add(t.id);
      else if (running.current.delete(t.id)) {
        const stale = t.kind === 'ideas' ? [keys.ideas, keys.invest] : t.kind === 'merchant_web' ? [['merchants']] : [['transactions'], ['transaction'], ['merchants']];
        for (const queryKey of stale) void qc.invalidateQueries({ queryKey });
      }
    }
  }, [data, qc]);
}
```

Ajouter `claudeTasks: ['claude-tasks'] as const` à `keys` ; vérifier les noms réels `keys.ideas` et `keys.invest`.
`useDescribeMerchantOnWeb` : la mutation renvoie un `ClaudeTaskView` ; `onSuccess` invalide `keys.claudeTasks` (plus de `setQueryData` du marchand).
Supprimer `useMerchantNamingSync` ; garder `useMerchantStatus` pour Réglages s'il sert encore (`grep`).

`MerchantAbout.tsx` : `const searching = web.isPending || useClaudeTasks().data?.some((t) => t.kind === 'merchant_web' && t.subject === merchantKey && t.status === 'running')` (hooks appelés sans condition, au début du composant) ; utiliser `searching` à la place de `web.isPending` pour le texte, le `loading` et le `disabled` du bouton.

`ClaudeTasksTray.tsx` :

```tsx
/** Cartes en bas de l'écran : ce que Claude fait en fond, puis ce qu'il a trouvé. */
export function ClaudeTasksTray() {
  useClaudeTaskSync();
  const { data } = useClaudeTasks();
  const seenRunning = useRef(new Set<string>());
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  for (const t of data ?? []) if (t.status === 'running') seenRunning.current.add(t.id);
  const shown = (data ?? []).filter((t) => seenRunning.current.has(t.id) && !dismissed.has(t.id));
  const dismiss = (id: string) => setDismissed((prev) => new Set(prev).add(id));
  // ...
  return (
    <div className={styles.tray} role="status" aria-live="polite">
      {shown.map((t) => <TaskCard key={t.id} task={t} onDismiss={() => dismiss(t.id)} />)}
    </div>
  );
}
```

Lire `seenRunning` pendant le rendu est accepté ici (ref mise à jour de façon idempotente) ; si le lint React l'interdit, passer par un `useState` mis à jour quand `data` change.
`TaskCard` : `useEffect` qui appelle `onDismiss` après `DONE_DISMISS_MS` quand `status === 'done'`.
Contenu : en cours, `Spinner` (ou l'icône animée utilisée par Demander, voir `client/src/components/ask`) + libellé ; fini, icône `Check` + `result ?? label` + lien `ButtonLink` « Voir » vers `/investir` pour `ideas` ; échec, `AlertCircle` + `error`. Bouton fermer icône seule `aria-label="Fermer"`.
CSS : `position: fixed`, en bas à droite (`inset: auto var(--s-6) calc(var(--s-6) + env(safe-area-inset-bottom)) auto`), pile verticale `gap: var(--s-2)`, largeur max 360 px via token ou `min()` sans valeur en dur refusée par le garde-fou, fond `var(--paper-raised)`, bord `var(--rule)`, `var(--radius-md)`, `var(--shadow-pop)`, entrée animée comme les toasts (voir `client/src/components/ui/Toast.module.css`).
Décalage quand Demander est ouvert : `Shell` pose `data-ask-open` sur `.shell` ; écrire `.shell[data-ask-open] .tray`-équivalent via une prop `askOpen` ou un sélecteur `:global([data-ask-open]) .tray { right: calc(var(--ask-width) + var(--s-10)); }`.
Mobile (`max-width: 767px`) : au-dessus de la barre (`calc(var(--bottomnav-height) + var(--s-4) + env(safe-area-inset-bottom))`), `left`/`right` à `var(--s-4)`.
Les toasts sont en bas au centre : vérifier à 1440 px et 390 px qu'ils ne se chevauchent pas ; sur mobile, empiler le panneau au-dessus de la zone des toasts si besoin.

`Shell.tsx` : retirer `useMerchantNamingSync()`, monter `<ClaudeTasksTray />` dans `Layout`.
Adapter `Shell.test.tsx` si son faux `fetch` doit répondre à `/api/claude/tasks` (`[]`).

- [ ] **Step 4 : vérifier**

Run: `npx vitest run && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5 : commit**

```bash
git add -A client && git commit -m "feat(client): panneau des travaux de Claude en fond, la recherche web survit à la fermeture de la fiche"
```

---

### Task 3 : recette

- [ ] Copie de la base : `sqlite3 data/runway.db ".backup tmp/e2e/runway.db"`.
- [ ] Serveur et client de recette (`PATH="$HOME/.local/bin:$PATH" RUNWAY_DB=tmp/e2e/runway.db PORT=3100 npx tsx server/src/index.ts`, `API_PORT=3100 npx vite --config client/vite.config.ts --port 5180 --strictPort`).
- [ ] Au démarrage : la carte « Claude décrit tes marchands » apparaît puis finit.
- [ ] Fiche d'un marchand non reconnu : « Chercher sur le web », fermer la fiche aussitôt, voir la carte en cours puis le résultat ; rouvrir la fiche : la description est là.
- [ ] Rouvrir la fiche pendant la recherche : « Claude cherche sur le web… », bouton désactivé.
- [ ] Investir : lancer une fournée, changer d'écran, voir la carte en cours (ne pas attendre la fin si elle dépasse la recette ; vérifier au moins l'apparition).
- [ ] Captures à 1440 px et 390 px, avec Demander ouvert ; corriger tout défaut visuel.
- [ ] Arrêter les serveurs de recette.
