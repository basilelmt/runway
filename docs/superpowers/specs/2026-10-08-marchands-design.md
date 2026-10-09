# Runway - Noms lisibles des marchands

Objectif : lire « Carrefour Express » au lieu de « ACHAT CB CARREFOUR EXPR 03.10.26 CARTE NUMERO 089 ».
Sur les données réelles, 1 459 opérations portent 739 libellés différents, souvent tronqués ou codés (« MONOP4801 », « PAYPAL *BOLT.E », « LE PAIN DE LA »).
Un nettoyage par règles ne suffit pas : Runway tire une clé du libellé, Claude nomme chaque clé une fois, et l'utilisateur peut renommer.

## Décisions prises

- Un marchand est identifié par une clé, tirée du libellé par une fonction pure, sans Claude.
- Claude donne un nom à chaque nouvelle clé, une seule fois, en tâche de fond après un import ou une synchro, et au démarrage du serveur.
- Plusieurs clés peuvent porter le même nom (MONOP4801, MONOP, MONOPRIX → « Monoprix »).
  Le nom n'est pas une entité à part : pas de fusion ni de regroupement dans les rapports.
- Un nom choisi par l'utilisateur n'est jamais écrasé par Claude.
- Seules les dépenses et les revenus ont un marchand.
  Les virements entre comptes et les répartitions gardent leur libellé.
- Si Claude échoue ou n'est pas installé, rien ne casse : Runway affiche le libellé nettoyé, mis en casse de titre.

## Clé

`merchantKey(label: string): string | null` dans `core/merchants.ts`.

Étapes, dans l'ordre :

1. Normalisation : majuscules, sans accents, espaces compactés.
2. Préfixes retirés : `ACHAT CB`, `CREDIT CARTE BANCAIRE`, `PRELEVEMENT DE`, `VIREMENT PERMANENT POUR`, `VIREMENT INSTANTANE A`, `VIREMENT INSTANTANE DE`, `VIREMENT DE`, `VIREMENT POUR`, `WERO A`.
3. Intermédiaires de paiement retirés en tête : `SUMUP *`, `PAYPAL *`, `SNP*`, `SQ *`, `ZTL*`.
4. Bruit retiré :
   - `APPLE PAY` ;
   - les dates `jj.mm.aa`, `jj/mm/aa`, `jj/mm/aaaa` ;
   - `CARTE NUMERO 089` et `CARTE NO 089` ;
   - `EUR 26,30` (montant en devise) ;
   - les chiffres collés en fin de mot (`MONOP4801` → `MONOP`) ;
   - les références après `REF :` ou `EX REF :`.
5. Ponctuation de bord et espaces en trop retirés.

Le résultat vide donne `null`, et l'opération n'a pas de marchand.
Exemples :

| Libellé | Clé |
|---|---|
| ACHAT CB CARREFOUR EXPR 03.10.26 CARTE NUMERO 089 | CARREFOUR EXPR |
| ACHAT CB SUMUP *OCCHIO APPLE PAY | OCCHIO |
| ACHAT CB PAYPAL *BOLT.E | BOLT.E |
| ACHAT CB MONOP4801 | MONOP |
| ACHAT CB UBER 03.10.26 EUR 26,30 CARTE NO 089 | UBER |
| PRELEVEMENT DE MAIF 79038 NIORT EX REF : 000884... | MAIF 79038 NIORT |
| VIREMENT PERMANENT POUR MAX LE COLOK CHARGES APPARTEMENT BASILE | MAX LE COLOK CHARGES APPARTEMENT BASILE |

Les listes de préfixes et de bruit vivent dans des constantes du module, testées une par une.

## Modèle

Migration `0010_merchants.sql`.

### `merchants` (nouvelle table)

| Champ | Type | Note |
|---|---|---|
| key | text, clé primaire | |
| name | text nullable | null = pas encore nommé |
| source | `claude` / `user` nullable | qui a donné le nom |
| updated_at | text | |

### `transactions`

| Champ | Type | Note |
|---|---|---|
| merchant_key | text nullable, indexé | `merchantKey(label)` pour `expense` et `income`, null sinon |

Pas de clé étrangère vers `merchants` : la ligne `merchants` est créée quand la clé apparaît, et une clé sans ligne reste valide.

### Maintien de la clé

La clé est recalculée à chaque écriture d'un libellé ou d'un type d'opération, par un seul utilitaire `withMerchantKey(values)` du dépôt des opérations.
Tous les sites d'écriture passent par lui :

- création et modification d'une opération (`repos/transactions.ts`) ;
- matérialisation des règles récurrentes (`services/materialize.ts`) ;
- import et rapprochement d'une opération prévue (`services/import.ts`), utilisés aussi par la synchro bancaire.

Après chaque écriture, les clés nouvelles sont ajoutées à `merchants` avec `name` null (`INSERT OR IGNORE`).

Pour les opérations existantes, la migration ne peut pas appeler `merchantKey`.
Un remplissage au démarrage du serveur (`backfillMerchantKeys`) calcule la clé des opérations `expense` et `income` dont `merchant_key` est null et dont la clé calculée n'est pas null.
Il est idempotent, et rapide une fois fait.

Un test d'invariant parcourt les scénarios d'écriture (saisie, modification, import, rapprochement, matérialisation) et vérifie que chaque opération a `merchant_key = merchantKey(label)`.

