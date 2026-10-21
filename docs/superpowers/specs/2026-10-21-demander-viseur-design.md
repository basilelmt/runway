# Runway - Demander avec viseur

Objectif : désigner d'un clic les blocs de l'app dont on parle à Demander, et que Demander voie enfin l'onglet Investir.

## Constat (21 octobre 2026)

- Question posée : « "Ensemble, les 5 idées en cours font -4,0 %, contre -1,0 % pour le S&P 500" : c'est faux non ? je perds beaucoup plus ».
  Demander a répondu deux fois qu'il ne voyait pas l'onglet Investir.
- La requête ne transmet que `{ question, sessionId }` : ni l'écran affiché, ni ce que l'utilisateur regarde.
- Les tables `ideas` et `idea_runs` sont hors de la liste blanche, et le rendement des idées ouvertes n'est stocké nulle part (calculé à l'affichage par `buildIdeasView`).
- `holdings`, `holding_trades` et `prices` sont lisibles mais absents du prompt, et la valeur actuelle d'une position dépend des cours en direct (`Prices`), pas de la base seule.
- Le -4,0 % est la moyenne simple des rendements des idées (`ideasTotal`, 100 € sur chacune), pas la performance du portefeuille réel.
  La phrase laisse croire le contraire.

## 1. Requête

`askRequestSchema` devient :

```ts
{
  question: string;            // inchangé
  sessionId: uuid | null;      // inchangé
  page: string | null;         // libellé de l'écran courant (« Investir », « Budget », « Réglages »…)
  refs: AskRef[];              // 0 à 8 blocs désignés
}
type AskRef = {
  kind: 'section' | 'idea' | 'holding' | 'envelope' | 'transaction' | 'account';
  id: number | null;           // null pour une section
  label: string;               // nom de la pastille, 1 à 80 caractères
  snapshot: string;            // texte visible du bloc au moment du clic, 0 à 1 500 caractères (tronqué côté client)
};
```

`page` et `refs` ont des valeurs par défaut (`null`, `[]`) pour que « Demander pourquoi » du Bilan et les suggestions continuent sans changement.

## 2. Contexte côté serveur

`runAsk` préfixe la question d'un bloc de contexte construit par `buildAskContext(page, refs)` (`server/src/ask/context.ts`), puis passe le tout à `claude -p` :

```
[Contexte : écran Investir]
[Bloc désigné : Idées en cours (section)]
Ensemble, les 5 idées en cours font -4,0 %…
[Bloc désigné : Ligne NVDA (holding 12)]
NVIDIA · Trade Republic · 1 240,00 € · -18,2 %
[Question]
c'est faux non ? je perds beaucoup plus
```

- Sans `page` ni `refs`, la question part telle quelle.
- Les sauts de ligne et crochets du `snapshot` sont conservés tels quels : c'est un texte affiché à l'utilisateur, pas une instruction.
- Le prompt système explique ce format : les blocs désignés sont ce que l'utilisateur regarde, « ce chiffre » ou « ça » renvoie à eux, le texte du bloc fait foi pour les chiffres affichés, et l'id permet d'aller chercher le détail (table ou outil selon `kind`).
- L'étape « Je regarde ce que tu m'as montré… » n'est pas ajoutée : le contexte ne coûte aucun appel d'outil.

## 3. Investir pour Demander

### Outils MCP `portfolio` et `ideas`

Le serveur MCP tourne dans un processus à part, avec la base en lecture seule : il ne peut pas rafraîchir les cours.
Les deux outils interrogent donc l'API de Runway qui l'a lancé, et renvoient les mêmes chiffres que l'écran.

- `askArgs` passe `RUNWAY_API` (par exemple `http://127.0.0.1:3000`) au serveur MCP.
  `createApp` reçoit `selfUrl`, fourni par `index.ts` à partir du port d'écoute, et le transmet à `askRoutes`.
  Sans `selfUrl` (tests), les deux outils répondent une erreur d'outil « Données d'investissement indisponibles ».
- `createRunwayMcpServer(conn, today, { api })` reçoit une fonction `api(path)` qui renvoie le JSON, injectable en test.
- `portfolio()` appelle `GET /api/invest/portfolio?range=1m` et renvoie `today`, `totals`, `stale`, et par position `id`, `platform`, `ticker`, `name`, `quantity`, `costBasis`, `value`, `gain`, `gainPct`, `dayChangePct`, `realized`, la date du premier achat et le nombre de mouvements.
  Courbes et détail des mouvements sont retirés (le détail reste accessible par `query` sur `holding_trades`).
- `ideas()` appelle `GET /api/invest/ideas` et renvoie, pour les idées ouvertes et closes, `id`, `createdOn`, `title`, `ticker`, `assetName`, `horizon`, `status`, `return`, `benchReturn`, `priceDate`, `risk`, puis `summary`.
  La description de l'outil précise que le total affiché « Ensemble, les N idées… » est la moyenne simple de `return` (et de `benchReturn`) des idées ouvertes cotées, sans montant investi : une idée n'est pas une position.
- Étapes affichées : « Je regarde ton portefeuille… » et « Je regarde les idées… ».
- `--allowedTools` gagne `mcp__runway__portfolio mcp__runway__ideas`.

### Prompt

