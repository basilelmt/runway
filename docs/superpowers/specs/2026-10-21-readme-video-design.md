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

- `runway-presentation.mp4` : 1920×1080, 30 i/s, H.264, muette, environ 50 s ;
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

Environ 38 s, coupés sec : 0,7 à 1 s pour un ou deux mots en gros, plus longs (5 à 7 s) quand il se passe beaucoup de choses à l'écran, sur des imitations animées de l'interface (couleurs, polices et composants de Runway redessinés en grand).
Les vraies captures ne servent qu'au mur de la fin.
Les versions précédentes (70 s puis 32 s sur captures, puis 36 s en imitations) ont été jugées trop longues, trop peu centrées sur les enveloppes et le tri, puis trop rapides à lire, puis trop lents sur les écrans à un ou deux mots, puis trop chargés en texte : seuls les grands titres restent, sans phrases d'appoint.

1. **Ouverture** : « Ton argent, / jusqu'à la / prochaine paie. » sur une piste vue du cockpit, puis le logo et un avion.
2. **Enveloppes** : en plein écran, le salaire de 2 680 € est une grande barre sombre, coupée net en enveloppes qui s'écartent et prennent leur couleur (Logement 1 000 €, Courses 450 €, Sorties 300 €, Vacances 530 €, Épargne 400 €) ; l'épargne se soulève, les autres pâlissent, et « Et 400 € de côté. » tombe : tout réparti, on voit ce qu'on peut mettre de côté.
3. **Claude range** : un relevé CSV est déposé ; Claude passe sur chaque libellé bancaire brut, reconnaît le marchand et ce que c'est, et pose la bonne enveloppe.
   Puis « Ce qui cloche saute aux yeux. » : les enveloppes du mois en tuiles ; les dépenses que Claude vient de ranger y tombent, un verre au Syndicat fait passer Sorties de 295,40 € à 325,30 € pour 300 €, et l'enveloppe vire au rouge ; un clic l'ouvre, le concert à la Cigale est surligné comme cause du dépassement et une ligne porte l'avance « Léa te doit 32 € ».
4. **Demander** : « Pourquoi Sorties est dans le rouge ? », la réponse arrive mot à mot et propose de prendre 25,30 € sur Vacances, appliqué d'un clic.
5. **Investir** : la carte de nuit, la valeur qui défile, la courbe.
6. **Fin** : le mur des vraies captures, « En local. / Sans compte. / Sans cloud. », le logo et `npm install && npm run dev`.

Le GIF reprend le logo, la répartition du salaire et le tri par Claude, environ 12 s.

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
