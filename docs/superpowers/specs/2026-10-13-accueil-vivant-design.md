# Runway - un Accueil plus vivant

Objectif : que l'Accueil donne la sensation du mois qui passe, sans changer ce qu'il dit.
On garde le contenu fixé par `2026-10-08-accueil-allege-design.md` et l'identité visuelle (papier, encre, jaune de piste).
On ajoute une courbe des dépenses courantes et les dernières opérations, et on recompose la page.

## Constat (13 octobre 2026, 1440 px)

- La page occupe la moitié haute de l'écran, le reste est vide.
- « Rien à faire », l'état le plus fréquent, prend environ 200 px.
- « Mis de côté » flotte à côté de la deuxième barre au lieu du chiffre clé.
- Deux barres pour presque la même chose, et une phrase qui explique le graphique (« Le trait marque aujourd'hui »).
- Les montants des comptes ne sont pas alignés (la pastille « Épargne » décale les livrets de 3 px), le tiers droit est vide.

## Composition

1. En-tête inchangé : date, mois, jours restants.
2. Bandeaux inchangés (sauvegarde, répartition, bilan).
3. Bloc du mois :
   - à gauche le grand chiffre « Dépensé ce mois-ci » et « sur X € prévus » ;
   - à droite « Mis de côté », séparé par un filet vertical, aligné en bas avec le grand chiffre ;
   - dessous, la courbe sur toute la largeur ;
   - dessous, la légende à gauche et « 122,19 € sous le rythme · 228,60 € / 836,49 € » à droite.
   Les deux barres de progression et la phrase d'aide disparaissent.
4. À faire : sans tâche, une ligne entre deux filets (« Rien à faire, tout est rangé. »), sinon la liste actuelle.
5. Signaux inchangés.
6. Deux colonnes : « Dernières opérations » (environ 60 %) et « Comptes » en liste, total dans l'en-tête.
7. Sur mobile, une colonne : mois, à faire, signaux, opérations, comptes.

## La courbe (`MonthPaceChart`)

- Elle trace les dépenses courantes seules (hors charges récurrentes), cumulées jour par jour, en marches, avec un aplat léger.
- Le rythme prévu est une diagonale en pointillé, de 0 le 1er au budget des courantes le dernier jour.
- Un filet horizontal marque le budget des courantes, avec son montant.
- Un trait jaune de piste marque aujourd'hui, avec un point plein sur la courbe et un point creux sur le rythme.
- L'axe ne montre que le 1er, aujourd'hui et le dernier jour.
- Au survol ou au toucher, une infobulle (`ChartTooltip`) montre le jour, le cumul et le rythme.
- La courbe s'arrête aujourd'hui, sans projection.
- Sans budget de courantes, pas de courbe : la phrase actuelle invite à fixer un budget.
- SVG maison, sans la librairie de graphiques, pour ne pas alourdir l'Accueil.
- Hauteur environ 170 px sur ordinateur, 120 px sur mobile.

## Données

`MonthSummary.variable` gagne `daily: Cents[]` : le cumul des dépenses courantes à la fin de chaque jour, du 1er à aujourd'hui inclus.
Il est calculé dans `server/src/services/overview.ts` avec la même règle que `variable.spent` (remboursements déduits par enveloppe, sans passer sous zéro), appliquée au cumul de chaque jour.
Le dernier point vaut toujours `variable.spent`.
Un remboursement peut faire redescendre la courbe.

Les dernières opérations viennent de l'API existante : opérations confirmées, sans les répartitions, limite 5.
Sans opération ce mois-ci, ce sont les 5 dernières, même plus anciennes.
Chargement : squelette de lignes.
Erreur : `ErrorState` local, le reste de la page s'affiche.

## Design system

- `KeyFigure` : aside aligné en bas avec le chiffre, emplacement pour un graphique pleine largeur.
- `EmptyState` : variante `inline`, une ligne entre deux filets.
- Les dernières opérations réutilisent `TransactionRow`, sans variante locale.
- Comptes en liste à filets : nom et libellé discret « Épargne » à gauche, montant à droite.
- Aucune nouvelle couleur ; le jaune n'apparaît qu'une fois (aujourd'hui).
- La référence `2026-10-08-unification-visuelle-design-system.html` est mise à jour.

## Tests

- Cumul jour par jour : remboursement qui fait redescendre, dernier point égal à `variable.spent`, premier jour du mois.
- `MonthPaceChart` : cas sans budget, premier jour, infobulle.
- Test de l'Accueil mis à jour.
- Typecheck, lint, recette navigateur à 1440 px et 390 px.
