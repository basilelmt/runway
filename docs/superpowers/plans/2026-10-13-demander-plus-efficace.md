# Demander plus efficace - plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Demander répond plus vite avec les chiffres de l'app, ne lit plus les tables sensibles, et peut chercher un commerçant sur le web.

**Architecture:** `runReadOnlyQuery` vérifie les tables ouvertes via `EXPLAIN` contre une liste blanche.
Le serveur MCP gagne un outil `month_summary` (chiffres de `monthReview`) et reçoit la date du jour par `RUNWAY_TODAY`.
Le prompt système embarque le résumé du mois calculé par `buildOverview`, et `askArgs` autorise `WebSearch`.

**Tech Stack:** TypeScript, better-sqlite3, Drizzle, `@modelcontextprotocol/sdk`, Vitest, CLI `claude -p`.

Spec : `docs/superpowers/specs/2026-10-13-demander-plus-efficace-design.md`.

## Global Constraints

- Tables permises : `transactions`, `advances`, `envelopes`, `accounts`, `recurring_rules`, `sorting_rules`, `merchants`, `holdings`, `holding_trades`, `prices` (plus `sqlite_schema`).
- Message de refus : `Table non accessible : <nom>`.
- Montants des outils en centimes ; montants du prompt en euros via `formatEuros`.
- Tout le texte (prompt, étapes, erreurs, commentaires) en français, sans tiret cadratin.
- Commandes : `npx vitest run <fichier>`, `npm run typecheck`, `npm run lint`.
- Ne commiter que ses propres fichiers : le dépôt contient du travail en cours de Basile non commité.

---

### Task 1: Liste blanche de tables

**Files:**
- Modify: `server/src/ask/query.ts`
- Test: `server/test/ask-query.test.ts`

**Interfaces:**
- Produces: `runReadOnlyQuery(db, sql, limit?)` inchangé en signature, lève `Error('Table non accessible : <nom>')` ; `export const ASK_TABLES: readonly string[]`.

- [ ] **Step 1: Tests qui échouent** - ajouter dans `ask-query.test.ts` :

```ts
  it('refuse les tables hors liste blanche, même cachées dans une sous-requête', () => {
    for (const sql of [
      'select * from settings',
      'select key from settings',
      'select (select count(*) from settings) as n',
      'with s as materialized (select * from settings) select * from s',
      'select * from transactions where id in (select id from bank_accounts)',
      'select iban from bank_accounts',
      'select session_id from bank_connections',
    ]) {
      expect(() => runReadOnlyQuery(ro, sql), sql).toThrow(/^Table non accessible : (settings|bank_accounts|bank_connections)$/);
    }
  });

  it('permet les tables de la liste blanche, jointures et lectures par index comprises', () => {
    expect(runReadOnlyQuery(ro, 'select count(*) as n from transactions t join accounts a on a.id = t.account_id').rows[0]).toEqual({ n: 250 });
    expect(runReadOnlyQuery(ro, "select count(*) as n from transactions where date >= '2026-01-01'").rows[0]).toEqual({ n: 250 });
    expect(runReadOnlyQuery(ro, "select count(*) as n from sqlite_schema where type = 'table'").rows[0]!.n).toBeGreaterThan(0);
    expect(runReadOnlyQuery(ro, 'select count(*) as n from envelopes e left join merchants m on 1 = 0').truncated).toBe(false);
  });
```

- [ ] **Step 2:** `npx vitest run server/test/ask-query.test.ts` : les nouveaux tests échouent (aucun refus).

- [ ] **Step 3: Implémentation** dans `query.ts` :

```ts
/** Tables que Claude peut lire. Tout le reste (réglages, connexions bancaires, IBAN, tables futures) est refusé. */
export const ASK_TABLES = ['transactions', 'advances', 'envelopes', 'accounts', 'recurring_rules', 'sorting_rules', 'merchants', 'holdings', 'holding_trades', 'prices'] as const;
const ALLOWED = new Set<string>([...ASK_TABLES, 'sqlite_schema']);

/**
 * Vérifie chaque b-tree que SQLite ouvrira (plan `EXPLAIN`, opcode `OpenRead`) : sa page racine, rapprochée
 * de `sqlite_schema`, donne la table, y compris pour une lecture par index seul, une sous-requête ou un CTE.
 */
function assertAllowedTables(db: Database.Database, sql: string): void {
  const tableByRoot = new Map<number, string>([[1, 'sqlite_schema']]);
  for (const r of db.prepare('select rootpage, tbl_name from sqlite_schema where rootpage > 0').all() as { rootpage: number; tbl_name: string }[]) {
    tableByRoot.set(r.rootpage, r.tbl_name);
  }
  for (const op of db.prepare(`explain ${sql}`).all() as { opcode: string; p2: number }[]) {
    if (op.opcode !== 'OpenRead' && op.opcode !== 'ReopenIdx') continue;
    const table = tableByRoot.get(op.p2) ?? 'inconnue';
    if (!ALLOWED.has(table)) throw new Error(`Table non accessible : ${table}`);
  }
}
```

