# Runway - Investir

Objectif : pousser à investir en rendant le portefeuille visible au quotidien et en proposant des idées tirées de l'actualité, dont la qualité est mesurée dans le temps.
Une idée part d'un événement daté et suit une chaîne de déduction courte (« bientôt la fête des nouilles, donc les gens auront besoin de baguettes, donc l'entreprise de baguettes »).
Chaque idée est suivie face au S&P 500 : le bilan dit honnêtement si ce type de raisonnement rapporte.

Point de départ de l'utilisateur : un ETF S&P 500 sur Trade Republic (3 000 € investis, environ 3 600 € aujourd'hui) et du Bitcoin sur Binance (3 000 € investis, environ 2 700 €).

## Décisions prises

- Nouvelle destination de navigation « Investir » (`/investir`), cinquième entrée après Analyse.
- Binance : synchronisation automatique par clé API en lecture seule.
  Une clé qui a le droit de trader ou de retirer est refusée à l'enregistrement.
- Trade Republic : pas d'API officielle, donc saisie manuelle des achats et ventes, cours récupéré automatiquement.
- Cours : Yahoo Finance (point d'accès non officiel `query1.finance.yahoo.com`, sans clé) pour tous les actifs, cryptos comprises (`BTC-EUR`).
  Binance ne sert qu'à lire les avoirs et l'historique d'achats, jamais les cours.
  Tout passe par un seul module `prices`, seul à connaître Yahoo.
- Idées : générées par `claude -p` avec l'outil `WebSearch`, sur le même modèle que le tri (exécuteur injectable, schéma JSON imposé, revalidation zod).
- Cadence des idées : une fournée hebdomadaire lancée à l'ouverture de l'écran si la dernière fournée réussie date de plus de 7 jours, plus un bouton « Trouver des idées ».
  Runway tourne en local, il n'y a pas de tâche de fond quand l'app est fermée.
- Univers des idées : sans limite (actions du monde entier, ETF, cryptos, matières premières via les contrats à terme Yahoo).
  Une idée dont le ticker n'a pas de cours sur Yahoo est rejetée : on ne garde que ce qu'on peut mesurer.
- Référence : l'ETF iShares Core S&P 500 coté en euros (`SXR8.DE`), constante partagée `BENCHMARK_TICKER`.
  Une idée est comparée à la référence sur la même période, en euros.
- Coût de revient : prix moyen pondéré (PMP), la méthode fiscale française.
  Une vente sort au PMP et dégage une plus-value réalisée.
- Les secrets Binance vivent dans la table `settings`, comme ceux d'Enable Banking (local, mono-utilisateur, sans chiffrement).

## Hors périmètre

- Passer des ordres, sur Binance ou ailleurs.
- Synchronisation Trade Republic (API interne non officielle, fragile, probablement contraire aux conditions d'utilisation).
- Liquidités en euros et stablecoins sur Binance : ignorées, ce ne sont pas des investissements.
- Dividendes, fiscalité, enveloppes fiscales (PEA, assurance-vie).
- Lien avec les comptes et enveloppes du budget : le portefeuille est un monde à part.

## Écran Investir

### Portefeuille

- En-tête : valeur totale, montant investi (coût de revient des positions ouvertes), plus-value latente en euros et en pour cent.
- Graphique de la valeur du portefeuille dans le temps, avec la courbe du montant investi, sur 1 mois, 6 mois, 1 an ou depuis le début.
- Une ligne par position : nom, plateforme, quantité, valeur, plus-value en euros et en pour cent, variation du jour.
  Au clic, le détail : les achats et ventes, avec ajout, modification et suppression des mouvements manuels.
- Bouton « Ajouter une position » : recherche Yahoo par nom, ticker ou ISIN, choix de la plateforme, puis premier achat.
- Bouton « Ajouter un achat » sur une position : date, quantité, montant payé en euros, frais.
- Ligne Binance : date de la dernière synchro, bouton « Synchroniser », bandeau d'erreur avec « Réessayer » si la dernière synchro a échoué.
- Si les cours sont indisponibles : les valeurs s'affichent avec le dernier cours connu et sa date (« cours du 5 oct. »).

### Idées

- Une carte par idée ouverte :
  - l'événement, avec le lien vers sa source ;
  - la chaîne de déduction, en 2 ou 3 étapes ;
  - l'actif, son ticker, où l'acheter (Trade Republic, Binance, ou ailleurs) ;
  - l'horizon (« d'ici le 28 oct. ») ;
  - une phrase « Déjà dans les prix ? », où Claude dit si le marché a probablement déjà intégré l'événement ;
  - le cours de départ, la performance depuis l'idée et celle de la référence sur la même période.
- Bouton « Trouver des idées », état « Claude cherche... » pendant la génération, compte-rendu à la fin (idées gardées, idées rejetées et pourquoi).
- Les idées dont l'horizon est passé sont closes avec leur verdict (« a battu le S&P 500 » ou non) et rangées dans une liste « Idées closes ».

### Bilan des idées

- Nombre d'idées closes, part de celles qui ont battu la référence, écart moyen.
- « 100 € sur chaque idée » : ce que ça aurait donné, face à 100 € sur la référence aux mêmes dates.

## Modèle de données

Montants en centimes d'euro, dates ISO `YYYY-MM-DD`, comme le reste de Runway.
Les quantités sont stockées en texte décimal exact (`"0.04512"`) : ni les centimes ni un flottant ne conviennent.
Les calculs se font en nombres flottants et sont arrondis au centime à la sortie.

### `holdings`

| Champ | Type | Note |
|---|---|---|
| id | integer | |
| platform | `trade_republic` / `binance` / `other` | |
| ticker | text | ticker Yahoo (`SXR8.DE`, `BTC-EUR`) |
| name | text | nom affiché |
| source | `manual` / `binance` | `binance` = créée et tenue par la synchro |
| external_asset | text nullable | actif Binance (`BTC`), unique avec `source` |
| synced_quantity | text nullable | dernier solde lu chez Binance |
| created_at | text | |

### `holding_trades`

| Champ | Type | Note |
|---|---|---|
| id | integer | |
| holding_id | integer | cascade |
| side | `buy` / `sell` | |
| date | text | |
| quantity | text | décimal positif |
| amount | integer | montant total en centimes d'euro, frais exclus |
| fees | integer | centimes |
| source | `manual` / `binance` | les mouvements `binance` ne sont pas modifiables à la main |
| external_id | text nullable | identifiant Binance, unique, pour ne rien importer deux fois |

### `prices`

| Champ | Type | Note |
|---|---|---|
| ticker | text | clé primaire avec `date` |
| date | text | |
| close | real | dans la devise de cotation |
| currency | text | `EUR`, `USD`, `KRW`... |
| fetched_at | text | |

Les taux de change sont des tickers comme les autres (`EURUSD=X`).
Une valeur en devise est convertie en euros avec le taux du même jour (à défaut, le dernier connu avant).

### `idea_runs`

| Champ | Type | Note |
|---|---|---|
| id | integer | |
| trigger | `manual` / `weekly` | |
| status | `running` / `done` / `failed` | |
| started_at, finished_at | text | |
| accepted_count | integer | |
| rejected | text | JSON : `[{ ticker, reason }]` |
| error | text nullable | |

Au démarrage du serveur, une fournée restée `running` passe en `failed` (« Interrompue par un redémarrage »).

### `ideas`

| Champ | Type | Note |
|---|---|---|
| id | integer | |
| run_id | integer | |
| created_on | text | jour de l'idée |
| title | text | phrase courte |
| event | text | l'événement |
| source_url | text | |
| reasoning | text | JSON : liste des étapes de la déduction |
| priced_in | text | « Déjà dans les prix ? » |
| ticker, asset_name | text | |
| where_to_buy | `trade_republic` / `binance` / `other` | |
| horizon | text | date |
| start_price_eur | real | cours de départ en euros |
| bench_start_price_eur | real | référence au même jour |
| status | `open` / `closed` | |
| final_return, bench_final_return | real nullable | rendements à l'horizon, figés à la clôture |

## Serveur

### `services/prices`

- `fetchQuote(ticker)` et `fetchHistory(ticker, from)` via `/v8/finance/chart/{ticker}`, `search(query)` via `/v1/finance/search`.
- Le client HTTP est injectable (`fetch`) pour les tests, avec un en-tête `User-Agent` de navigateur et un délai de 10 s.
- Le cours du jour est rafraîchi s'il date de plus de 15 minutes ; les clôtures passées sont gardées pour toujours.
- Une erreur Yahoo n'est jamais fatale : on renvoie la dernière valeur en base, marquée `stale` avec sa date.

### `services/binance`

- Requêtes signées HMAC-SHA256 via `node:crypto`, client HTTP injectable.
- Enregistrement de la clé : `GET /sapi/v1/account/apiRestrictions` doit montrer `enableReading` et aucun droit de trading, de retrait ou de transfert, sinon refus avec un message clair.
- Soldes : compte spot (`/api/v3/account`), compte Funding (`/sapi/v1/asset/get-funding-asset`) et Simple Earn flexible (`/sapi/v1/simple-earn/flexible/position`), additionnés par actif.
- Mouvements, importés depuis la dernière synchro (première synchro : depuis 3 ans) :
  - échanges spot sur les paires `{actif}EUR`, `{actif}USDT`, `{actif}USDC` qui existent (`/api/v3/myTrades`) ;
  - conversions (`/sapi/v1/convert/tradeFlow`) ;
  - achats par carte (`/sapi/v1/fiat/payments`).
- Un montant en USDT ou USDC est converti en euros au taux `EURUSD=X` du jour du mouvement.
- Un actif crypto dont la valeur dépasse 1 € devient une position `binance` avec le ticker Yahoo `{actif}-EUR` (vérifié auprès de `prices`).
- Si la quantité reconstituée par les mouvements diffère du solde, la position affiche l'écart (« 0,002 BTC sans prix d'achat ») et l'utilisateur peut compléter par un achat manuel.
- La synchro se lance à l'ouverture de l'écran si la dernière date de plus d'une heure, et via le bouton.
  Le résultat (date, erreur éventuelle) est stocké dans `settings`.