- Le schéma décrit `holdings(id, platform, ticker, name, source)`, `holding_trades(id, holding_id, side, date, quantity, price_eur, fees…)` et `prices(ticker, date, close, currency)` (colonnes exactes reprises de `schema.ts` à l'implémentation).
- Consigne : pour une valeur, un gain ou une comparaison d'Investir, appeler `portfolio` ou `ideas` plutôt que recalculer en SQL ; distinguer les idées (suivi théorique) des positions (argent réel).

### Phrase des idées

`OpenTotal` dit ce qu'il calcule : « En moyenne, les 5 idées en cours font -4,0 % (100 € sur chacune), contre -1,0 % pour le S&P 500 sur les mêmes périodes. »
Une seule idée : « L'idée en cours fait -4,0 %, contre -1,0 % pour le S&P 500 sur la même période. »

## 4. Interface

### Blocs visables

`<AskTarget kind id label>` (`client/src/components/ask/AskTarget.tsx`) enveloppe un bloc : il rend un `div` (ou l'élément passé par `as`) avec `data-ask-kind`, `data-ask-id`, `data-ask-label`.
Hors du mode viseur il n'a aucun effet visible.

Premier lot :

| Écran | Sections | Éléments |
|---|---|---|
| Accueil | Mois en cours, Comptes, Opérations récentes | chaque compte, chaque opération |
| Budget | À répartir, Revenus du mois, Charges fixes | chaque enveloppe |
| Opérations | - | chaque opération |
| Analyse | Où part l'argent, Évolution, À venir, Bilan | chaque enveloppe du Bilan |
| Investir | Portefeuille, Graphique, Binance, Idées en cours, Score des idées | chaque position, chaque idée |

Les fiches ouvertes en dialogue ne sont pas visables : un dialogue modal rend le reste de l'écran inerte, panneau compris.
Pour une ligne ou une carte, les attributs sont posés sur l'élément même (`askTarget()`, prop `data` de `ListRow` et `KeyFigure`) plutôt que dans une enveloppe en plus.

### Mode viseur

- Un bouton viseur (icône `Crosshair`, libellé « Montrer un bloc ») dans le pied du panneau, à gauche du champ.
- Actif :
  - le bouton est enfoncé (`aria-pressed`), le curseur de la page devient une croix ;
  - au survol, le bloc visable le plus profond sous le pointeur reçoit un liseré `--marking` de 2 px et une étiquette avec son `label`, dessinés par une couche fixe au-dessus de la page (aucun style posé sur le bloc lui-même) ;
  - un clic ajoute la pastille, la capture se fait dans la phase de capture (`addEventListener('click', …, true)`) avec `preventDefault` et `stopPropagation` : aucun autre clic de l'app ne part, ni ouverture de fiche, ni lien ;
  - Entrée sur un bouton d'un bloc visable fait de même (le clic clavier passe par la même capture) ;
  - la navigation (barre latérale, barre du haut et du bas) reste cliquable, pour montrer des blocs de plusieurs écrans ;
  - le viseur est armé dès l'ouverture du panneau, sauf sur mobile, et le reste après l'envoi d'une question ;
  - un clic sur le bouton le range, la page redevient cliquable ; Échap ferme le panneau, viseur compris ;
  - un clic hors de tout bloc visable ne fait rien ;
  - un bloc déjà désigné n'est pas ajouté deux fois (même `kind`, `id`, `label`).
- Le panneau lui-même n'est pas visable, et le mode ne s'active que panneau ouvert.
- Sur mobile, le panneau couvre l'écran : le bouton viseur ferme le panneau le temps de viser, une barre en bas « Touche un bloc · Terminé » permet de revenir.

### Pastilles

- Au-dessus du champ, une rangée de pastilles (icône `Crosshair`, `label`, bouton ×), 8 au plus ; le bouton viseur est désactivé à 8.
- Survoler une pastille entoure le bloc correspondant s'il est encore à l'écran.
- À l'envoi, les pastilles partent avec la question, s'affichent sous la bulle de la question dans le fil, puis la rangée se vide.
- « Réessayer » renvoie la question avec ses pastilles et le `page` d'origine.
- Le `snapshot` est `innerText` du bloc, espaces compactés, tronqué à 1 500 caractères avec « … ».

### Écran courant

`page` est le libellé de l'entrée de `NAV` (ou « Réglages ») qui correspond à la route au moment de l'envoi, `null` ailleurs.

## 5. Tests

- `server/test/ask-context.test.ts` : bloc de contexte avec et sans `page`/`refs`, troncature, ordre.
- `server/test/ask-mcp.test.ts` : `portfolio` et `ideas` avec un `api` simulé (champs gardés, champs retirés, erreur sans API).
- `server/test/ask.test.ts` : la question envoyée à `claude` contient le contexte ; `--allowedTools` et `RUNWAY_API` dans les arguments.
- Schéma : `refs` au-delà de 8 refusé, valeurs par défaut.
- Client (`AskPanel.test.tsx` / `AskTarget.test.tsx`) : activer le viseur, cliquer un bloc ajoute une pastille sans déclencher son `onClick`, armé à l'ouverture, Échap ferme, retrait d'une pastille, envoi avec `refs` et `page`.
- Recette dans le navigateur sur une copie de la base : viser « Idées en cours » et une position, poser la question d'origine, vérifier que la réponse distingue idées et portefeuille avec les vrais chiffres ; vérifier les états visuels (survol, étiquette, pastilles, mobile).

## Hors périmètre

- Viser un point d'un graphique ou une cellule de tableau.
- Garder les pastilles d'une question à l'autre (la session Claude garde déjà le contexte).
- Ouvrir les tables `ideas`/`idea_runs` à `query`.
