# Runway - design

Runway est un logiciel personnel de suivi des dépenses, inspiré de Trackm (budget par pockets, prévision de découvert à 90 jours).
Il tourne en local, pour un seul utilisateur, en euros, en français, sans authentification ni chiffrement.

## Décisions prises

- Plateforme : web app locale, un serveur Node qui sert l'UI et l'API, données dans un fichier SQLite.
- Saisie : manuelle, plus import CSV La Banque Postale.
- Modèle : comptes (argent réel) + enveloppes (budget virtuel).
- Tri des opérations importées : règles de tri + liste "À trier", avec un bouton "Trier avec Claude".
- Claude est appelé via `claude -p` (Claude Code headless, abonnement de l'utilisateur), jamais via une clé API.
- Stack : TypeScript partout, React (Vite) côté client, Hono côté serveur, SQLite via Drizzle et better-sqlite3, zod pour les schémas partagés, Recharts pour les graphiques, vitest pour les tests.

## Modèle de données

Tous les montants sont des entiers en centimes.
Les dates sont des chaînes ISO `YYYY-MM-DD` (pas d'heure).
Les soldes ne sont jamais stockés, ils sont recalculés à partir des opérations.

### `accounts`

| Champ | Type | Note |
|---|---|---|
| id | integer | |
| name | text | unique |
| initial_balance | integer | centimes |
| on_budget | boolean | inclus dans "À répartir" |
| bank_account_number | text nullable | numéro lu dans l'en-tête du CSV, mémorisé au premier import |
| archived | boolean | |
| created_at | text | |

### `envelopes`

| Champ | Type | Note |
|---|---|---|
| id | integer | |
| name | text | unique |
| color | text | hex |
| monthly_target | integer nullable | objectif d'allocation mensuel, pour la barre de progression |
| sort_order | integer | |
| archived | boolean | |

### `transactions`

| Champ | Type | Note |
|---|---|---|
| id | integer | |
| kind | `expense` / `income` / `transfer` / `allocation` | |
| date | text | |
| amount | integer | toujours positif, le signe découle de `kind` |
| label | text | |
| note | text nullable | |
| account_id | integer nullable | compte débité (expense, transfer) ou crédité (income) |
| to_account_id | integer nullable | compte crédité (transfer) |
| envelope_id | integer nullable | enveloppe débitée (expense) ou crédité (allocation) ; null pour une dépense = "à trier" |
| from_envelope_id | integer nullable | enveloppe débitée (allocation) ; null = depuis "À répartir" |
| status | `confirmed` / `planned` | `planned` = générée par une règle récurrente, pas encore rapprochée |
| recurring_rule_id | integer nullable | règle qui a généré l'opération |
| import_id | integer nullable | |
| fingerprint | text nullable | sha1(compte + date + montant + libellé + index d'occurrence), unique si non null |
| created_at | text | |

Effets sur les soldes :

| kind | compte | enveloppe |
|---|---|---|
| expense | `account_id` -amount | `envelope_id` -amount |
| income | `account_id` +amount | aucune (l'argent tombe dans "À répartir") |
| transfer | `account_id` -amount, `to_account_id` +amount | aucune |
| allocation | aucun | `from_envelope_id` -amount (ou "À répartir"), `envelope_id` +amount |

Dérivés :

- Solde d'un compte = `initial_balance` + somme des effets.
- Solde d'une enveloppe = somme des effets.
- "À répartir" = somme des soldes des comptes `on_budget` - somme des soldes des enveloppes.
- Valeur nette = somme des soldes de tous les comptes non archivés.
- Les opérations `planned` comptent dans les soldes projetés mais pas dans les soldes actuels.

### `recurring_rules`

| Champ | Type | Note |
|---|---|---|
| id | integer | |
| name | text | |
| kind, amount, label, account_id, to_account_id, envelope_id, from_envelope_id | | même sémantique que `transactions` |
| frequency | `daily` / `weekly` / `monthly` / `yearly` | |
| interval | integer | tous les N (par défaut 1) |
| day_of_month | integer nullable | pour monthly/yearly, 1-31, borné au dernier jour du mois |
| start_date | text | |
| end_date | text nullable | |
| last_generated_date | text nullable | dernière occurrence matérialisée |
| active | boolean | |

Matérialisation :
à chaque démarrage du serveur et à chaque requête d'écriture, un service génère les occurrences dues jusqu'à aujourd'hui inclus.
Les allocations sont créées `confirmed`.
Les dépenses, revenus et transferts sont créés `planned`.
Les occurrences futures ne sont jamais écrites en base, elles sont calculées à la volée pour la prévision.

### `sorting_rules`

| Champ | Type | Note |
|---|---|---|
| id | integer | |
| pattern | text | sous-chaîne, insensible à la casse et aux accents |
| envelope_id | integer | |
| priority | integer | la première règle qui matche gagne |

### `imports`

| Champ | Type | Note |
|---|---|---|
| id | integer | |
| file_name | text | |
| account_id | integer | |
| imported_at | text | |
| row_count, new_count, duplicate_count, matched_count | integer | |

### `settings`

Table clé/valeur : `forecast_horizon_days` (90), `claude_model` (vide = défaut de Claude Code).

## Moteur de calcul (`core/`)

Fonctions pures, sans accès à la base, testées unitairement :

- `computeBalances(accounts, envelopes, transactions)` renvoie les soldes de chaque compte, de chaque enveloppe, "À répartir" et la valeur nette.
- `expandRule(rule, from, to)` renvoie les dates d'occurrence d'une règle sur un intervalle.
- `forecast(state, rules, today, horizonDays)` renvoie, jour par jour, les soldes projetés de chaque compte et enveloppe, plus pour chacun le premier jour négatif et le solde minimal.
- `matchPlanned(imported, planned)` rapproche une opération importée d'une opération `planned` : même compte, même montant, même sens, date à ±5 jours ; en cas d'égalité, la plus proche en date gagne, et chaque `planned` n'est rapprochée qu'une fois.
- `applySortingRules(label, rules)` renvoie l'enveloppe ou null.
- `normalizeLabel(label)` : minuscules, sans accents, espaces compactés.

## Import CSV

Interface `BankParser { detect(text): boolean; parse(text): ParsedStatement }`.
`ParsedStatement = { bankAccountNumber, rows: { date, label, amount }[] }`.

Parser La Banque Postale :

- décodage Windows-1252 ;
- lignes d'en-tête `Numéro Compte ;...`, `Solde (EUROS) ;...`, puis ligne de colonnes `Date;Libellé;Montant(EUROS)` ;
- séparateur `;`, virgule décimale, dates `jj/mm/aaaa`.
- Le format exact sera calé sur un vrai export fourni par l'utilisateur ; une fixture anonymisée vit dans `server/test/fixtures/`.

Flux :

1. `POST /api/imports/preview` reçoit le fichier, détecte le parser, relie le compte par `bank_account_number` (sinon l'UI demande le compte), calcule l'empreinte de chaque ligne et classe en `new` / `duplicate` / `matched` (avec l'id de la `planned` associée) ; les règles de tri sont appliquées et l'enveloppe proposée est renvoyée.
2. L'UI affiche l'aperçu ; l'utilisateur peut détacher un rapprochement ou en changer l'enveloppe.
3. `POST /api/imports/commit` écrit tout dans une transaction SQLite : création des nouvelles opérations, mise à jour des `planned` rapprochées (date, libellé, montant réel, `status = confirmed`, `import_id`, `fingerprint`), enregistrement de la ligne `imports`.

## Tri avec Claude

`POST /api/sorting/suggest` :

1. Charge les opérations à trier (max 60 par lot), les enveloppes, les règles de tri et jusqu'à 40 opérations déjà triées récentes comme exemples.
2. Lance `claude -p --tools "" --output-format json --json-schema <schema> [--model <settings>]` avec un prompt en français décrivant la tâche, le tout en JSON.
3. Lit `structured_output`, le valide avec zod :
   `{ suggestions: { transactionId, envelopeId | null, reason }[], rules: { pattern, envelopeId }[] }`.
4. Renvoie les suggestions à l'UI. Rien n'est écrit.

Erreurs gérées : binaire absent, non connecté, délai dépassé (120 s), sortie invalide.
Chaque cas renvoie un message distinct à l'UI.

## API (Hono, JSON)

Toutes les entrées sont validées par des schémas zod partagés dans `shared/`.

- `GET /api/overview` : soldes, "À répartir", valeur nette, alertes de prévision, nombre à trier.
- CRUD `/api/accounts`, `/api/envelopes`, `/api/transactions`, `/api/recurring-rules`, `/api/sorting-rules`.
- `GET /api/transactions` accepte `account`, `envelope`, `from`, `to`, `q`, `status`, `unsorted`.
- `POST /api/transactions/:id/confirm` confirme une `planned` à la main.
- `GET /api/forecast?horizon=90`.
- `GET /api/reports/spending?from&to`, `GET /api/reports/monthly?months=12`, `GET /api/reports/net-worth?months=12&horizon=90`.
- `POST /api/imports/preview`, `POST /api/imports/commit`, `GET /api/imports`.
- `POST /api/sorting/suggest`, `POST /api/sorting/apply` (liste de `{ transactionId, envelopeId }` + règles à créer).
- `GET /api/export.json` (sauvegarde complète), `GET /api/export.csv`.
- `GET /api/settings`, `PUT /api/settings`.

## Écrans

Navigation latérale sur desktop, barre basse sur mobile.
Un bouton "+" global ouvre la saisie rapide d'une opération depuis n'importe quel écran (raccourci `n`).

1. **Tableau de bord** : "À répartir" en grand, alertes de découvert, comptes avec soldes, enveloppes avec barre de progression vers l'objectif, sparkline de valeur nette, lien "X opérations à trier".
2. **Opérations** : liste filtrable (compte, enveloppe, période, recherche, statut), édition inline, suppression, badge "prévue" avec bouton confirmer.
3. **À trier** : une ligne par opération avec sélecteur d'enveloppe, proposition de règle après choix, bouton "Trier avec Claude", suggestions pré-remplies, "Tout accepter".
4. **Enveloppes** : cartes avec solde, objectif, bouton "Allouer", drag pour réordonner, dialogue "Déplacer de l'argent" entre enveloppes.
5. **Comptes** : liste, solde, création, archivage, dernier import.
6. **Récurrences** : liste avec prochaine occurrence, création et édition, pause.
7. **Prévision** : horizon réglable, tableau des alertes (quoi, quel jour, dans combien de jours, minimum atteint), courbe du solde projeté du compte ou de l'enveloppe sélectionné.
8. **Rapports** : camembert des dépenses par enveloppe sur une période, barres revenus vs dépenses par mois, courbe de valeur nette passée et projetée.
9. **Import** : dépôt de fichier, aperçu en trois groupes, confirmation, historique des imports.
10. **Règles de tri** : liste ordonnable, création, test d'un libellé.
11. **Paramètres** : horizon, modèle Claude, export JSON et CSV.

## Structure du projet

```
runway/
  package.json          scripts dev / build / start / test / lint
  shared/               schémas zod et types partagés
  core/                 moteur pur (soldes, prévision, rapprochement, tri)
  server/               Hono, Drizzle, parsers CSV, service Claude
  client/               Vite + React
  data/runway.db        base SQLite (gitignoré)
  docs/superpowers/     specs et plans
```

`npm run dev` lance le serveur (port 3000) et Vite (port 5173, proxy `/api`).
`npm run build` produit `client/dist`, servi par le serveur en production.

## Tests

- `core/` : tests unitaires exhaustifs (soldes, expansion de règles, prévision, rapprochement, règles de tri).
- `server/` : tests d'API sur une base SQLite en mémoire, et tests du parser CSV sur fixture.
- Le service Claude est testé avec un binaire factice injecté.
- `client/` : tests de composants ciblés sur les formulaires et l'aperçu d'import.

## Hors périmètre

Multi-utilisateur, authentification, chiffrement, synchronisation bancaire automatique, devises multiples.
