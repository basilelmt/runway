# Opérations en cours

## Objectif

Voir dans Runway les opérations que La Banque Postale affiche « en cours » : paiements carte et prélèvements pas encore comptabilisés.
Affichage seul : elles n'entrent dans aucun calcul.

## Constat

La synchro ne demande aujourd'hui que les opérations comptabilisées (`transaction_status: 'BOOK'`).
Une sonde du 2026-10-19 sur le vrai compte lié a montré que La Banque Postale renvoie bien des opérations `PDNG` via Enable Banking (6 ce jour-là).
Champs reçus : `transaction_amount`, `credit_debit_indicator`, `status`, `booking_date`, `remittance_information`, `bank_transaction_code`.
Pas d'`entry_reference` : aucune référence stable pour suivre une opération en cours jusqu'à sa comptabilisation.
Libellé, date et montant peuvent d'ailleurs changer à la comptabilisation (pré-autorisations).

## Hors périmètre

- Déduire les opérations en cours des soldes, du budget, des enveloppes ou des prévisions.
- Ranger une opération en cours dans une enveloppe.
- Rapprocher une opération en cours de l'opération comptabilisée qui la remplace.
- Les montrer à Demander.

## Récupération

`listTransactions` fait un seul appel par compte, sans filtre `transaction_status`, et renvoie les opérations triées par statut : `{ booked, pending }`.
Une opération sans statut compte comme comptabilisée, comme aujourd'hui.
Un seul appel garde la synchro à un accès par compte et par synchro : la synchro de fond toutes les 6 h reste dans les 4 accès DSP2 quotidiens.

Vérifié le 2026-10-19 : un appel sans filtre renvoie bien les deux statuts chez La Banque Postale (26 `BOOK` et 6 `PDNG` sur 14 jours).

Les opérations en cours passent par `toSourceRow` comme les autres (date, libellé, montant signé) ; une ligne illisible est ignorée sans compter dans `skipped`.

## Stockage

Nouvelle table `pending_transactions` :

| colonne | type | note |
| --- | --- | --- |
| id | integer PK | |
| account_id | integer, FK `accounts` on delete cascade | compte Runway lié |
| date | text ISO | |
| label | text | |
| signed_amount | integer (centimes) | |
| fetched_at | text ISO datetime | horodatage de la synchro qui l'a lue |

Index sur `account_id`.

Pour chaque compte dont la lecture a réussi, la synchro remplace entièrement ses opérations en cours (suppression puis insertion dans une même transaction).
Une opération comptabilisée entre-temps disparaît donc d'elle-même.
Si la lecture d'un compte échoue, sa dernière liste connue reste.

## API

`GET /api/transactions/pending` renvoie `{ fetchedAt: string | null, transactions: { accountId, date, label, signedAmount }[] }`, triées par date décroissante.
Ne renvoie que les comptes non archivés, liés à une connexion `active`.
Une connexion expirée ou révoquée, un compte délié ou archivé : plus rien d'affiché pour ces comptes.
`fetchedAt` est le plus ancien `fetched_at` des lignes renvoyées, null sans ligne.

Le client invalide cette requête après une synchro, comme les opérations.

## Affichage

Opérations › Toutes : un bloc « En cours » en haut de la liste, avant les groupes par jour.

- Visible seulement si aucun filtre n'est actif ou seulement le filtre compte, qui s'applique alors au bloc.
- Absent quand la liste est vide, pendant le chargement ou en cas d'erreur (le reste de la page n'en dépend pas).
- Sous-titre : « Pas encore comptabilisées par la banque, mises à jour à chaque synchronisation. »
- Une ligne par opération, en ton atténué : date, libellé, compte, montant, mention « En cours ».
- Lignes non cliquables, non comptées dans le résumé Entrées/Sorties ni dans le nombre d'opérations.

## Tests

- `listTransactions` : appel sans filtre, tri `BOOK`/`PDNG`, statut absent traité comme comptabilisé.
- Synchro : remplacement de la liste d'un compte, conservation de la dernière liste quand la lecture d'un compte échoue, aucune opération en cours dans `transactions`.
- Route : filtrage des comptes archivés, déliés ou à connexion inactive, tri, `fetchedAt`.
- Client : bloc affiché, masqué avec un filtre autre que compte, filtre compte appliqué, absent si vide.
- Recette dans le navigateur sur une copie de la base.
