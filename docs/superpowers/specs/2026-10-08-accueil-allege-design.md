# Runway - Accueil allégé et un seul « combien il me reste »

Objectif : que chaque écran réponde à sa question sans répéter les autres, et qu'une seule réponse existe à « combien il me reste ».
Aujourd'hui l'Accueil reprend le tableau des enveloppes du Budget, et quatre chiffres différents disent ce qui reste : « Marge restante », « Pas encore réparti », « Reste pour vivre et investir » et le disponible de chaque enveloppe.
On garde, comme YNAB, « Pas encore réparti » et le disponible de chaque enveloppe.

Ce chantier suppose le budget calculé à partir des charges (`2026-10-08-budget-par-charges-design.md`).

## Accueil

L'Accueil garde :

- l'en-tête du mois (date, nom du mois, jours restants) ;
- le bandeau de répartition automatique ;
- « Dépensé ce mois-ci » sur le budget, avec la barre et le rythme des dépenses courantes ;
- « Mis de côté », seul dans la colonne de droite ;
- « À faire » ;
- les comptes.

L'Accueil perd :

- « Marge restante » (et sa variante « Budget dépassé de ») ;
- la section « Enveloppes » et son lien « Voir les 11 ».

## Enveloppes à surveiller

Une ligne de « À faire » remplace la section des enveloppes.
Elle mène au Budget.

Une enveloppe hors épargne et non archivée est à surveiller si :

- **dépassée** : son disponible est négatif ;
- **presque vide** : son disponible libre est inférieur à 10 % de son complément (`monthlyExtra`), alors qu'il reste plus de 7 jours dans le mois.
  Disponible libre = disponible - charges de l'enveloppe encore attendues d'ici la fin du mois (opérations prévues non confirmées du mois, et occurrences des règles entre demain et la fin du mois).
  Une enveloppe sans complément n'est jamais presque vide : Logement à 0 € une fois le loyer payé est normal.

Le calcul est une fonction pure `envelopesToWatch` de `core/budget.ts`, appelée par la vue d'ensemble, qui expose :

```ts
watch: { envelopeId: number; name: string; kind: 'over' | 'low'; amount: Cents }[];
```

`amount` est le dépassement pour `over`, le disponible libre pour `low`.
Les dépassées passent en premier, puis les presque vides, chacune triée par montant.

Libellés de la ligne :

- une seule enveloppe dépassée : « Restos dépassée de 12,40 € », ton alerte ;
- une seule presque vide : « Plus que 3,05 € dans Abonnements », ton normal ;
- plusieurs : « 3 enveloppes à surveiller · Restos, Sorties, Abonnements », ton alerte si l'une est dépassée.

## Budget

- Le bloc « Revenus par mois / Charges par mois / Virements programmés / Reste pour vivre et investir » en haut des charges fixes est supprimé.
- La phrase « Tes enveloppes prévoient X par mois pour Y de revenu, il reste Z » reste la seule comparaison au revenu.
  Elle s'appuie sur la somme des budgets calculés.
- L'introduction des charges fixes reste.
  Le message affiché quand la liste est vide devient « Ajoute ton salaire, ton loyer et tes abonnements : leurs montants comptent dans le budget de leur enveloppe. »

## Tests

- `core` : `envelopesToWatch` (dépassée, presque vide, charge encore attendue qui rend l'enveloppe presque vide, enveloppe sans complément jamais presque vide, moins de 7 jours restants, épargne ignorée, ordre).
- `client` : la ligne « À faire » dans ses trois formes ; l'Accueil n'affiche plus ni « Marge restante » ni la section des enveloppes.
- `client` : les charges fixes n'affichent plus le bloc des totaux.
