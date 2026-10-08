# Runway - Idées : plus de sources et un critique

Objectif : n'afficher que des idées d'investissement vraiment prometteuses, trouvées dans plus d'endroits.
Constat de départ : les 5 idées de la première fournée (7 octobre 2026) avaient toutes un « Déjà dans les prix ? » qui répondait « largement » ou « en bonne partie intégré ».
Claude devait sortir 3 à 5 idées quoi qu'il arrive, avec une seule URL, et jugeait lui-même ce qu'il venait d'écrire.

## Décisions prises

- Une fournée devient un pipeline en trois étapes : quatre chercheurs en parallèle, vérification et enrichissement par le serveur, puis un critique séparé.
- Chercheurs et critique ont `WebSearch` et `WebFetch` : ils lisent les pages en entier, pas seulement les extraits de recherche.
- Zéro idée retenue est un résultat normal : pas de quota, pas de minimum.
- Les pistes écartées par le critique sont enregistrées et suivies jusqu'à l'horizon comme les autres, mais jamais affichées en carte.
  Le Bilan compare retenues et écartées pour mesurer si le tri du critique a de la valeur.
- Le coût en appels n'est pas une contrainte (abonnement Claude).
- On ne publie jamais une piste qui n'a pas été critiquée.

## Hors périmètre

- Changer la cadence (toujours hebdomadaire, plus le bouton « Trouver des idées »).
- Changer la référence (S&P 500, `SXR8.DE`) ou la mesure de performance.
- Afficher les écartées en cartes, ou permettre de repêcher une écartée.
- Choisir les angles depuis l'interface.

## Étape 1 : quatre chercheurs

Quatre appels `claude -p` lancés en parallèle, chacun avec un angle imposé.
Les angles vivent dans une constante serveur `IDEA_ANGLES` (clé stable et libellé français) :

| Clé | Libellé | Où il fouille |
|---|---|---|
| `calendar` | Calendrier | Événements datés à venir : sorties de produits, décisions réglementaires, salons, compétitions, fêtes, saisons, publications de résultats |
| `international` | International | Presse étrangère hors anglophone (Asie, Europe), sujets que la presse financière américaine n'a pas encore repris |
| `primary` | Sources primaires | Communiqués d'entreprises, régulateurs (FDA, EMA, Commission européenne...), appels d'offres, publications officielles |
| `supply` | Approvisionnement | Pénuries, matières premières, météo, logistique, effets de second ordre (le fournisseur du fournisseur) |

Prompt commun, complété par la consigne propre à l'angle :
- date du jour, positions détenues, idées des 4 dernières semaines (retenues et écartées), comme aujourd'hui ;
- 2 à 4 pistes, sans se censurer : le tri est fait ensuite par quelqu'un d'autre ;
- privilégier le bénéficiaire le moins évident plutôt que le nom auquel tout le monde pense ;
- chaque piste cite toutes les pages réellement lues qui l'appuient, dans `sources` (au moins une) ;
- mêmes consignes qu'aujourd'hui pour le ticker Yahoo, l'horizon, `whereToBuy`, le titre et la déduction en 2 ou 3 étapes.

Le chercheur ne remplit plus `pricedIn` : c'est le travail du critique.

Schéma de sortie d'un chercheur (écrit à la main, revalidé avec zod) :
`{ ideas: [{ title, event, sources: string[], reasoning: string[], ticker, assetName, whereToBuy, horizon }] }`.

Délai : `RESEARCH_TIMEOUT_MS = 600_000` par chercheur.
Les chercheurs sont attendus avec `Promise.allSettled` : un chercheur en échec est noté dans `failedAngles` et la fournée continue.
Si les quatre échouent, la fournée échoue avec l'erreur du premier.

## Étape 2 : vérification et enrichissement par le serveur