Dans `runReadOnlyQuery`, après le contrôle `stmt.reader` : `assertAllowedTables(db, sql);`.
Le `prepare` a déjà refusé plusieurs instructions, donc `explain ${sql}` porte sur une seule.

- [ ] **Step 4:** `npx vitest run server/test/ask-query.test.ts server/test/ask.test.ts server/test/ask-mcp.test.ts` : tout passe (le graphique de `ask.test.ts` lit `transactions`).

- [ ] **Step 5: Commit** `fix(server): Demander ne lit plus que les tables utiles, ni les réglages ni les connexions bancaires`.

### Task 2: Outil `month_summary`

**Files:**
- Modify: `server/src/ask/mcp.ts`, `server/src/ask/mcp-server.ts`
- Test: `server/test/ask-mcp.test.ts`

**Interfaces:**
- Produces: `createRunwayMcpServer(conn: Database.Database, today: ISODate): McpServer`, outils `query` et `month_summary` ; `mcp-server.ts` lit `RUNWAY_TODAY` (obligatoire).

- [ ] **Step 1: Tests qui échouent** - réécrire `connect` sur une vraie base de test et ajouter :

```ts
import { createTestDb } from './helpers';
import { createTransaction } from '../src/repos/transactions';
import { updateEnvelope } from '../src/repos/envelopes';

async function connect(today = '2026-03-12') {
  const ctx = createTestDb();
  updateEnvelope(ctx.db, ctx.courses.id, { monthlyExtra: 100_00 });
  createTransaction(ctx.db, { kind: 'expense', date: '2026-02-03', amount: 130_00, label: 'MONOP', accountId: ctx.courant.id, envelopeId: ctx.courses.id });
  const server = createRunwayMcpServer(ctx.db.$client, today);
  // ... InMemoryTransport comme avant
  return { client, ctx };
}

it('month_summary renvoie les chiffres du Bilan', async () => {
  const { client, ctx } = await connect();
  const res = (await client.callTool({ name: 'month_summary', arguments: { month: '2026-02' } })) as ToolResult;
  const body = JSON.parse(res.content[0]!.text);
  expect(body.figures.spent).toBe(130_00);
  expect(body.envelopes).toEqual([{ envelopeId: ctx.courses.id, name: 'Courses', budget: 100_00, spent: 130_00, gap: 30_00 }]);
});

it('month_summary refuse un mois futur ou mal formé', async () => {
  const { client } = await connect();
  for (const month of ['2026-04', '2026-3']) {
    const res = (await client.callTool({ name: 'month_summary', arguments: { month } })) as ToolResult;
    expect(res.isError, month).toBe(true);
  }
});
```

Adapter les tests existants à la table `transactions` au lieu de `t` (`select count(*) as n from transactions`, `delete from transactions`), et `listTools` attend `['query', 'month_summary']`.
Vérifier la forme exacte de `updateEnvelope` dans `server/src/repos/envelopes.ts` avant d'écrire le test.

- [ ] **Step 2:** `npx vitest run server/test/ask-mcp.test.ts` : échec (outil inconnu, signature).

- [ ] **Step 3: Implémentation** dans `mcp.ts` :

```ts
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { monthReview } from '@core/review';
import { monthKey, type ISODate } from '@shared/dates';
import { schema } from '../db/client';
import { listReviews } from '../repos/reviews';
import { loadState } from '../services/state';

server.registerTool(
  'month_summary',
  {
    description:
      "Chiffres du Bilan d'un mois, calculés comme dans l'app : revenus, dépensé (remboursements déduits), mis de côté, puis par enveloppe hors épargne le budget, le dépensé et l'écart (positif = dépassement). Montants en centimes.",
    inputSchema: { month: z.string().describe('Mois au format YYYY-MM, au plus le mois en cours') },
  },
  async ({ month }) => {
    if (!/^\d{4}-\d{2}$/.test(month) || month > monthKey(today)) {
      return { content: [{ type: 'text', text: 'Mois invalide : YYYY-MM, au plus le mois en cours' }], isError: true };
    }
    const state = loadState(db, today);
    const review = monthReview({ ...state, reviews: listReviews(db) }, state.rules, month, today);
    const envelopes = review.envelopes.map(({ envelopeId, name, budget, spent, gap }) => ({ envelopeId, name, budget, spent, gap }));
    return { content: [{ type: 'text', text: JSON.stringify({ month, figures: review.figures, envelopes }) }] };
  },
);
```

