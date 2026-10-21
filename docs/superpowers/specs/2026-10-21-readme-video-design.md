# README et vidéo de présentation

## Objectif

Un README qui donne envie dès le premier écran, ouvert par une vidéo de présentation de Runway en motion design.
La vidéo mêle titres animés aux couleurs de Runway et vraies captures de l'app, montées en mouvement.

## Hors périmètre

- La musique et la voix : la vidéo est muette.
- La publication : le dépôt n'a pas de remote, mais tout est prêt pour GitHub.
- Une version anglaise.

## Outil

Remotion : la vidéo est un projet React rendu en MP4.
Il reprend les tokens de `client/src/styles/tokens.css` (papier, encre, jaune de piste, tarmac, nuit d'Investir) et les polices Bricolage Grotesque, Instrument Sans et IBM Plex Mono.
Un nouveau rendu après un changement d'interface tient en une commande.

Le projet vit dans `video/` à la racine, avec son propre `package.json`, pour ne pas toucher aux dépendances de l'app.
`video/` est exclu de la vérification TypeScript, de eslint et de vitest de l'app s'ils le ramassent ; il a son propre `typecheck`.
Commande : `npm run render` dans `video/` produit tous les fichiers de `docs/media/`.

## Fichiers produits

Dans `docs/media/`, versionnés :

- `runway-presentation.mp4` : 1920×1080, 30 i/s, H.264, muette, environ 32 s ;
- `runway-presentation.gif` : boucle de 6 à 8 s tirée de la vidéo, 960 px de large, moins de 8 Mo ;
- `poster.png` : affiche 1920×1080, image d'ouverture ;
- `screens/*.png` : captures de l'app utilisées par la vidéo et la grille du README.

## Captures

- Serveur de recette sur un autre port, avec `~/.local/bin` dans le PATH.
- Base dédiée via `RUNWAY_DB`, dans `tmp/`, remplie par un script de données inventées : un profil crédible (salaire, loyer, enveloppes, charges fixes, opérations sur trois mois, un relevé CSV à importer, un portefeuille et des idées).
  La vraie base de `data/` n'est jamais lue ni modifiée.
- Le script de données vit dans `video/scripts/` pour que les captures puissent être refaites.
- Captures dans Chrome en 1440×900, facteur 2, mode clair (Investir garde son fond nuit).
- Écrans : Budget, Demander (question, réponse, viseur, panneau des travaux), Investir (portefeuille, une idée face au S&P 500), Analyse « À venir » (prévision et alerte), Import (dépôt, aperçu nouvelles / rapprochées / doublons), Opérations à ranger avec le tri de Claude.

## Récit

Environ 32 s, une trentaine de plans de 1 à 2 s, coupés sec (première version de 70 s jugée trop longue).

1. **Ouverture** : « Ton argent, / jusqu'à la / prochaine paie. » claque mot à mot sur une piste vue du cockpit, puis le logo se pose et un avion passe.
2. **Cinq parties** (Enveloppes, Demander, Prévision, Investir, Import) : chacune ouverte par un carton plein écran (numéro et nom), puis deux à quatre plans de captures.
3. **Mur** : toutes les captures, inclinées, qui reculent.
4. **Fin** : « En local. / Sans compte. / Sans cloud. », puis le logo et `npm install && npm run dev`, et l'avion qui décolle.

Effets : captures inclinées en 3D qui se redressent, zooms qui claquent (« punch »), glissés flous (« whip »), éclairs jaunes sur les coupes, contour jaune du viseur, pointeur qui clique, encarts d'explication, montants qui défilent.
Le GIF reprend le logo puis trois plans (Budget, Demander, Prévision), environ 6 s.

## README

En tête :

- le GIF, lien vers le MP4 ;
- le titre et l'accroche ;
- des pastilles : local-first, Node 24, SQLite, Claude.

Puis une section « Ce que fait Runway » : une grille de captures avec une phrase pour chacun des cinq sujets de la vidéo.

Ensuite les sections pratiques actuelles, gardées et à peine retouchées, avec une phrase par ligne.
Une ligne explique comment refaire la vidéo.

## Vérification

- Lecture du MP4 image par image aux moments clés : texte coupé, alignements, débordements, fluidité des transitions.
- Poids et boucle du GIF.
- Rendu du README dans un aperçu Markdown de type GitHub.
- `npm run typecheck`, `npm run lint` et `npm test` de l'app restent verts.
