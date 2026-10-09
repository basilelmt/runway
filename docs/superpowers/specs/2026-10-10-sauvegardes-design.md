# Runway - Sauvegardes automatiques

Objectif : ne jamais perdre la base, que ce soit par une fausse manipulation, une migration ratée, un script qui corrige des données ou une panne du disque.
Aujourd'hui les seules sauvegardes sont des copies faites à la main dans `data/backups`, et le README conseille de copier `runway.db`, ce qui oublie les écritures encore dans `runway.db-wal` (2,7 Mo le 10 octobre 2026, contre 1 Mo pour le fichier principal).

## Décisions prises

- Les sauvegardes sont faites par le serveur lui-même, avec l'API de sauvegarde de SQLite (`sqlite.backup()` de better-sqlite3).
  La copie est cohérente même pendant des écritures, WAL compris.
  Écartés : un timer systemd ou cron (l'app ignore s'il marche, et la restauration reste manuelle) et Litestream (surdimensionné pour une base d'1 Mo, un binaire et un service de plus).
- Destination : `backups/` à côté de la base (`data/backups/` par défaut), plus un second dossier optionnel choisi dans les réglages (clé USB, dossier synchronisé, NAS) pour survivre à une panne de la machine.
- Restauration depuis Réglages, toujours précédée d'une sauvegarde de l'état actuel, pour qu'une restauration se défasse toujours.

## Hors périmètre

- Chiffrement des sauvegardes.
- Envoi vers un stockage en ligne (S3, Drive).
- Restauration partielle (une table, une opération).

## Déclencheurs

| Raison | Quand | Suffixe du fichier |
| --- | --- | --- |
| `demarrage` | Au démarrage du serveur, avant les migrations, quand aucune migration n'est en attente | `demarrage` |
| `migration` | Au démarrage, quand au moins une migration est en attente | `avant-migration` |
| `quotidienne` | Tant que le serveur tourne : une vérification par heure, sauvegarde si la dernière réussie date de plus de 24 h | `quotidienne` |
| `manuelle` | Bouton « Sauvegarder maintenant » ou `npm run db:backup -- "raison"` | `manuelle` ou la raison passée, en kebab-case |
| `restauration` | Juste avant une restauration | `avant-restauration` |

La sauvegarde de démarrage d'une base qui n'existe pas encore est sautée.
La commande `npm run db:backup` remplace les copies que les agents faisaient à la main avant de corriger des données (`runway-before-remise-a-zero-mensuelle-2026-10-08.db` et ses voisines).
Elle lit `RUNWAY_DB` comme le serveur et fonctionne serveur allumé.

## Stockage et nommage

- Nom : `runway-<AAAA-MM-JJ>T<HH-MM-SS>-<suffixe>.db`, heure locale, par exemple `runway-2026-10-10T08-00-00-demarrage.db`.
- Pas de table d'index : elle vivrait dans la base sauvegardée.
  La liste se lit dans le dossier, et la date et la raison se déduisent du nom.
- Un fichier `.db` du dossier dont le nom ne suit pas ce format est une sauvegarde manuelle ancienne : sa date est celle de modification du fichier, sa raison `manuelle`, et le nom est affiché tel quel.
  Les `-wal` et `-shm` qui traînent à côté sont ignorés.
- Écriture dans un fichier `.partial` renommé à la fin, pour qu'une sauvegarde interrompue n'apparaisse jamais dans la liste.
- Une sauvegarde est vérifiée en l'ouvrant en lecture seule et en lançant `PRAGMA quick_check` ; un échec supprime le fichier et compte comme une erreur.

## Second dossier

- Réglage `backupMirrorDir` (chemin absolu, vide par défaut), dans la section Données de Réglages.
- Après chaque sauvegarde locale réussie, le fichier y est copié, puis vérifié comme ci-dessus.
- Dossier absent ou non inscriptible (clé débranchée) : la sauvegarde locale compte comme réussie, l'échec de la copie est mémorisé et affiché.
- Au prochain succès, les sauvegardes locales absentes du second dossier y sont recopiées, pour qu'une clé rebranchée rattrape son retard.
- La même règle de conservation s'applique dans le second dossier, aux seuls fichiers au format Runway.
- Une mention sous le champ rappelle que les sauvegardes contiennent les clés Binance et Enable Banking, en clair.

## Conservation

Une sauvegarde pèse environ 1 Mo, la règle peut donc être généreuse.

- Tout ce qui a moins de 30 jours est gardé.
- Au-delà, une seule sauvegarde par mois calendaire est gardée : la plus récente du mois.
- Les raisons `manuelle` et `restauration`, et les anciennes copies manuelles, ne sont jamais supprimées automatiquement.
- Le nettoyage tourne après chaque sauvegarde réussie.

## Restauration

- `POST /api/backups/:name/restore`, avec confirmation côté interface (« Restaurer la sauvegarde du 8 octobre à 23 h 13 ? L'état actuel est sauvegardé avant. »).
- Le serveur :
  1. refuse une sauvegarde qui contient une migration inconnue du code (sauvegarde venue d'une version plus récente), en comparant sa table `__drizzle_migrations` au dossier des migrations ;
  2. fait une sauvegarde `restauration` de l'état actuel ;
  3. ferme la connexion, remplace `runway.db` par une copie de la sauvegarde et supprime `-wal` et `-shm` ;
  4. rouvre la base avec `openDb`, qui applique les migrations manquantes ;
  5. remet le réglage `backupMirrorDir` d'avant la restauration, pour que restaurer une vieille base ne coupe pas la copie vers le second dossier.
- La connexion doit donc être remplaçable sans redémarrer le serveur.
  `createApp` reçoit un porteur de connexion (`DbHolder`, avec `current()` et `replace()`) au lieu d'un `Db` figé.
  Le middleware qui pose `c.get('db')` lit `current()` à chaque requête, et les tâches de fond (nommage des marchands, sauvegarde quotidienne) passent aussi par le porteur.
  Les routes, elles, ne changent pas.
- Une restauration pendant une autre restauration ou une sauvegarde en cours renvoie une erreur 409.
- Après succès, l'interface vide le cache de React Query et revient à l'accueil.
- Les serveurs de recette lancés depuis un worktree avec `RUNWAY_DB` sur la vraie base ne voient pas la restauration avant leur redémarrage.
  C'est accepté, ils ne servent qu'à la recette.

## API

- `GET /api/backups` : la liste (nom, date, raison, taille, présence dans le second dossier) et l'état (dernière sauvegarde réussie, dernière erreur locale, dernière erreur du second dossier, dossier local et second dossier).
- `POST /api/backups` : sauvegarde manuelle immédiate, renvoie la sauvegarde créée.
- `POST /api/backups/:name/restore` : restauration, décrite plus haut.
- Le nom passé dans l'URL doit figurer dans la liste du dossier : pas de chemin arbitraire.
- L'état des erreurs vit en mémoire du serveur ; au démarrage, « dernière sauvegarde réussie » se déduit du fichier le plus récent.

## Interface

- Réglages > Général, nouvelle section « Données », avant les exports existants :
  - une ligne d'état : « Dernière sauvegarde aujourd'hui à 8 h 00 », ou l'erreur en bandeau d'alerte ;
  - le champ du second dossier, avec son état (« Dernière copie aujourd'hui à 8 h 00 » ou l'erreur) ;
  - le bouton « Sauvegarder maintenant » ;
  - la liste des sauvegardes, la plus récente en haut, en liste repliable au-delà des 10 premières : date, raison en clair (« Au démarrage », « Avant une migration », « Quotidienne », « Manuelle », « Avant une restauration »), taille, et « Restaurer » dans le menu d'actions de la ligne.
- Accueil : un bandeau d'alerte seulement si aucune sauvegarde n'a réussi depuis 7 jours, avec un lien vers Réglages.
- Tout passe par les composants partagés existants (`SectionHeader`, `ListRow`, bandeaux, menu d'actions, dialogue de confirmation).

## Documentation

Le README remplace « Une sauvegarde se résume à copier ce fichier » par la description des sauvegardes automatiques, de la restauration et de `npm run db:backup`.

## Tests

- Unitaires : lecture et écriture des noms de fichiers, règle de conservation (30 jours, une par mois, raisons protégées, anciennes copies).
- Intégration sur une vraie base SQLite dans `tmp/` :
  - une sauvegarde faite pendant des écritures non encore reportées depuis le WAL contient ces écritures ;
  - une restauration puis la restauration de la sauvegarde `avant-restauration` retrouvent l'état de départ ;
  - une sauvegarde contenant une migration inconnue est refusée ;
  - un second dossier absent n'empêche pas la sauvegarde locale et remonte l'erreur, puis le rattrapage recopie les manquantes ;
  - `backupMirrorDir` survit à une restauration.
- Route : un nom absent du dossier ou contenant un chemin est refusé.
- Recette dans le navigateur sur une copie de la base et un autre port : section Données, sauvegarde manuelle, restauration, bandeau d'accueil.