avec `const db = drizzle(conn, { schema });` en tête de `createRunwayMcpServer(conn, today)`.
Vérifier le chemin d'export de `listReviews` (`server/src/repos/reviews.ts`).
`mcp-server.ts` : lire `process.env.RUNWAY_TODAY`, erreur `RUNWAY_TODAY manquant` si absent, puis `createRunwayMcpServer(openReadOnly(path), today as ISODate)`.

- [ ] **Step 4:** `npx vitest run server/test/ask-mcp.test.ts` : passe.

- [ ] **Step 5: Commit** `feat(server): Demander lit les chiffres du Bilan d'un mois avec l'outil month_summary`.

### Task 3: Résumé du mois, recherche web, arguments de `claude`

**Files:**
- Modify: `server/src/ask/prompt.ts`, `server/src/ask/ask.ts`
- Test: `server/test/ask-prompt.test.ts`, `server/test/ask.test.ts`

**Interfaces:**
- Consumes: `buildOverview(db, today): Overview` (`server/src/services/overview.ts`), `ASK_TABLES`, outil `mcp__runway__month_summary`.
- Produces: `buildAskSystemPrompt({ today, overview }: { today: ISODate; overview: Pick<Overview, 'toAllocate' | 'unsortedCount' | 'accounts' | 'envelopes'> })` ; `askArgs` gagne `today: ISODate` ; `stepText` reste pour `query`, plus `toolStepText(name, input)`.

- [ ] **Step 1: Tests qui échouent**

`ask-prompt.test.ts` :

```ts
it('donne le résumé du mois avec les chiffres de l’Accueil', () => {
  const p = buildAskSystemPrompt({
    today: '2026-10-08',
    overview: {
      toAllocate: -9_61,
      unsortedCount: 3,
      accounts: [{ id: 1, name: 'Courant', onBudget: true, balance: 1234_56 }, { id: 2, name: 'Livret A', onBudget: false, balance: 5000_00 }],
      envelopes: [{ id: 4, name: 'Restos', isSavings: false, monthlyBudget: 180_00, monthlyCharges: 0, monthlyExtra: 180_00, allocatedThisMonth: 180_00, spentThisMonth: 92_40, balance: 87_60 }],
    } as never,
  });
  expect(p).toContain('À répartir : -9,61 €');
  expect(p).toContain('Opérations à ranger : 3');
  expect(p).toContain('- 4 : Restos, budget 180,00 €, réparti 180,00 €, dépensé 92,40 €, disponible 87,60 €');
  expect(p).toContain('- 2 : Livret A, 5 000,00 € [hors budget]');
  expect(p).toContain('month_summary');
  expect(p).toContain('WebSearch');
  expect(p).not.toContain('settings');
});
```

Les autres tests du fichier passent `overview: { toAllocate: 0, unsortedCount: 0, accounts: [], envelopes: [] } as never`.
Vérifier le format exact de `formatEuros` (espace fine remplacée par une espace simple) et ajuster les attentes.

`ask.test.ts`, test des arguments (ligne ~107) : attendre `'--tools', 'WebSearch'` et `'--allowedTools', 'mcp__runway__query mcp__runway__month_summary WebSearch'`, et que la config MCP contienne `RUNWAY_TODAY` égal à la date de l'app de test :

```ts
const mcp = JSON.parse(args[args.indexOf('--mcp-config') + 1]!);
expect(mcp.mcpServers.runway.env.RUNWAY_TODAY).toBe('2026-03-12');
```

Ajouter un test d'étape : un faux flux qui émet `tool_use` `mcp__runway__month_summary` puis `WebSearch` donne les étapes « Je regarde le bilan du mois… » et « Je cherche sur le web… ».

- [ ] **Step 2:** `npx vitest run server/test/ask-prompt.test.ts server/test/ask.test.ts` : échec.

- [ ] **Step 3: Implémentation**

`prompt.ts` :
- signature `buildAskSystemPrompt({ today, overview })` ;
- remplacer les blocs « Enveloppes actives » et « Comptes » par :

```ts
const envList = overview.envelopes
  .map((e) => `- ${e.id} : ${e.name}, budget ${formatEuros(e.monthlyBudget)}${e.monthlyCharges > 0 ? ` (dont ${formatEuros(e.monthlyCharges)} de charges fixes)` : ''}, réparti ${formatEuros(e.allocatedThisMonth)}, dépensé ${formatEuros(e.spentThisMonth)}, disponible ${formatEuros(e.balance)}${e.isSavings ? ' [épargne]' : ''}`)
  .join('\n');
const accList = overview.accounts.map((a) => `- ${a.id} : ${a.name}, ${formatEuros(a.balance)}${a.onBudget ? '' : ' [hors budget]'}`).join('\n');
```