- Filtres existants appliqués à chaque piste : format, horizon entre 7 jours et 1 an, déjà détenu, ticker connu de Yahoo.
- Dédoublonnage par ticker entre chercheurs : la première piste gagne, les suivantes sont rejetées avec « Doublon ».
- Idée déjà ouverte sur le même ticker : rejet seulement si cette idée ouverte est affichée (retenue ou d'avant la critique).
  Une écartée ouverte ne bloque pas une nouvelle piste sur le même actif.
- Faits de marché pour chaque piste restante et pour la référence, calculés à partir de l'historique en euros (`prices.historyEur`) :
  variation sur 1 mois et sur 3 mois (dernière clôture au plus tard 30 et 91 jours avant aujourd'hui, comparée au cours actuel).
  Le calcul est une fonction pure dans `core/invest.ts`.
  Une variation incalculable vaut `null` et est présentée au critique comme « inconnue ».
- Si aucune piste ne passe les filtres, la fournée se termine `done` avec 0 idée, sans appeler le critique.

## Étape 3 : le critique

Un appel `claude -p` séparé, avec `WebSearch` et `WebFetch`.
Il reçoit, pour chaque piste : ticker, actif, titre, événement, sources, déduction, horizon, et les faits de marché (piste et S&P 500, 1 mois et 3 mois).
Consigne adverse :
- son rôle est de protéger un particulier de mauvaises idées, pas d'en trouver de bonnes ;
- chercher activement pourquoi la piste est mauvaise : information déjà largement reprise, cours qui a déjà bougé, effet trop petit par rapport à la taille de l'entreprise, déduction fragile, source douteuse ;
- vérifier les sources lui-même ;
- retenir une piste seulement s'il y a une vraie raison de penser que le marché ne l'a pas encore intégrée ;
- zéro retenue est une réponse acceptable et fréquente.

Schéma de sortie : `{ reviews: [{ ticker, verdict: 'kept' | 'dropped', reason, pricedIn, risk }] }`.
- `reason` : la raison principale du verdict, une phrase.
- `pricedIn` : « Déjà dans les prix ? », une ou deux phrases.
- `risk` : ce qui peut mal tourner, une phrase.

Délai : `REVIEW_TIMEOUT_MS = 900_000`.
Si le critique échoue ou renvoie un format invalide, la fournée échoue et rien n'est enregistré.
Une piste sans verdict valide est enregistrée écartée, avec la raison « Non évaluée par le critique » et `pricedIn`/`risk` vides.
Un verdict sur un ticker qui n'a pas été soumis est ignoré.

## Données

Une migration Drizzle.

Table `ideas` :
- `source_url` devient `sources` : liste JSON d'URL. Les idées existantes sont migrées en liste à un élément.
- `verdict` : `'kept' | 'dropped'`, nullable. `null` = idée d'avant la critique, traitée comme affichée.
- `critique` : raison du critique, nullable.
- `risk` : ce qui peut mal tourner, nullable.
- `angle` : clé du chercheur d'origine, nullable.
- `perf_1m`, `perf_3m`, `bench_perf_1m`, `bench_perf_3m` : faits de marché vus par le critique, en fraction, nullables.
- `priced_in` reste obligatoire : pour les nouvelles idées il vient du critique (chaîne vide si non évaluée).

Table `idea_runs` :
- `phase` : `'research' | 'review'`, nullable, mise à jour pendant la fournée.
- `candidate_count` : nombre de pistes proposées par les chercheurs.
- `failed_angles` : liste JSON des clés d'angle en échec.
- `accepted_count` compte les retenues.
- `rejected` (`[{ ticker, reason }]`) contient les rejets techniques et les écartées par le critique, avec leur raison.

Les écartées sont closes à l'horizon par `closeDueIdeas`, exactement comme les retenues.

## API

- `IdeaView` : `sourceUrl` devient `sources: string[]`, ajout de `risk: string | null` et `marketContext: { perf3m: number; benchPerf3m: number } | null`.
- `IdeasView.open` et `IdeasView.closed` ne contiennent que les idées affichées (`verdict` `kept` ou `null`).
- `IdeaRunView` : ajout de `phase`, `candidateCount`, `failedAngles: { key, label }[]`.
- `IdeasSummary` : la partie existante ne compte que les idées affichées.
  Ajout de `filter: { keptCount, keptAvgExcess, droppedCount, droppedAvgExcess } | null`, calculé sur les idées closes de verdict `kept` et `dropped` uniquement (les idées d'avant la critique en sont exclues).
  `null` tant qu'il n'y a pas au moins une retenue close et une écartée close.

## Écran

Carte d'idée :
- toutes les sources en liens, par nom de domaine, après l'événement ;
- ligne « Ce qui peut mal tourner » avec le risque, sous « Déjà dans les prix ? », si présent ;
- contexte de marché si présent : « +18 % sur 3 mois (S&P 500 +4 %) ».

Fournée en cours, message selon la phase :
- `research` : « 4 chercheurs fouillent l'actualité. Ça prend plusieurs minutes, tu peux continuer ailleurs. »
- `review` : « Claude passe les pistes au crible. »

Rapport de fin :
- « 2 idées retenues sur 9 pistes », ou « Rien de convaincant cette semaine · 9 pistes écartées » ;
- chercheurs en échec signalés : « Le chercheur International n'a pas répondu. » ;
- « Voir pourquoi » liste les rejets et écartées (ticker et raison), sans carte.

Bilan, ligne ajoutée quand `filter` n'est pas `null` :
« Face au S&P 500, les retenues ont fait +X % en moyenne (N), les écartées +Y % (M). »
suivie de « Le tri de Claude aide. » si X > Y, sinon « Le tri de Claude n'aide pas encore. ».

## Tests

Serveur (`server/test/ideas.test.ts`), avec un `exec` simulé qui répond selon le prompt (angle de chercheur ou critique) :
- pipeline complet : seules les retenues sont `kept`, les écartées sont enregistrées `dropped` avec critique, risque et faits de marché ;
- un chercheur en échec : la fournée continue, `failedAngles` le contient ;
- tous les chercheurs en échec, ou critique en échec : fournée `failed`, aucune idée enregistrée ;
- zéro retenue : fournée `done`, 0 idée affichée ;
- aucune piste après filtres : le critique n'est pas appelé ;
- dédoublonnage entre chercheurs, filtres existants, écartée ouverte qui ne bloque pas ;
- faits de marché transmis au critique ;
- verdict manquant (écartée « Non évaluée ») et verdict sur un ticker inconnu (ignoré) ;
- `phase` mise à jour pendant la fournée ;
- migration des idées existantes (`sources` à un élément, `verdict` `null`) ;
- vue : les écartées n'apparaissent ni dans `open` ni dans `closed`.

Core (`core/invest.test.ts`) : variations sur 1 et 3 mois (historique trop court, trous de cotation), résumé `filter`.

Client (`client/src/lib/invest.test.ts`) : formatage du contexte de marché.

Validation de bout en bout :
- une vraie fournée sur une copie de la base, sur un autre port, sans toucher à `data/runway.db` ;
- lecture critique du résultat (variété des pistes, raisons des écartées, retenues moins évidentes que celles du 7 octobre), ajustement des prompts si besoin ;
- vérification visuelle dans le navigateur, sur ordinateur et sur mobile : cartes, rapport, Bilan, état « Rien de convaincant ».
