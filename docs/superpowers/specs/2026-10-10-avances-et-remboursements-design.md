# Runway - Avances entre amis et remboursements

Objectif : qu'une dépense avancée pour d'autres ne gonfle plus l'enveloppe, et savoir qui doit encore quoi.
Aujourd'hui un remboursement reçu (Wero de Max après un bowling, avoir Uniqlo, remboursement SNCF) est un revenu sans enveloppe : il part dans « Pas encore réparti », pendant que l'enveloppe garde la dépense entière.
Résultat : Restos et Sorties paraissent plus dépassés qu'ils ne le sont, et l'enveloppe « Remboursements entre amis » a fini mise de côté.

Spec écrite sans aller-retour avec Basile (10 octobre 2026 au soir) : les choix marqués « à confirmer » sont des valeurs par défaut prises seul.

## Décisions prises

- Un revenu peut être rangé dans une enveloppe comme **remboursement** : il crédite l'enveloppe et vient en déduction de ses dépenses du mois.
  C'est la brique de base, utile aussi sans avance (avoir d'un magasin, remboursement de transport).
- Une dépense peut porter des **avances** : « j'ai payé pour d'autres », une ligne par personne avec le montant qu'elle doit.
- Un remboursement peut **solder** une ou plusieurs avances.
  Runway propose le rapprochement quand un revenu arrive dont le libellé contient le nom de la personne (au moins un mot de plus de 2 lettres en commun) et dont le montant égale une avance ouverte ou la somme des avances ouvertes de cette personne (à confirmer).
- Dépensé d'une enveloppe = dépenses moins remboursements, partout : budget, rythme du mois, analyse, bilan du mois, prompt de Demander.

## Hors périmètre

- Partage d'une dépense à parts égales en un clic (« diviser par 4 ») : on saisit les montants par personne (à confirmer).
- Carnet de contacts : une personne est un nom libre, avec autocomplétion sur les noms déjà utilisés.
- Rangement automatique des remboursements par les règles de tri ou par Claude.
- Rattrapage automatique de l'historique : les remboursements passés se rangent à la main, une vue les liste pour aller vite.
- Dettes dans l'autre sens (quelqu'un a payé pour moi).

## Modèle

Migration `0014_advances.sql` (numéro à ajuster à la fusion).

### `transactions`

Un revenu (`kind = 'income'`) peut désormais avoir un `envelope_id` : c'est un remboursement.
Pas de nouvelle colonne.
- `applyOperation` (`core/balances.ts`) ajoute le montant à l'enveloppe d'un revenu qui en a une.
- `monthActivity` (`core/budget.ts`) soustrait un remboursement confirmé du `spent` de son enveloppe, sans jamais descendre sous zéro sur le mois.
- `savedInMonth`, la vue d'ensemble, les rapports et la prévision restent cohérents : le revenu compte toujours dans les comptes, et l'argent va à l'enveloppe au lieu de « Pas encore réparti ».
- La répartition automatique du salaire n'est jamais déclenchée par un remboursement.

### `advances` (nouvelle table)

| Champ | Type | Note |
| --- | --- | --- |
| id | integer, clé primaire | |
| expense_id | integer, FK `transactions`, ON DELETE cascade | la dépense avancée |
| person | text | nom libre, espaces compactés |
| amount | integer | centimes, positif |
| refund_id | integer, FK `transactions`, nullable, ON DELETE set null | le remboursement qui la solde |
| settled_at | text, nullable | date du solde, sans remboursement (« réglé en liquide », « je laisse tomber ») |
| created_at | text | |

La somme des avances d'une dépense ne peut pas dépasser son montant.
Une avance est ouverte tant qu'elle n'a ni `refund_id` ni `settled_at`.
Solder des avances avec un revenu range ce revenu en remboursement dans l'enveloppe de la dépense, s'il n'avait pas encore d'enveloppe.

## API

