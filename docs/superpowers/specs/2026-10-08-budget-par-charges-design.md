# Runway - Une charge fixe donne le budget de son enveloppe

Objectif : ne plus déclarer deux fois la même chose.
Aujourd'hui le loyer est une charge fixe de 986 € et l'enveloppe Logement a aussi un budget de 986 €, saisi à la main.
Si le loyer change, il faut penser à changer le budget.
Désormais le budget d'une enveloppe se calcule à partir de ses charges fixes, plus un complément saisi à la main.

## Décisions prises

- Budget du mois d'une enveloppe = charges ramenées au mois + complément.
- Charges d'une enveloppe : les règles récurrentes `kind = 'expense'`, actives, rattachées à l'enveloppe (`envelope_id`), et pas terminées (`end_date` nulle ou postérieure ou égale au premier jour du mois courant).
- Ramené au mois : la fonction existante `monthlyEquivalent` de `core/recurrence.ts` (mensuelle tous les N mois = montant / N, annuelle = montant / 12N, hebdomadaire = montant × 52 / 12N, quotidienne = montant × 365 / 12N).
  Une charge trimestrielle de 10,80 € compte donc 3,60 € par mois, et l'enveloppe accumule de quoi la payer.
- Le complément est le seul montant saisi à la main.
- Les virements et les revenus récurrents ne comptent pas dans le budget d'une enveloppe.

## Modèle

Migration `0009_envelope_monthly_extra.sql`.

### `envelopes`

| Avant | Après | Note |
|---|---|---|
| `monthly_target` integer nullable | `monthly_extra` integer nullable | complément mensuel en centimes, null = pas de complément |

La migration renomme la colonne puis convertit chaque valeur :
`monthly_extra = monthly_target - charges de l'enveloppe`, ramené à null si le résultat est inférieur à 100 centimes.
Exemples sur les données réelles : Logement 986 € - 986 € = null, Prêt étudiant 485 € - 484,72 € = null (0,28 € écarté), Transports 130 € - 40 € = 90 €, Santé et assurances 20 € - 17,95 € = 2,05 €.
Le calcul des charges se fait en SQL dans la migration, avec la même formule que `monthlyEquivalent` (arrondi au centime), pour que la migration reste rejouable sans le code applicatif.

### Types

`envelopeSchema` (`shared/schemas.ts`) remplace `monthlyTarget` par `monthlyExtra`.
L'entrée et la modification d'une enveloppe (`envelopeInputSchema`, `envelopePatchSchema`) acceptent `monthlyExtra` à la place de `monthlyTarget`.

Le moteur et l'API travaillent sur une enveloppe enrichie :

```ts
type BudgetedEnvelope = Envelope & {
  /** Charges fixes ramenées au mois. */
  monthlyCharges: Cents;
  /** monthlyCharges + (monthlyExtra ?? 0) ; 0 = pas de budget. */
  monthlyBudget: Cents;
};
```

`State.envelopes` (`core/types.ts`) devient `BudgetedEnvelope[]`.
`loadState` (`server/src/services/state.ts`) calcule l'enrichissement avec une fonction pure `withBudgets(envelopes, rules, today)` de `core/budget.ts`.
Ainsi toutes les fonctions du moteur lisent `monthlyBudget` sans connaître les règles.

## Ce qui lit le budget

Tout ce qui lisait `monthlyTarget` lit `monthlyBudget`, avec 0 à la place de null :

- `remainingToFund`, `planAutoFunding` (`core/budget.ts`) ;
- les événements de budget de la prévision (`core/forecast.ts`) ;
- la vue d'ensemble (`server/src/services/overview.ts`) ;
- le rapport de dépenses (`server/src/services/reports.ts`), dont `byEnvelope[].monthlyTarget` devient `monthlyBudget` ;
- le dialogue « Répartir » (`FundDialog`), la ligne d'enveloppe (`EnvelopeRow`), le détail d'une enveloppe et l'Analyse ;
- le prompt et les actions de Demander.

## Dépenses courantes

Le rythme du mois sur l'Accueil ne porte que sur les dépenses courantes.

- Avant : toute dépense d'une enveloppe portant une charge était exclue, et le budget de ces enveloppes aussi.
- Après :
  - budget courant = somme des compléments des enveloppes hors épargne ;
  - dépensé courant = dépenses confirmées du mois hors enveloppes d'épargne, sauf celles générées par une règle récurrente (`recurring_rule_id` non nul).

Les tickets de métro de l'enveloppe Transports comptent donc dans le rythme, le Navigo non.

## Écran de l'enveloppe

Dans `EnvelopeFormDialog` :

- le champ « Budget mensuel » devient « En plus des charges » ;
- s'il y a des charges, le formulaire affiche le détail sous le champ, une ligne par charge puis le total :
  « Navigo 40,00 € + 90,00 € = 130,00 € par mois » ;
- une charge non mensuelle est affichée avec son rythme : « Cotisation compte LBP 3,60 € (10,80 € tous les 3 mois) » ;
- sans charge, l'aide reste « Ce que tu prévois d'y mettre chaque mois ».

Le formulaire d'une nouvelle enveloppe n'a pas encore de charges, il affiche donc l'aide simple.

Dans la ligne d'enveloppe du Budget, rien ne change : on lit « dépensé / budget » avec le budget calculé.

## Demander

L'action `budget` garde sa forme côté Claude (`monthlyTarget` = budget mensuel voulu, pour rester naturel), mais le serveur la convertit :

- `monthlyExtra = monthlyTarget - monthlyCharges` ;
- `null` retire le complément, le budget retombe alors au total des charges ;
- un budget voulu inférieur aux charges est refusé à la validation, avec le message « Le budget de X ne peut pas descendre sous ses charges fixes (Y) ».

La carte d'action affiche le budget voulu et le budget actuel calculé, comme aujourd'hui.
Le prompt décrit chaque enveloppe avec son budget, ses charges et son complément.
Le schéma SQL du prompt remplace `monthly_target` par `monthly_extra`, et explique que le budget d'une enveloppe vaut ce complément plus ses charges fixes ramenées au mois.

## Hors périmètre

- Objectifs à date (« 600 € d'ici juillet »).
- Rattacher une charge à plusieurs enveloppes.

## Tests

- `core` : `withBudgets` (charges mensuelles, trimestrielles, annuelles, hebdomadaires, règle en pause, règle terminée, règle de revenu ou de virement ignorée, enveloppe sans charge ni complément).
- `core` : `remainingToFund`, `planAutoFunding` et les événements de budget de la prévision avec un budget venu des charges.
- `server` : migration 0009 sur une base contenant des budgets et des charges, avec les cas des exemples ci-dessus.
- `server` : la vue d'ensemble calcule les dépenses courantes avec la nouvelle règle.
- `server` : Demander refuse un budget sous les charges et convertit le budget voulu en complément.
- `client` : le formulaire d'enveloppe affiche le détail des charges et enregistre le complément.