### `services/ideas`

- Prompt : date du jour, positions détenues, idées des 4 dernières semaines (pour éviter les répétitions), consignes : 3 à 5 idées, événements datés et sourcés, déduction en 2 ou 3 étapes, horizon entre 1 semaine et 1 an, ticker Yahoo exact, honnêteté sur « Déjà dans les prix ? ».
- Appel : `claude -p --tools WebSearch --allowedTools WebSearch --output-format json --json-schema ...`, modèle du réglage `claudeModel`, délai de 10 minutes.
- Chaque idée est validée : ticker coté sur Yahoo, horizon dans les bornes, URL de source bien formée.
  Le cours de départ et celui de la référence sont fixés à ce moment.
- Une fournée tourne en tâche asynchrone dans le processus serveur : `POST` répond tout de suite avec la fournée, le client interroge son statut.
  Une seule fournée à la fois.
- Clôture paresseuse : à chaque lecture, une idée dont l'horizon est passé est close avec les clôtures du jour de l'horizon (à défaut, la dernière avant).

### Routes `/api/invest`

| Route | Rôle |
|---|---|
| `GET /portfolio?range=1m\|6m\|1y\|all` | positions valorisées, totaux, série du graphique |
| `GET /search?q=` | recherche d'actifs Yahoo |
| `POST /holdings`, `DELETE /holdings/:id` | créer une position manuelle (avec son premier achat), supprimer une position manuelle |
| `POST /holdings/:id/trades`, `PATCH /trades/:id`, `DELETE /trades/:id` | mouvements manuels |
| `GET /binance`, `PUT /binance`, `DELETE /binance` | état, enregistrement (avec vérification des droits), déconnexion (supprime les positions synchronisées) |
| `POST /binance/sync` | `{ onlyIfStaleMinutes? }` |
| `GET /ideas` | idées ouvertes, closes, bilan, dernière fournée |
| `POST /ideas/runs` | `{ trigger: 'manual' \| 'weekly' }` ; `weekly` ne lance rien si une fournée réussie a moins de 7 jours |
| `GET /ideas/runs/:id` | statut d'une fournée |