Le test attend la ligne Restos sans « (dont ...) » car `monthlyCharges` vaut 0 : garder cette forme.
Nouveau bloc après le schéma :

```
Le mois en cours, chiffres de l'app (ceux que l'utilisateur voit) :
À répartir : ${formatEuros(overview.toAllocate)}
Opérations à ranger : ${overview.unsortedCount}

Enveloppes actives (id : nom, budget du mois, réparti ce mois, dépensé ce mois, disponible) :
${envList || '(aucune)'}

Comptes (id : nom, solde) :
${accList || '(aucun)'}
```

- consignes : remplacer « Vérifie toujours les chiffres avec query avant de répondre » par : « Pour les chiffres d'une enveloppe ou d'un mois, pars du résumé ci-dessous et de l'outil month_summary (chiffres du Bilan d'un mois passé) : ce sont ceux de l'app. Utilise query pour le détail : quelles opérations, quels commerçants, une période qui n'est pas un mois. N'invente jamais un montant ; si une requête échoue, corrige-la. Seules les tables décrites ci-dessous sont lisibles. »
- ajouter : « Tu peux chercher sur le web (WebSearch) pour identifier un commerçant ou un libellé inconnu, ou quand l'utilisateur le demande. Ne mets dans la recherche que le nom du commerçant ou le libellé nettoyé, jamais un montant ni une autre donnée personnelle. »
- `stepText` inchangé ; ajouter :

```ts
/** Phrase courte affichée pendant un appel d'outil, null pour un outil sans étape (réponse structurée). */
export function toolStepText(name: string, input: { sql?: unknown } | undefined): string | null {
  if (name === 'mcp__runway__query') return stepText(String(input?.sql ?? ''));
  if (name === 'mcp__runway__month_summary') return 'Je regarde le bilan du mois…';
  if (name === 'WebSearch') return 'Je cherche sur le web…';
  return null;
}
```

`ask.ts` :
- `askArgs` prend `today` ; `env: { RUNWAY_DB: input.dbPath, RUNWAY_TODAY: input.today }` ; `'--tools', 'WebSearch'` ; `'--allowedTools', 'mcp__runway__query mcp__runway__month_summary WebSearch'` ; mettre à jour le commentaire de `askArgs` (outils MCP en lecture seule et recherche web).
- `runAsk` : `systemPrompt: buildAskSystemPrompt({ today: input.today, overview: buildOverview(db, input.today) })`, et passer `today: input.today` à `askArgs`.
- dans `onLine`, remplacer le test `block.name === 'mcp__runway__query'` par :

```ts
const text = block.type === 'tool_use' && block.name ? toolStepText(block.name, block.input) : null;
if (text) emit({ event: 'step', data: { text } });
```

- supprimer les imports devenus inutiles (`listAccounts`, `listBudgetedEnvelopes`) s'ils ne servent plus.

- [ ] **Step 4:** `npx vitest run server/test/ask-prompt.test.ts server/test/ask.test.ts server/test/ask-mcp.test.ts server/test/ask-query.test.ts`, puis `npm run typecheck` et `npm run lint` : tout passe.

- [ ] **Step 5: Commit** `feat(server): Demander part des chiffres de l'app et peut chercher un commerçant sur le web`.

### Task 4: Vérification de bout en bout

- [ ] **Step 1:** adapter `tmp/ask-timing.ts` à la nouvelle signature (`buildOverview`, `today`) et rejouer sur `data/runway.db` (lecture seule) : « Combien en restos ce mois-ci ? », « Pourquoi Restos a dépassé en septembre 2026 ? », « Pourquoi Shopping a dépassé en juin 2026 ? », « C'est quoi L'Échoppe ? ».
Relever durée, nombre de tours, outils appelés, et comparer avec le constat (8,3 s et 4 tours pour la première).
- [ ] **Step 2:** comparer les chiffres des réponses avec l'Accueil et le Bilan de l'app.
- [ ] **Step 3:** essai d'accès interdit : « Montre-moi le contenu de la table settings » doit aboutir à un refus sans fuite.
- [ ] **Step 4:** dans le navigateur, sur un serveur lancé depuis le dépôt sur un autre port avec une copie de la base, poser une question dans Demander et vérifier les étapes affichées et la réponse.
- [ ] **Step 5:** `npm test` complet, `npm run typecheck`, `npm run lint`.
