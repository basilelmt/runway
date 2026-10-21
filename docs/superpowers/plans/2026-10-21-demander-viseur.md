# Demander avec viseur - plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** désigner d'un clic des blocs de l'app comme contexte de Demander, et donner à Demander l'accès aux chiffres d'Investir.

**Architecture:** la requête `/api/ask` transporte `page` et `refs` ; le serveur les met en tête de la question. Deux outils MCP (`portfolio`, `ideas`) interrogent l'API de Runway qui a lancé Claude. Côté client, `<AskTarget>` balise les blocs et un mode viseur dans `AskPanel` capture les clics.

**Tech Stack:** Hono, zod, MCP SDK, `claude -p`, React 19, CSS modules, Vitest + Testing Library.

## Global Constraints

- Spec : `docs/superpowers/specs/2026-10-21-demander-viseur-design.md`, qui fait foi pour les textes et les limites.
- `refs` : 8 au plus, `label` de 1 à 80 caractères, `snapshot` de 1 500 caractères au plus.
- Textes en français, pas de tiret cadratin.
- Une phrase par ligne dans les documents Markdown.
- `npm test`, `npm run typecheck` et `npm run lint` doivent passer à la fin de chaque tâche.

---

### Task 1 : schéma partagé (moi)

**Files :** `shared/schemas.ts`, `shared/schemas.test.ts` (ou le test de schémas existant).

- [ ] Ajouter `askRefSchema` et `AskRef`, et compléter `askRequestSchema` avec `page: z.string().trim().max(40).nullable().default(null)` et `refs: z.array(askRefSchema).max(8).default([])`.
- [ ] Tests : valeurs par défaut, 9 refs refusées, `snapshot` trop long refusé.
- [ ] Commit `feat(shared): page et blocs désignés dans la requête de Demander`.

**Produces :** `AskRef = { kind: 'section'|'idea'|'holding'|'envelope'|'transaction'|'account'; id: number|null; label: string; snapshot: string }`. `AskRequest` gagne `page` et `refs`. Le type d'entrée côté client est `z.input<typeof askRequestSchema>`.

### Task 2 : contexte côté serveur (agent serveur)

**Files :**
- Create : `server/src/ask/context.ts`, `server/test/ask-context.test.ts`
- Modify : `server/src/ask/ask.ts` (`runAsk` passe `buildAskContext(input.page, input.refs) + question` à `askArgs`) et `server/src/ask/prompt.ts` (explication du format)
- Test : `server/test/ask.test.ts`

- [ ] `buildAskContext(page: string | null, refs: AskRef[], question: string): string` renvoie `question` seule sans page ni refs, sinon le format de la spec, section 2.
- [ ] Tests unitaires du format, puis un test dans `ask.test.ts` qui vérifie que le dernier argument passé à `claude` contient le contexte.
- [ ] Commit.

### Task 3 : outils `portfolio` et `ideas` (agent serveur)

**Files :**
- Modify : `server/src/ask/mcp.ts`, `server/src/ask/mcp-server.ts`, `server/src/ask/ask.ts` (`RUNWAY_API`, `--allowedTools`), `server/src/ask/prompt.ts` (schéma des tables Investir, consigne, `toolStepText`), `server/src/routes/ask.ts`, `server/src/app.ts` (`selfUrl?: string` dans `AppOptions`), `server/src/index.ts` (`selfUrl: http://127.0.0.1:${port}`)
- Test : `server/test/ask-mcp.test.ts`, `server/test/ask.test.ts`, `server/test/ask-prompt.test.ts`

- [ ] `createRunwayMcpServer(conn, today, { api }: { api: ((path: string) => Promise<unknown>) | null })`. `mcp-server.ts` construit `api` avec `fetch(process.env.RUNWAY_API + path)` ; il vaut `null` si `RUNWAY_API` est vide.
- [ ] Les champs gardés et retirés suivent la spec, section 3. La description de `ideas` explique la moyenne simple.
- [ ] Tests MCP avec un `api` simulé qui renvoie un `PortfolioView` et un `IdeasView` : champs gardés, `series` et `trades` absents, erreur d'outil si `api` vaut `null`.
- [ ] Étapes « Je regarde ton portefeuille… » et « Je regarde les idées… ».
- [ ] Commit.

### Task 4 : phrase des idées (moi)

**Files :** `client/src/components/invest/IdeasSection.tsx` et son test, s'il existe.

- [ ] Reprendre le texte de la spec, section 3, « Phrase des idées ».
- [ ] Commit.

### Task 5 : viseur, pastilles et envoi (moi)

**Files :**
- Create :
  - `client/src/components/ask/AskTarget.tsx` : `<AskTarget kind id label as? className? children>` ;
  - `client/src/components/ask/AskAim.tsx` : couche de survol et capture des clics ;
  - `client/src/components/ask/AskAim.module.css` ;
  - `client/src/components/ask/ask-target.ts` : `readTarget(el)` (de l'élément vers `AskRef`, snapshot compacté et tronqué), `pageLabel(pathname)` ;
  - leurs tests.
- Modify : `ask-context.ts` (les `refs`, `aiming`, `setAiming`, `addRef`, `removeRef`, et `AskTurn` qui gagne `refs` et `page`), `AskProvider.tsx` (envoi de `page` et `refs`, `retry` avec les refs d'origine), `AskPanel.tsx` et `.module.css` (bouton viseur, pastilles, refs sous la bulle).

- [ ] Tests d'abord :
  - viser, puis cliquer un bloc ajoute une pastille sans déclencher son `onClick` ;
  - Échap sort du mode ;
  - × retire une pastille ;
  - l'envoi transmet `refs` et `page`.
- [ ] Commit.

### Task 6 : baliser les écrans (moi)

**Files :** les composants listés dans la spec (Accueil, Budget, Opérations, Analyse, Investir, plus les fiches en dialogue).

- [ ] Envelopper chaque bloc avec `<AskTarget>`, sans changer la mise en page (`as` pour garder l'élément d'origine quand c'est un `li` ou une `section`).
- [ ] Commit.

### Task 7 : recette

- [ ] Copie de la base dans `tmp/`, serveur sur le port 3100 avec `~/.local/bin` dans le PATH, client sur 5180.
- [ ] Viser « Idées en cours » et une position, puis poser la question d'origine.
- [ ] Captures du survol, de l'étiquette, des pastilles, de la vue mobile et du thème sombre, s'il existe.
