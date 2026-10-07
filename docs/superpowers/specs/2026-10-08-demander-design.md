# Runway - Demander à Claude

Objectif : poser une question en français sur ses finances (« combien en restos depuis mars ? ») et obtenir une réponse juste, un graphique si c'est utile, et des actions proposées qu'on applique d'un clic.
Claude lit la base SQLite locale en lecture seule ; il ne modifie jamais rien lui-même.

## Décisions prises

- Claude répond et peut proposer quatre actions : ranger des opérations (avec règle de tri en option), déplacer de l'argent entre enveloppes, changer un budget mensuel, créer une charge fixe.
  Rien ne s'applique sans un clic de l'utilisateur, et l'application passe par les routes existantes.
- Conversation avec suite : les questions s'enchaînent dans un fil qui garde le contexte, le temps de la session du navigateur.
  Le fil n'est pas enregistré en base et disparaît au rechargement.
- Panneau disponible partout : bouton « Demander » sous « Nouvelle opération » et touche `k` sur ordinateur, bouton dans l'en-tête sur mobile.
  Le panneau est non modal : la page reste visible et utilisable, et se met à jour quand une action est appliquée.
- Moteur : `claude -p` avec un unique outil MCP `query` qui exécute du SQL en lecture seule.
  Claude interroge la base autant de fois que nécessaire et corrige ses requêtes en erreur.
  Essai concluant le 8 octobre 2026 : réponse exacte (2 644,70 € sur 133 dépenses) en 4 tours et environ 6 secondes.
- Comme pour le tri, les données passent par l'abonnement Claude de l'utilisateur, sans clé API.

## Hors périmètre