- `GET /api/advances?status=open|all` : avances avec leur dépense (date, libellé, enveloppe) et leur remboursement.
- `GET /api/advances/people` : par personne, total ouvert.
  Ancienneté = date de la dépense la plus ancienne qui porte encore une avance ouverte, pas la date où l'avance a été saisie.
- `PUT /api/transactions/:id/advances` : remplace les avances d'une dépense (`{ person, amount }[]`).
- `POST /api/advances/settle` : `{ advanceIds, refundId | null }`, refundId nul = soldé sans remboursement.
- `POST /api/advances/:id/reopen` : rouvre.
- `GET /api/advances/suggestions` : rapprochements proposés entre les revenus sans enveloppe et les avances ouvertes, selon la règle des décisions.
  La fenêtre est relative à la date de la dépense, pas à aujourd'hui.
  Un revenu daté de 7 jours avant la dépense à 60 jours après elle est candidat, quelle que soit la date du jour.
- `GET /api/advances/unsorted-incomes` : revenus sans enveloppe des 6 derniers mois, pour le rangement manuel, hors ceux déjà couverts par un rapprochement proposé.
  Exclut aussi le bruit des revenus récurrents (salaire, rente) : un revenu lié à une règle, ou dont le marchand ou le montant (à 10 % près) correspond à une règle de revenu active, n'y figure pas, même si cette règle a été créée après coup et ne lie pas son historique.
- Le schéma de modification d'une opération accepte `envelopeId` sur un revenu.

## Interface

- **Détail d'une dépense** : section « Avancé pour d'autres » avec les lignes personne et montant, et le reste à ma charge (« Ta part : 20,00 € sur 82,50 € »).
  Champ personne avec autocomplétion sur les noms déjà saisis.
- **Détail d'un revenu** : champ « Rembourse une dépense de » (enveloppe, vide par défaut) ; si des avances ouvertes correspondent, la proposition de rapprochement s'affiche au-dessus (« Max doit 41,50 € pour Bowling du 26 juillet, rapprocher ? »).
- **Opérations** : nouvelle vue « Avances » à côté de « À ranger ».
  En tête, une ligne par personne qui doit de l'argent (nom, total, depuis la dépense la plus ancienne encore ouverte), dépliable sur ses avances.
  Puis les rapprochements proposés, chacun avec « Rapprocher » et « Ignorer ».
  Puis les revenus des 6 derniers mois sans enveloppe, avec un sélecteur d'enveloppe en ligne, pour ranger vite les remboursements passés.
  Les salaires et autres revenus récurrents n'y apparaissent pas (voir `GET /api/advances/unsorted-incomes`).
- **Lignes d'opérations** : une dépense avec des avances ouvertes porte une pastille « Avance », un revenu rangé dans une enveloppe affiche l'enveloppe comme une dépense.
- **Accueil** : rien de nouveau (les signaux pourront plus tard rappeler une avance ancienne).
- Composants partagés : ligne de liste, `Field`, `Combobox` ou équivalent existant, pastilles, liste repliable.

## Demander

Le prompt documente la table `advances` et le fait qu'un revenu avec `envelope_id` est un remboursement qui réduit les dépenses de l'enveloppe.

## Tests

- Moteur : un remboursement crédite l'enveloppe, réduit `spent` du mois sans le rendre négatif, ne touche pas « Pas encore réparti », ne déclenche pas la répartition automatique.
- Routes : somme des avances plafonnée au montant de la dépense, solde avec et sans remboursement, rangement automatique du remboursement dans l'enveloppe de la dépense, réouverture, suppression de la dépense qui supprime ses avances, suppression du remboursement qui rouvre l'avance.
- Propositions : nom en commun et montant exact, somme de plusieurs avances d'une même personne, pas de proposition sur un revenu déjà rangé.
- Recette dans le navigateur sur une copie de la base : avance sur un vrai bowling, rapprochement du Wero correspondant, vue Avances, effet sur Restos et Sorties.
