# Runway - Bilan du mois

Objectif : chaque début de mois, regarder le mois écoulé en quelques minutes et ajuster ce qui ne colle pas.
Aujourd'hui l'app constate les dépassements sans aider à corriger des budgets devenus irréalistes.
Sur juillet, août et septembre 2026, Restos a dépensé 352 €, 325 € et 681 € pour un complément de 180 €, et Sorties 549 €, 185 € et 329 € pour 220 €.

## Décisions prises

- Une carte sur l'Accueil invite au bilan du mois précédent ; le bilan lui-même vit dans Analyse, où l'on peut revoir n'importe quel mois passé.
- Le bilan propose de nouveaux compléments à partir de la médiane des 3 derniers mois, et de verser les restes des enveloppes dans une enveloppe d'épargne.
- Chiffres seuls, sans commentaire de Claude : le bilan est instantané et déterministe.
  Pour creuser, un raccourci ouvre Demander avec une question préremplie.
- Rien ne s'applique avant « Valider le bilan », qui applique tout en une transaction et reste annulable.

## Hors périmètre

- Historique des budgets : un complément modifié vaut à partir du mois en cours, comme aujourd'hui.
- Commentaire rédigé par Claude.
- Propositions de budget pour les enveloppes d'épargne et les charges fixes.
- Verser un reste ailleurs que dans une enveloppe d'épargne (par exemple vers « Pas encore réparti »).

## Rappels sur le budget existant

- Budget du mois d'une enveloppe = charges fixes ramenées au mois + complément (`monthly_extra`), voir `2026-10-08-budget-par-charges-design.md`.
- Un reste positif reste dans l'enveloppe le mois suivant.
  Une enveloppe dépassée repart de zéro, et le dépassement est pris sur « Pas encore réparti » (`rolloverEnvelopes`, `core/balances.ts`).
- Dépenses courantes d'une enveloppe : dépenses confirmées du mois sans `recurring_rule_id`.

## Modèle

Migration `0012_month_reviews.sql`.

### `month_reviews` (nouvelle table)

| Champ | Type | Note |
| --- | --- | --- |
| month | text, clé primaire | `AAAA-MM`, le mois passé en revue |
| reviewed_at | text | horodatage ISO de la validation |
| applied | text (JSON) | ce qui a été appliqué, pour l'annulation : `{ budgets: { envelopeId, before, after }[], allocationIds: number[] }` |

## Calcul

Fonction pure `monthReview(state, rules, month, today)` dans `core/review.ts`, qui renvoie :

- **Chiffres du mois** : revenus, dépenses et épargne du mois (`savedInMonth`), sur les opérations confirmées.
- **Enveloppes** : pour chaque enveloppe non archivée ayant un budget ou des dépenses ce mois-là, le budget du mois, le dépensé et l'écart.
  Tri : dépassements d'abord, du plus gros au plus petit, puis l'ordre de la page Budget.
  Une enveloppe dépassée porte le montant pris sur « Pas encore réparti ».
- **Propositions de complément**, pour chaque enveloppe non archivée et hors épargne :
  - dépenses courantes de chacun des 3 mois complets qui précèdent le mois suivant celui passé en revue, c'est-à-dire le mois passé en revue et les deux d'avant ;
  - un mois antérieur à la première opération de la base ne compte pas ; moins de 2 mois disponibles, pas de proposition ;
  - médiane de ces mois, arrondie à la dizaine d'euros supérieure ;
  - proposition seulement si l'écart avec le complément actuel dépasse à la fois 20 € et 15 % du complément actuel (un complément nul ou absent ne retient que le seuil de 20 €) ;
  - la proposition porte les dépenses de chaque mois, pour l'afficher (« 352 €, 325 €, 681 € »).
- **Contrôle d'ensemble** : total des budgets du mois courant, avec les propositions acceptées, comparé au revenu médian des 3 mêmes mois.
  Le client le recalcule à chaque proposition acceptée ou modifiée, à partir des chiffres renvoyés.
