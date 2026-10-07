# Runway - Répartition automatique du salaire

Objectif : quand le salaire arrive, remplir les enveloppes sans y penser.
Aujourd'hui « Répartir » préremplit déjà ce qui manque à chaque enveloppe pour atteindre son budget du mois, mais il faut ouvrir le dialogue et valider à la main.
La répartition automatique fait ce geste seule au moment où le salaire est rapproché, et reste annulable.

## Décisions prises

- Déclenchement : automatique, sans confirmation, avec un bandeau qui permet d'annuler ou d'ajuster.
- Détection : une charge fixe de type Revenu marquée « Déclenche la répartition ».
  La répartition part quand une occurrence prévue de cette règle devient confirmée.
  Un revenu importé qui n'a pas été rapproché d'une occurrence prévue ne déclenche rien.
- Manque d'argent : les enveloppes sont complétées dans l'ordre de la page Budget (`sort_order`) jusqu'à épuisement.
  Le bandeau signale les enveloppes restées incomplètes.
- Surplus : il reste dans « À répartir ».
- Mois financé : case « Versé pour le mois suivant » sur la règle du salaire.
  Cochée, un salaire reçu le 28 septembre finance octobre et ses allocations sont datées du 1er octobre.
  Décochée, il finance le mois de réception et les allocations sont datées du jour de réception.
- Mise en œuvre côté serveur, dans la transaction SQLite qui confirme l'opération, pour couvrir toutes les sources.

## Hors périmètre

- Enveloppe désignée pour recevoir le surplus.
- Répartition proportionnelle en cas de manque.
- Détection du salaire sans règle récurrente (seuil de montant, motif de libellé).
- Plusieurs revenus déclencheurs le même mois qui se partagent un budget : chacun complète ce qui manque encore au moment où il arrive, sans autre coordination.

## Modèle

Migration `0006_auto_funding.sql`.

### `recurring_rules`

| Champ | Type | Note |
|---|---|---|
| triggers_funding | boolean, défaut false | n'a de sens que pour `kind = 'income'`, refusé sinon par la validation |
| funds_next_month | boolean, défaut false | n'a de sens que si `triggers_funding` |

### `fundings` (nouvelle table)

| Champ | Type | Note |
|---|---|---|
| id | integer | |
| source_transaction_id | integer, unique | le salaire confirmé qui a déclenché la répartition |
| month | text | mois financé, `YYYY-MM` |
| status | `applied` / `undone` | |
| shortfall_count | integer | nombre d'enveloppes restées incomplètes |
| dismissed_at | text nullable | bandeau fermé |
| created_at | text | |

La contrainte d'unicité sur `source_transaction_id` rend la répartition idempotente : un salaire ne déclenche qu'une seule répartition, et une répartition annulée (`undone`) ne se refait pas.
Si le salaire est supprimé, la répartition est supprimée avec ses allocations (`ON DELETE CASCADE` côté `fundings`, suppression explicite des allocations dans le service).

### `transactions`

| Champ | Type | Note |
|---|---|---|
| funding_id | integer nullable | répartition qui a créé cette allocation |

## Logique

### `core/budget.ts` : `planAutoFunding`

Fonction pure.

```ts
planAutoFunding(envelopes: Envelope[], allocatedInMonth: Map<number, Cents>, available: Cents):
  { items: { envelopeId: number; amount: Cents }[]; shortfallCount: number }
```

- Parcourt les enveloppes non archivées qui ont un `monthlyTarget`, triées par `sort_order`.
- Chaque enveloppe reçoit `min(remainingToFund(env, allocatedInMonth), reste disponible)`.
- Une enveloppe qui reçoit moins que ce qui lui manque compte dans `shortfallCount`, y compris si elle ne reçoit rien.
- Les montants nuls ne produisent pas d'item.
- `available` négatif ou nul : aucun item, et toutes les enveloppes qui manquent d'argent comptent dans `shortfallCount`.

### `server/src/services/auto-funding.ts` : `autoFund`

`autoFund(tx, transactionId)` est appelé après qu'une opération prévue est passée à `confirmed`.

1. Charge l'opération et sa règle (`recurring_rule_id`).
   Si la règle n'a pas `triggers_funding`, ou si une ligne `fundings` existe déjà pour cette opération, il s'arrête.
