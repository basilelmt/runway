# Runway - Synchro en tâche de fond et signaux

Objectif : que Runway prévienne au lieu d'attendre qu'on vienne le consulter.
Aujourd'hui la synchro La Banque Postale ne part que depuis l'interface, et rien ne signale une dépense inhabituelle, un nouveau prélèvement, une hausse de prix ou une charge qui n'est pas arrivée.

Spec écrite sans aller-retour avec Basile (10 octobre 2026 au soir) : les choix marqués « à confirmer » sont des valeurs par défaut prises seul.

## Décisions prises

- Le serveur synchronise seul toutes les 6 heures, en plus des déclencheurs existants.
  6 heures parce que la DSP2 limite à 4 par jour les accès sans l'utilisateur à un compte : le délai se mesure depuis la dernière synchro réussie, quelle que soit son origine, donc la tâche de fond seule ne dépasse jamais 4 accès par tranche de 24 h.
- Les signaux sont calculés côté serveur après chaque synchro, chaque import et au démarrage, puis gardés en base pour pouvoir être écartés.
- Ils s'affichent sur l'Accueil, dans une section « Signaux », chacun avec une action directe quand il y en a une.
- Pas de notification système ni de courriel : Runway reste une app locale qu'on ouvre (à confirmer).

## Hors périmètre

- Notifications du navigateur, push mobile, courriel.
- Réglage des seuils depuis l'interface.
- Signaux sur le portefeuille d'investissement.
- Opérations en attente de comptabilisation, toujours hors périmètre de la synchro.

## Synchro en tâche de fond

- `server/src/services/bank-scheduler.ts` : au démarrage puis toutes les 30 minutes, appelle `runSync` avec `onlyIfStaleMinutes: 360` si Enable Banking est configuré et qu'une connexion est active.
- Une synchro déjà en cours (manuelle ou de fond) n'est pas doublée : le planificateur partage le verrou de `runSync`.
- Erreur : gardée dans `last_error` comme aujourd'hui, et remontée en signal `sync_error` après 2 échecs consécutifs ou 24 h sans synchro réussie.
- Désactivable par la variable d'environnement `RUNWAY_BACKGROUND_SYNC=0`, utile pour la recette et les worktrees qui pointent sur la vraie base.
  Les tests ne démarrent pas le planificateur.

## Signaux

Table `signals`, migration `0013_signals.sql` (numéro à ajuster à la fusion si une autre migration passe avant) :

| Champ | Type | Note |
| --- | --- | --- |
| id | integer, clé primaire | |
| kind | text | voir la liste ci-dessous |
| key | text, unique | identité stable, pour ne jamais recréer un signal écarté (ex. `unusual:<transaction_id>`) |
| created_at | text | horodatage ISO |
| payload | text (JSON) | ce qu'il faut pour l'afficher et agir |
| dismissed_at | text, nullable | écarté par l'utilisateur |
| resolved_at | text, nullable | plus d'actualité (la charge est arrivée, la règle a été mise à jour) |

Un passage de détection crée les signaux nouveaux (clé inconnue), marque `resolved_at` sur ceux dont la condition ne tient plus, et ne touche pas aux écartés.
La détection est une fonction pure par type dans `core/signals.ts`, appelée par `server/src/services/signals.ts`.
Seules les opérations des 45 derniers jours peuvent déclencher un signal, pour qu'un premier passage sur tout l'historique ne noie pas l'Accueil.

### Types (seuils à confirmer)

- `unusual_expense` - **Dépense inhabituelle** : une dépense confirmée d'au moins 100 € qui vaut au moins 2,5 fois la médiane des dépenses de son marchand (au moins 3 dépenses passées), ou d'au moins 150 € chez un marchand jamais vu.
  Clé `unusual:<transaction_id>`.
  Action : ouvrir l'opération.
- `new_recurring` - **Nouveau prélèvement régulier** : un marchand avec au moins 3 dépenses sur 3 mois consécutifs, à 25 à 35 jours d'écart, montants à ±10 % de leur médiane, sans règle récurrente qui le couvre (aucune de ces opérations n'a de `recurring_rule_id`).
  Clé `recurring:<merchant_key>`.
  Action : « Créer la charge fixe », qui ouvre le dialogue de charge fixe prérempli (libellé, montant médian, enveloppe la plus fréquente, jour du mois, mensuelle).
- `price_change` - **Montant d'une charge qui change** : une opération confirmée rapprochée d'une règle (`recurring_rule_id`) dont le montant diffère de celui de la règle d'au moins 1 € et 3 %.
  Clé `price:<rule_id>:<montant>`.
  Action : « Mettre à jour la charge » au nouveau montant, qui résout le signal.
- `missing_charge` - **Charge pas arrivée** : une occurrence prévue (`status = 'planned'`) d'une règle de dépense ou de revenu dont la date est dépassée de plus de 5 jours.
  Clé `missing:<transaction_id>`.
  Résolu quand l'occurrence est confirmée ou supprimée.
  Action : ouvrir l'opération prévue (pour la supprimer ou la rapprocher à la main).
- `consent_expiring` - **Accès bancaire bientôt expiré** : `valid_until` à moins de 14 jours.
  Clé `consent:<connection_id>:<valid_until>`.
  Action : « Renouveler », qui lance `startConnection` avec l'identifiant de la connexion (parcours existant de Réglages > Banque).
- `sync_error` - **Synchro en échec**, voir plus haut.
  Clé `sync:<connection_id>:<date du premier échec>`.
  Action : ouvrir Réglages > Banque.

## API

- `GET /api/signals` : signaux actifs (ni écartés, ni résolus), du plus récent au plus ancien.
- `POST /api/signals/:id/dismiss` : écarte.
- `GET /api/overview` ajoute `signalCount`.
- Les actions passent par les routes existantes (charges fixes, connexions bancaires) ; le serveur relance la détection après une modification de charge fixe.

## Interface

- Accueil : section « Signaux » sous l'en-tête, seulement s'il y en a, au plus 5 avec « Voir tout » qui déplie la liste.
  Une ligne par signal : icône du type, phrase courte (« Fnac : 389,00 €, 4 fois ta dépense habituelle »), action principale, et « Écarter » dans le menu de la ligne.
- Le bandeau existant de l'Accueil sur la synchro reste pour l'état en cours, et les erreurs passent en signal.
- Composants partagés : ligne de liste, menu d'actions, en-tête de section, bandeaux.

## Tests

- `core/signals.ts` : chaque type avec ses seuils, cas limites (2 dépenses passées seulement, écart de 24 jours, montant exactement au seuil), fenêtre de 45 jours.
- Service : idempotence (deux passages = mêmes signaux), écarté jamais recréé, résolution automatique.
- Planificateur : respecte `onlyIfStaleMinutes`, ne double pas une synchro en cours, désactivé par `RUNWAY_BACKGROUND_SYNC=0` (horloge et fournisseur injectés).
- Recette dans le navigateur sur une copie de la base, sans synchro réelle (`RUNWAY_BACKGROUND_SYNC=0`), en vérifiant les signaux que donne l'historique réel.
