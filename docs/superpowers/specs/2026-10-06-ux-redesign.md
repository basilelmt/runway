# Runway - refonte de l'interface

Objectif : comprendre en quelques secondes où on en est ce mois-ci, ranger ses opérations sans aide, et voir ce qu'on met de côté pour investir.
Cette refonte remplace la section « Écrans » de `2026-10-02-runway-design.md`.

## Navigation

Quatre destinations, plus les réglages à part.

| Entrée | Question | Contenu |
|---|---|---|
| Accueil `/` | Où j'en suis ce mois-ci ? | Dépensé du mois face au budget, rythme des dépenses courantes, mis de côté, liste « À faire », enveloppes les plus serrées, comptes |
| Budget `/budget` | Combien je mets où ? | Pas encore réparti et bouton « Répartir », enveloppes de dépenses et d'épargne, charges fixes et revenus, enveloppes archivées |
| Opérations `/operations` | Qu'est-ce qui s'est passé ? | Onglets « Toutes » et « À ranger » (tri par Claude), import manuel sur `/operations/importer` |
| Analyse `/analyse` | Où part l'argent, où je vais ? | Onglets « Où part l'argent », « Évolution » (taux d'épargne), « À venir » (prévision) |
| Réglages `/reglages` | | Général, Comptes, Banque et import, Règles de tri |

Les anciennes adresses (`/a-trier`, `/enveloppes`, `/prevision`...) redirigent vers les nouvelles en gardant leurs filtres.

## Modèle

- Le budget mensuel d'une enveloppe (`monthly_target`) est la seule source du budget : les règles récurrentes d'allocation ont été supprimées (migration `0004`), les allocations passées sont conservées.
- « Répartir » (`POST /api/envelopes/fund`) crée en une fois une allocation par enveloppe, pré-remplie avec ce qui manque pour atteindre son budget du mois.
- La prévision compte le budget mensuel : le reste à répartir du mois aujourd'hui, puis le budget complet chaque 1er du mois (événements `source: 'budget'`).
- Une enveloppe peut être marquée « épargne » (`is_savings`) : ses dépenses comptent comme mises de côté, pas comme consommation.
- Mis de côté sur un mois = virements nets des comptes budget vers les comptes d'épargne + dépenses des enveloppes d'épargne (`core/budget.ts`).
- Dépenses courantes = dépenses hors enveloppes portées par une charge fixe active ; le rythme du mois ne porte que sur elles.

## Direction visuelle

- Références : Linear pour la retenue et la netteté, Stripe pour la lisibilité des montants.
- Bricolage Grotesque pour les titres et les grands montants, Instrument Sans pour le texte et les chiffres alignés, IBM Plex Mono réservé aux métadonnées techniques.
- Un seul accent fort, le jaune de piste, pour l'action principale, « À faire » et le repère de navigation.
- Pas de cartes partout : sections séparées par l'espace et des filets ; une seule surface en relief par écran.
- Animations de 160 à 480 ms, désactivées si le système demande moins de mouvement.
