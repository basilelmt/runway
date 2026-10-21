# README et vidéo de présentation - plan

> Spec : `docs/superpowers/specs/2026-10-21-readme-video-design.md`.
> Exécution en ligne, dans cette session, sans relecture par tâche.

**But :** un README ouvert par une vidéo de présentation en motion design, construite avec Remotion à partir de vraies captures de Runway sur des données inventées.

**Architecture :** `video/` est un projet Remotion autonome.
Un script de graines y remplit une base de recette dans `tmp/`, un serveur de recette sert l'app sur cette base, les captures sont prises dans Chrome, puis Remotion compose et rend la vidéo, le GIF et l'affiche dans `docs/media/`.

**Pile :** Remotion 4, React 19, TypeScript, ffmpeg (GIF), Chrome DevTools MCP (captures).

## Contraintes globales

- La vraie base `data/runway.db` n'est jamais ouverte : toujours `RUNWAY_DB=tmp/video/runway.db`.
- Serveur de recette sur le port 3100, client sur 5180, avec `~/.local/bin` dans le PATH.
- Vidéo 1920×1080, 30 i/s, H.264, muette, environ 70 s.
- GIF de 960 px de large, 6 à 8 s, moins de 8 Mo.
- Les tokens et polices viennent de `client/src/styles/tokens.css`.
- Pas d'em dash dans les textes.
- `npm run typecheck`, `npm run lint` et `npm test` de l'app restent verts.

## Tâche 1 : données de recette

**Fichiers :** `video/scripts/seed.ts`, `video/package.json`.

- [ ] Script tsx qui importe `openDb` et `schema` du serveur, refuse de tourner si le chemin cible est `data/runway.db`, supprime la base cible puis la recrée.
- [ ] Données relatives à la date du jour : un compte courant et un livret, une dizaine d'enveloppes avec couleurs, charges fixes récurrentes (loyer, électricité, téléphone, assurance), salaire récurrent, trois mois d'opérations avec marchands crédibles, quelques opérations à ranger, des règles de tri.
- [ ] Investir : positions Trade Republic (ETF S&P 500, ETF monde) et Binance (BTC) avec achats, cours des 120 derniers jours en base, un passage d'idées avec trois idées dont une close.
- [ ] Un relevé CSV La Banque Postale inventé, dans `tmp/video/releve.csv`, au format accepté par le parser, mêlant nouvelles lignes, une ligne rapprochée et un doublon.
- [ ] Lancer le serveur de recette, ouvrir chaque écran dans Chrome et corriger les données jusqu'à ce que chaque écran raconte bien son histoire.

## Tâche 2 : captures

**Fichiers :** `docs/media/screens/*.png`.

- [ ] Chrome en 1440×900, facteur 2, mode clair.
- [ ] Budget, Demander (question, réponse, viseur, panneau des travaux), Investir (portefeuille, idée), Analyse « À venir », Import (dépôt, aperçu), Opérations à ranger avec le tri de Claude, Accueil.
- [ ] Noter tout défaut d'interface vu au passage et le corriger dans l'app, avec ses tests.

## Tâche 3 : projet Remotion

**Fichiers :** `video/package.json`, `video/tsconfig.json`, `video/remotion.config.ts`, `video/src/index.ts`, `video/src/Root.tsx`, `video/src/theme.ts`, `video/src/components/*`.

- [ ] Dépendances Remotion, polices locales (copiées depuis le client si disponibles, sinon `@remotion/google-fonts`).
- [ ] `theme.ts` : couleurs et polices reprises des tokens.
- [ ] Briques : `Runway` (la ligne de piste qui se trace), `SceneTitle`, `Screen` (capture cadrée avec zoom et panoramique), `Marker` (surlignage jaune), `Counter` (montant qui défile), `Transition`.
- [ ] Exclure `video/` de la vérification TypeScript, d'eslint et de vitest de l'app.

## Tâche 4 : scènes

**Fichiers :** `video/src/scenes/{Opening,Envelopes,Ask,Invest,Forecast,Import,Closing}.tsx`, `video/src/Presentation.tsx`.

- [ ] Une scène par partie du récit, aux durées du spec, enchaînées par `Series` avec la transition de piste.
- [ ] Vérifier chaque scène par images fixes (`npx remotion still`) aux moments clés.

## Tâche 5 : rendus

**Fichiers :** `video/scripts/render.sh`, `docs/media/runway-presentation.{mp4,gif}`, `docs/media/poster.png`.

- [ ] `npm run render` : MP4, affiche, puis GIF par ffmpeg avec palette.
- [ ] Contrôler la durée, le poids et la boucle du GIF, et relire le MP4 image par image.

## Tâche 6 : README

**Fichiers :** `README.md`.

- [ ] En tête : GIF lié au MP4, titre, accroche, pastilles.
- [ ] « Ce que fait Runway » : grille de captures, une phrase par sujet.
- [ ] Sections pratiques gardées, une phrase par ligne, plus la façon de refaire la vidéo.
- [ ] Contrôler le rendu dans un aperçu de type GitHub.

## Tâche 7 : vérification finale

- [ ] `npm run typecheck`, `npm run lint`, `npm test` à la racine, `npm run typecheck` dans `video/`.
- [ ] Arrêter le serveur de recette, laisser `tmp/video/` (gitignoré).