## Nommage par Claude

`services/merchants.ts`, `nameMerchants(db, deps)`.

1. Charge les clés sans nom, 150 au plus par lot, les plus fréquentes d'abord.
2. Pour chaque clé, joint jusqu'à 3 libellés bruts d'exemple.
3. Joint la liste des noms déjà donnés, pour que Claude réutilise un nom existant (« Monoprix ») plutôt que d'en inventer un proche (« Monop' »).
4. Lance `claude -p --tools "" --output-format json --json-schema <schema>` avec le modèle des réglages, comme le tri (`runClaude` de `services/claude.ts`).
   Schéma de sortie : `{ names: { key, name }[] }`.
5. Valide avec zod.
   Ignore les clés inconnues, les noms vides et ceux de plus de 60 caractères.
6. Écrit `name` et `source = 'claude'` seulement si `source` est encore null.
7. Recommence tant qu'il reste des clés sans nom et que le dernier lot en a nommé au moins une.

Consignes du prompt :

- nom court, celui que l'utilisateur dirait (« Carrefour Express », « Bolt », « SNCF », « Monoprix ») ;
- casse normale ;
- sans ville ni numéro de magasin, sauf si c'est le seul nom disponible ;
- pour un virement à une personne, le prénom et le rôle s'il est clair (« Max (coloc) ») ;
- si le libellé est tronqué et que le marchand n'est pas reconnaissable, garder les mots lisibles en casse normale (« Le Pain de la… » devient « Le Pain de la »).

Déclenchement, sans attendre la réponse et une seule exécution à la fois (un verrou en mémoire ; une demande pendant une exécution relance un tour à la fin) :

- au démarrage du serveur, après `backfillMerchantKeys` ;
- après la confirmation d'un import ;
- après une synchro bancaire qui a ajouté des opérations ;
- par `POST /api/merchants/name`, appelé par le bouton des Réglages.

Les erreurs (Claude absent, non connecté, délai, sortie invalide) sont journalisées côté serveur et gardées en mémoire pour l'écran des Réglages.
Elles ne bloquent jamais une écriture.

## API

- `GET /api/merchants/status` : `{ total, named, running, lastError: string | null }`.
- `POST /api/merchants/name` : lance le nommage, répond tout de suite avec le statut.
- `PUT /api/merchants/:key` : `{ name: string }` renomme (source `user`) ; un nom vide remet le marchand à nommer par Claude (`name` et `source` à null).
- `Transaction` gagne `merchantKey: string | null` et `merchantName: string | null`.
  `merchantName` vaut le nom du marchand, ou le libellé nettoyé en casse de titre s'il n'a pas encore de nom, ou null sans clé.
- Le filtre `q` des opérations cherche dans le libellé et dans le nom du marchand.
- L'export JSON inclut la table `merchants`.

## Affichage

Le nom affiché d'une opération est `merchantName ?? label`, via un utilitaire `displayLabel(t)` côté client.
Il remplace le libellé dans :

- la liste des Opérations et « À ranger » (`TransactionRow`) ;
- le détail d'une enveloppe (`EnvelopeDetailDialog`) ;
- les plus grosses dépenses de l'Analyse.

Le dialogue d'une opération (`TransactionEditDialog`) affiche :

- le nom du marchand en titre ;
- le libellé brut dessous, en petit ;
- un bouton « Renommer » qui ouvre un champ en place.
  L'aide du champ dit que le nouveau nom vaudra pour toutes les opérations de ce marchand, avec leur nombre (« 52 opérations »).

La saisie rapide garde le libellé tapé : tant que Claude ne l'a pas nommé, un libellé avec des minuscules et sans préfixe bancaire s'affiche tel quel, accents compris (« Café de Léa »).

Réglages, page Général, une section « Marchands » :

- « 412 marchands, 398 nommés » ;
- un bouton « Nommer avec Claude », désactivé pendant une exécution ;
- la dernière erreur, s'il y en a une.

## Claude ailleurs

- Tri avec Claude : chaque opération à trier est envoyée avec son nom de marchand en plus du libellé, et les exemples aussi.
- Demander : le schéma du prompt décrit `merchants(key, name)` et `transactions.merchant_key`, et invite à regrouper par nom de marchand quand l'utilisateur parle d'un commerçant.

## Hors périmètre

- Ranger automatiquement une opération selon son marchand : les règles de tri restent basées sur le libellé.
- Fusionner ou regrouper des marchands dans les rapports.
- Logos des marchands.

## Tests

- `core` : `merchantKey` sur chaque ligne du tableau d'exemples et sur chaque préfixe et bruit, plus libellé vide et libellé de saisie manuelle.
- `server` : invariant de la clé sur tous les sites d'écriture ; `backfillMerchantKeys` idempotent.
- `server` : `nameMerchants` avec un `exec` simulé (lot, nom utilisateur préservé, clé inconnue ignorée, nom trop long ignoré, arrêt quand un lot ne nomme rien, erreur gardée dans le statut).
- `server` : `PUT /api/merchants/:key`, dont le nom vide qui remet à nommer ; recherche `q` par nom de marchand.
- `client` : `TransactionRow` affiche le nom du marchand ; le dialogue renomme ; la section des Réglages.