2. Calcule le mois financé : mois de la date de l'opération, ou le suivant si `funds_next_month`.
   La date des allocations est le jour de l'opération, ou le 1er du mois suivant.
3. Calcule `available` = « À répartir » actuel (soldes confirmés, salaire inclus) et `allocatedInMonth` = allocations du mois financé (`monthActivity` sur la date des allocations).
4. Appelle `planAutoFunding`.
   S'il n'y a aucun item et aucun manque, il s'arrête sans créer de ligne `fundings`.
5. Crée la ligne `fundings` puis les allocations (`kind = 'allocation'`, `status = 'confirmed'`, libellé `Budget <mois>` comme « Répartir », `funding_id` renseigné).

### Points d'appel

La confirmation d'une opération prévue passe aujourd'hui par deux chemins, qui appellent tous les deux `autoFund` dans leur transaction :

- `services/import.ts` à la confirmation d'un import, utilisé aussi par la synchro bancaire (`services/bank-sync.ts`) ;
- `routes/transactions.ts`, action « Confirmer » sur une opération prévue.

Pour éviter qu'un futur chemin l'oublie, ces deux appels passent par une seule fonction `confirmPlanned(tx, id, patch)` dans le repo des opérations, qui confirme puis appelle `autoFund`.

### Annulation

`POST /api/fundings/:id/undo` supprime les allocations de la répartition et passe son statut à `undone`.
L'argent revient dans « À répartir ».
Une allocation de la répartition modifiée à la main reste rattachée et est supprimée elle aussi.

### Prévision

Dans `core/forecast.ts`, l'événement « budget » du 1er de chaque mois futur vaut aujourd'hui `monthlyTarget` en entier.
Il devient `remainingToFund(env, allocations déjà datées de ce mois)`, ce qui évite de compter deux fois un budget d'octobre déjà réparti fin septembre.

## API

- `GET /api/fundings/latest` : dernière répartition `applied` non fermée, avec le mois, le total, le nombre d'enveloppes, `shortfallCount` et le libellé du salaire ; `null` sinon.
- `POST /api/fundings/:id/undo`.
- `POST /api/fundings/:id/dismiss`.
- Schémas des règles récurrentes : `triggersFunding` et `fundsNextMonth` (zod, refus si `triggersFunding` sur un autre type que Revenu).
- Les mutations d'import, de synchro et de confirmation invalident la requête `fundings/latest` côté client.

## Interface

### Bandeau de répartition

- Affiché en haut d'Accueil et de Budget quand `fundings/latest` renvoie une répartition.
- Texte : « Salaire réparti : 2 340 € dans 8 enveloppes pour octobre ».
  Avec un manque : « … dont 2 incomplètes faute d'argent ».
- Actions : « Voir » ouvre le dialogue Répartir (ajustement manuel habituel), « Annuler » annule la répartition, une croix ferme le bandeau.
- Après « Annuler », le bandeau confirme « Répartition annulée » puis disparaît.
- Même langage visuel que `RuleBanner`, à vérifier à 1440px et 390px, en clair et en sombre.

### Formulaire de charge fixe (`RecurringRuleForm`)

- Quand le type est Revenu, deux cases sous le compte : « Déclenche la répartition » (aide : « Remplit les enveloppes jusqu'à leur budget quand ce revenu arrive ») et « Versé pour le mois suivant », visible seulement si la première est cochée.
- Passer à un autre type décoche les deux cases.

## Tests

- `core/budget.test.ts` : `planAutoFunding` avec argent suffisant, manque au milieu de la liste, surplus, ordre `sort_order`, enveloppes archivées ou sans budget, `available` nul ou négatif, budget déjà partiellement alloué.
- `core/forecast.test.ts` : un mois futur déjà alloué ne génère que le reste de son budget.
- Tests serveur : déclenchement par import, par synchro et par confirmation manuelle ; idempotence (deux confirmations, réimport) ; règle non marquée ; mois suivant avec allocations datées du 1er ; annulation et absence de nouvelle répartition ensuite ; suppression du salaire.
- Tests client : bandeau (textes, annuler, fermer) et cases du formulaire de charge fixe.
- Passage complet dans le navigateur : marquer la règle du salaire, importer un vrai relevé LBP qui contient le salaire, vérifier les enveloppes, le bandeau, l'annulation et la prévision.
- `npm run typecheck`, `npm run lint` et `npm test` au vert.