- **Restes** : pour chaque enveloppe non archivée et hors épargne, son solde positif à aujourd'hui.
  Les restes sont lus au moment du bilan, pas à la fin du mois passé en revue : c'est l'argent qu'on peut réellement déplacer.
  Pour un mois passé déjà validé, ou plus ancien que le mois précédent, la section des restes n'est pas proposée.
- **Statut** : validé ou non, avec la date de validation et ce qui a été appliqué.

## API

- `GET /api/reviews/:month` : le bilan du mois, refusé pour le mois en cours ou un mois futur.
- `POST /api/reviews/:month` : applique `{ budgets: { envelopeId, monthlyExtra }[], transfers: { fromEnvelopeId, toEnvelopeId, amount }[] }` dans une transaction SQLite.
  Les budgets passent par la même logique que la modification d'une enveloppe, les versements par le mouvement entre enveloppes existant, daté du jour.
  Enregistre la ligne `month_reviews`.
  Un mois déjà validé renvoie 409.
  Un versement doit aller vers une enveloppe d'épargne non archivée et ne pas dépasser le solde de l'enveloppe source.
- `DELETE /api/reviews/:month` : annule, en remettant les compléments `before` et en supprimant les mouvements `allocationIds`, puis la ligne `month_reviews`.
  Un complément modifié depuis (valeur actuelle différente de `after`) n'est pas écrasé, et la réponse le signale.
- `GET /api/overview` ajoute `pendingReview: { month, spent, overspentCount } | null` pour la carte d'Accueil.

## Interface

### Carte d'Accueil

- Visible dès le 1er du mois, tant que le bilan du mois précédent n'est pas validé, et jusqu'à la fin du mois.
- « Bilan de septembre » avec le résumé en une ligne (« 3 154 € dépensés, 2 enveloppes dépassées »), et un bouton « Faire le bilan » vers `/analyse?vue=bilan&mois=2026-09`.
- Pas de bouton pour la masquer : elle disparaît d'elle-même à la fin du mois.

### Vue « Bilan » d'Analyse

- Nouvel onglet « Bilan » dans Analyse, avec un sélecteur de mois (le mois précédent par défaut).
- Sections, dans l'ordre :
  1. **Le mois en chiffres** : revenus, dépenses, épargne.
  2. **Enveloppes** : une ligne par enveloppe, budget, dépensé, écart, avec le lien vers ses opérations du mois et, sur une enveloppe dépassée, « Demander pourquoi » qui ouvre Demander avec « Pourquoi <enveloppe> a dépassé en <mois> ? ».
  3. **Budgets à ajuster** : une ligne par proposition (« Restos : 352 €, 325 €, 681 € sur 3 mois. Proposé 360 € au lieu de 180 € »), avec un champ prérempli et le choix Accepter ou Ignorer (ignorée par défaut).
     La ligne de contrôle en pied de section : « Budgets 2 950 € pour un revenu médian de 2 876 € », en alerte quand le total dépasse le revenu.
  4. **Restes** : une ligne par enveloppe avec un reste, choix Garder (par défaut) ou Verser, puis la liste des enveloppes d'épargne (présélection si une seule).
  5. Bouton principal « Valider le bilan ».
     Le toast de succès propose « Annuler », qui appelle `DELETE`.
- Un mois déjà validé affiche les chiffres, ce qui a été appliqué et le bouton « Annuler ce bilan ».
- Composants partagés existants : en-tête de section, ligne de liste, chiffre clé, bandeaux, `Segmented`, `Field`.

## Tests

- `core/review.ts` : médiane et arrondi, seuils (20 € et 15 %, complément absent), mois manquants en début d'historique, exclusion des dépenses issues d'une charge fixe, des enveloppes d'épargne et archivées, tri des enveloppes.
- Routes : application atomique (un versement invalide n'applique aucun budget), 409 sur un mois déjà validé, annulation qui respecte un complément modifié depuis, refus du mois en cours.
- Accueil : carte visible au début du mois, absente une fois le bilan validé.
- Recette dans le navigateur sur une copie de la base, à une date début de mois (préchargement Node qui décale `Date`, sur un autre port).