### Cœur pur (`core/invest.ts`)

- Décimal en texte : addition, soustraction, comparaison sans perte pour les quantités.
- PMP, quantité détenue, coût de revient, plus-value réalisée à partir d'une liste de mouvements.
- Valorisation à une date avec conversion de devise.
- Série du portefeuille jour par jour.
- Rendement d'une idée, verdict, bilan « 100 € par idée ».

## Erreurs

- Yahoo en panne : dernière valeur connue, marquée avec sa date ; jamais d'écran cassé.
- Binance en erreur (clé révoquée, réseau, limite de requêtes) : l'erreur est stockée et affichée sur la ligne Binance, les données déjà synchronisées restent.
- Claude absent, non connecté, trop lent ou réponse invalide : la fournée passe en `failed` avec le message, déjà rédigé pour le tri (`ClaudeError`).
- Idée invalide : rejetée et listée dans le compte-rendu de la fournée.

## Tests

- `core/invest.test.ts` : décimal, PMP avec achats et ventes, valorisation multi-devise, série, rendement, verdict, bilan.
- Serveur, avec des réponses HTTP enregistrées : `prices` (cache, cours périmé, devise), `binance` (signature, refus d'une clé trop permissive, soldes additionnés, mouvements et dédoublonnage, écart), `ideas` (faux `claude` avec tickers valides et invalides, réponse illisible, fournée concurrente, clôture), routes.
- Client : écran avec portefeuille vide, plein, cours périmés ; dialogue d'achat ; carte d'idée.
- De bout en bout dans le navigateur, en clair et en sombre, à 1440px et 390px : saisie de la ligne Trade Republic, synchro Binance avec la vraie clé, vraie fournée d'idées.
- `npm run typecheck`, `npm run lint` et `npm test` au vert.