- Historique des conversations enregistré en base.
- Actions autres que les quatre listées (suppression, modification d'opérations, réglages).
- Réponse rédigée affichée mot à mot pendant qu'elle s'écrit : seules les étapes défilent pendant l'attente.
- Questions sur le portefeuille d'investissement et les idées (tables accessibles, mais le prompt ne les documente pas).

## Lancement de Claude

```
claude -p
  --setting-sources ""                         # ni CLAUDE.md, ni skills, ni plugins de l'utilisateur
  --settings '{"autoMemoryEnabled":false}'     # pas de mémoire automatique
  --system-prompt <prompt Runway>              # remplace le prompt de Claude Code (contexte d'environ 2 200 tokens)
  --tools ""                                   # aucun outil intégré : ni fichiers, ni shell, ni web
  --mcp-config <JSON du serveur runway> --strict-mcp-config
  --allowedTools mcp__runway__query
  --output-format stream-json --verbose
  --json-schema <schéma de réponse>
  --session-id <uuid>   (première question)   |   --resume <uuid>   (suites)
  [--model <réglage claudeModel>]
  <question>
```

- Lancé depuis un dossier de travail dédié, `<dossier de la base>/claude-ask/`, pour que les sessions soient rangées à part et n'apparaissent pas dans `claude --resume` du dépôt.
- `--safe-mode` et `--bare` ont été écartés : le premier désactive aussi le serveur MCP fourni, le second exige une clé API.
- Variable `CLAUDECODE` vidée, comme pour le tri.
- Délai maximal : 120 secondes par question.

## Serveur MCP `runway`

`server/src/ask/mcp-server.ts`, lancé par `claude` en stdio avec `tsx`, chemin de la base passé par la variable `RUNWAY_DB`.
Dépendance ajoutée : `@modelcontextprotocol/sdk`.

- Ouvre la base avec `better-sqlite3` en `readonly: true` et `PRAGMA query_only = ON` : toute écriture échoue au niveau de SQLite.
- Un seul outil, `query({ sql })` : exécute une instruction unique et renvoie au plus 200 lignes en JSON, avec un avertissement si le résultat est tronqué.
- Une erreur SQL est renvoyée comme résultat d'outil (`isError: true`) avec le message de SQLite, pour que Claude se corrige.

La logique d'exécution est une fonction pure testable, `runReadOnlyQuery(db, sql)`, dans `server/src/ask/query.ts`, partagée avec l'exécution des graphiques.

## Prompt système

Généré par `buildAskSystemPrompt(today, envelopes, accounts)` dans `server/src/ask/prompt.ts` :

- rôle, ton (tutoiement, phrases courtes, français), date du jour ;
- schéma utile des tables `transactions`, `envelopes`, `accounts`, `recurring_rules`, `sorting_rules` et leurs pièges : montants en centimes toujours positifs, sens donné par `kind`, `status = 'planned'` exclu des montants réels, allocations qui déplacent de l'argent sans dépense, enveloppes d'épargne (`is_savings`), comptes hors budget (`on_budget = 0`), dépenses à trier (`envelope_id IS NULL`) ;
- liste des enveloppes et des comptes avec leurs identifiants ;
- consignes : toujours vérifier les chiffres avec `query` avant de répondre, ne jamais inventer un montant, proposer une action seulement si la question y invite ou si elle découle naturellement de la réponse ;
- description des quatre actions et du graphique.

## Réponse structurée

Schéma JSON imposé (`--json-schema`), revalidé avec zod (`askAnswerSchema` dans `shared/schemas.ts`) :

```ts
{
  answer: string;                       // 1 à 4 phrases
  highlight: { label: string; amount: Cents } | null;
  chart: { kind: 'bar' | 'line'; title: string; sql: string } | null;
  actions: AskAction[];                 // 0 à 5
}
```

### Graphique

Claude ne recopie pas les chiffres : il fournit la requête du graphique, qui doit renvoyer des colonnes `label` (texte) et `value` (centimes).
Le serveur l'exécute avec `runReadOnlyQuery` ; si elle échoue ou ne respecte pas ce format, le graphique est simplement omis.
Le client l'affiche avec Recharts, avec le même langage visuel que les graphiques d'Analyse (`chart.module.css`, `ChartTooltip`, `axisEuros`).

### Actions

```ts
type AskAction =
  | { type: 'sort'; transactionIds: number[]; envelopeId: number; rulePattern: string | null }
  | { type: 'move'; fromEnvelopeId: number | null; toEnvelopeId: number; amount: Cents }   // null = « À répartir »
  | { type: 'budget'; envelopeId: number; monthlyTarget: Cents | null }
  | { type: 'recurring'; rule: RecurringRuleInput };
```

Le serveur valide chaque action (`validateActions` dans `server/src/ask/actions.ts`) et l'enrichit pour l'affichage :

- `sort` : opérations existantes, de type dépense, au plus 500 ; enveloppe active ; ajoute le nombre, le total et le nom de l'enveloppe ; motif d'au moins 2 caractères ou `null`.
- `move` : enveloppes actives et différentes, montant positif ; ajoute les noms.
- `budget` : enveloppe active ; ajoute le nom et le budget actuel.
- `recurring` : passe `recurringRuleInputSchema`, compte et enveloppe actifs ; ajoute le nom du compte (la phrase de fréquence est formée côté client par `describeFrequency`).

Une action invalide est retirée en silence, et le nombre d'actions écartées est journalisé côté serveur.

### Application

Le client applique avec les hooks existants, sans nouvelle route d'écriture :

| Action | Hook | Route |
|---|---|---|
| sort | `useApplySorting` | `POST /api/sorting/apply` (assignations + règle éventuelle) |
| move | `useCreateTransaction` | `POST /api/transactions` (`kind: 'allocation'`, date du jour) |
| budget | `useUpdateEnvelope` | `PATCH /api/envelopes/:id` |
| recurring | `useCreateRecurringRule` | `POST /api/recurring-rules` |

Une carte appliquée passe à l'état « Fait » ; une erreur s'affiche dans la carte, qui reste applicable.

## API et flux

`POST /api/ask` avec `{ question: string (1 à 500 caractères), sessionId: string | null }`.
La réponse est un flux SSE (`streamSSE` de Hono) :

- `step` : `{ text }` à chaque appel de l'outil, avec une phrase courte tirée de la requête (« Je consulte tes opérations… », « Je calcule par mois… ») et, à défaut, « Je vérifie dans tes données… » ;
- `answer` : `{ sessionId, answer, highlight, chart: { kind, title, rows } | null, actions: AskActionView[] }` ;
- `error` : `{ message, code }`, avec les codes de `ClaudeError` (`claude_not_installed`, `claude_not_logged_in`, `claude_timeout`, `claude_invalid_output`, `claude_error`).

Le serveur lit la sortie `stream-json` ligne à ligne : les blocs `tool_use` de `mcp__runway__query` produisent un `step`, l'événement final `result` porte `structured_output`.
Si le client ferme la connexion (panneau fermé, nouvelle question), le processus `claude` est tué.

`execClaude` renvoie la sortie complète : un nouvel exécuteur injectable `spawnClaudeStream(args, { cwd, timeoutMs, onLine, signal })` est ajouté à `services/claude.ts`, sur le même modèle (exécutable `claude`, `CLAUDECODE` vidé, traduction des erreurs connues).
Les tests l'injectent avec un faux qui rejoue des lignes `stream-json` enregistrées.

## Interface

### Ouverture

- Ordinateur : bouton « Demander » (icône étincelle, raccourci `K` affiché) sous « Nouvelle opération » dans `SideNav`, et touche `k` hors champ de saisie, gérée comme `n` dans `QuickAddProvider`.
- Mobile : bouton icône « Demander » dans l'en-tête de `Shell`, à gauche des réglages.
- `AskProvider` (contexte, comme `QuickAddProvider`) garde l'état d'ouverture et le fil, pour qu'il survive aux changements de page.

### Panneau

- `aside` non modal à droite, 420 px de large sur ordinateur, plein écran sur mobile ; `Échap` le ferme, le focus va dans le champ à l'ouverture et revient au bouton à la fermeture.
- En-tête : « Demander », bouton « Nouvelle conversation » (vide le fil et oublie la session), bouton fermer.
- Fil : questions à droite, réponses à gauche.
  Une réponse affiche le chiffre mis en avant, la phrase, le graphique puis les cartes d'action.
- Pendant l'attente : la dernière étape reçue, avec une animation discrète ; un bouton « Arrêter » coupe la requête.
- Fil vide : trois suggestions cliquables (« Combien en restos ce mois-ci ? », « Mes plus grosses dépenses du mois dernier », « Quels abonnements ont augmenté cette année ? »).
- Champ en bas : `textarea` qui grandit jusqu'à 4 lignes, `Entrée` envoie, `Maj+Entrée` va à la ligne, désactivé pendant une requête.
- Erreur : message dans le fil avec « Réessayer ».

### Carte d'action

- Titre selon le type : « Ranger 12 dépenses (143,20 €) dans Transports », « Déplacer 50,00 € de Shopping vers Restos », « Passer Restos à 150,00 € par mois (au lieu de 180,00 €) », « Créer la charge fixe Spotify : 11,99 € tous les mois le 4 ».
- Pour `sort`, une case « Créer aussi la règle « UBER » » cochée par défaut quand un motif est proposé.
- Bouton « Appliquer », puis état « Fait » avec une coche.

## Tests

- `server/test/ask-query.test.ts` : `runReadOnlyQuery` refuse les écritures (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `ATTACH`, `PRAGMA` d'écriture), plusieurs instructions, tronque à 200 lignes.
- `server/test/ask-actions.test.ts` : validation et enrichissement des quatre actions, rejet des identifiants inconnus, des enveloppes archivées, des opérations qui ne sont pas des dépenses.
- `server/test/ask.test.ts` : route `POST /api/ask` avec un faux exécuteur ; étapes, réponse, graphique exécuté, action invalide retirée, session reprise (`--resume` au deuxième appel), arguments de lancement (isolation), erreurs Claude.
- `server/test/ask-mcp.test.ts` : le serveur MCP répond à `tools/list` et `tools/call` via le client du SDK.
- Tests client : panneau (ouverture au clavier, envoi, étapes, réponse, suggestions, erreur, nouvelle conversation), cartes d'action (texte, application, état « Fait », case de règle).
- Recette dans le navigateur sur une copie de la vraie base, avec de vraies questions et l'application de chaque type d'action, à 1440 px et 390 px, en clair et en sombre.
- `npm run typecheck`, `npm run lint` et `npm test` au vert.
