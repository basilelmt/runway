# Runway

Suivi de dépenses personnel par enveloppes, en local, avec import des relevés La Banque Postale, règles récurrentes, prévision de découvert et tri des opérations assisté par Claude.

Runway tourne sur ta machine : un serveur Node sert l'interface et l'API, et toutes les données vivent dans un fichier SQLite.
Pas de compte, pas de cloud, pas d'abonnement.

## Prérequis

- Node 24 ou plus récent.
- Pour le bouton "Trier avec Claude" : [Claude Code](https://docs.anthropic.com/claude-code) installé et connecté (`claude`, puis `/login`).
  Le tri utilise `claude -p` sur ton abonnement, aucune clé API n'est nécessaire.

## Démarrer en développement

```sh
npm install
npm run dev
```

L'API écoute sur http://localhost:3000 et l'interface sur http://localhost:5173 (rechargement à chaud).
L'interface est aussi accessible depuis un téléphone sur le même réseau, à l'adresse affichée par Vite.

## Lancer en production locale

```sh
npm run build
npm start
```

Tout est servi sur http://localhost:3000.
La variable `PORT` change le port, et `RUNWAY_DB` le chemin de la base.

## Où sont les données

Dans `data/runway.db` (gitignoré).
L'écran Paramètres propose aussi un export JSON complet et un export CSV des opérations.

## Sauvegardes et restauration

Le serveur se sauvegarde lui-même, sans réglage : au démarrage (avant une éventuelle migration), une fois par jour tant qu'il tourne, et juste avant chaque restauration.
Les sauvegardes vivent dans `data/backups/`, au format `runway-<date>T<heure>-<raison>.db`, et sont conservées 30 jours puis une par mois calendaire (les sauvegardes manuelles et celles d'avant restauration ne sont jamais supprimées automatiquement).

Réglages > Général, section Données :

- l'état de la dernière sauvegarde, et d'un second dossier facultatif (clé USB, NAS, dossier synchronisé) pour survivre à une panne de la machine ;
- le bouton "Sauvegarder maintenant" ;
- la liste des sauvegardes, avec la restauration dans le menu de chaque ligne (confirmée, et toujours précédée d'une sauvegarde de l'état actuel pour pouvoir se raviser).

En ligne de commande, serveur allumé ou non :

```sh
npm run db:backup                      # raison "manuelle"
npm run db:backup -- "avant purge"     # raison personnalisée
```

Lit `RUNWAY_DB` comme le serveur.

## Importer un relevé La Banque Postale

1. Dans l'espace client, télécharge l'export CSV du compte (menu "Télécharger les opérations").
2. Dans Runway, page Import, dépose le fichier.
3. L'aperçu classe les lignes en nouvelles, rapprochées (une opération prévue par une règle récurrente qui correspond) et doublons (déjà importées).
4. Confirme : les dépenses sans règle de tri arrivent dans "À trier".

Au premier import, le numéro de compte lu dans le fichier est mémorisé sur le compte Runway, et les imports suivants le retrouvent seuls.

## Investir

L'écran Investir suit ton portefeuille et propose des idées d'investissement tirées de l'actualité.

- Trade Republic n'a pas d'API : ajoute ta position (recherche par nom, ticker ou ISIN) puis chaque achat ou vente.
  Les cours viennent de Yahoo Finance, sans clé, et sont mis en cache dans la base.
- Binance se synchronise à l'ouverture de l'écran avec une clé API en lecture seule (Profil, Gestion des API, ne cocher que « Activer la lecture »).
  Runway refuse une clé qui peut trader ou retirer, et ne renvoie jamais la clé au navigateur.
- Les idées sont cherchées par Claude sur le web (`claude -p` avec la recherche web), une fois par semaine à l'ouverture de l'écran ou à la demande.
  Chaque idée garde son cours de départ et se clôt à son horizon : le bilan dit si elles battent le S&P 500.

## Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | serveur + client en mode développement |
| `npm run build` | construit le client dans `client/dist` |
| `npm start` | serveur de production |
| `npm test` | tous les tests (vitest) |
| `npm run typecheck` | vérification TypeScript |
| `npm run lint` | eslint |
| `npm run db:generate` | génère une migration après modification de `server/src/db/schema.ts` |
| `npm run db:backup` | sauvegarde manuelle immédiate, serveur allumé ou non |

## Structure

```
shared/   schémas zod, types et utilitaires partagés (montants, dates)
core/     moteur pur : soldes, récurrence, prévision, rapprochement, tri
server/   Hono + Drizzle + SQLite, parsers CSV, service Claude
client/   React + Vite
docs/     spec de design et plan d'implémentation
```

Le spec complet est dans `docs/superpowers/specs/2026-10-02-runway-design.md`.
