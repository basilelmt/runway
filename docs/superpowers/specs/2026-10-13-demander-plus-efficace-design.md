# Runway - Demander plus efficace

Objectif : que Demander réponde plus vite, avec les mêmes chiffres que l'app, sans pouvoir lire les secrets de la base.

## Constat (13 octobre 2026)

- Une question simple (« Combien en restos ce mois-ci ? ») prend 8,3 s : 1,1 s de démarrage, puis 4 tours de modèle d'environ 1,5 à 2,5 s chacun.
- Le temps part dans les allers-retours : Claude reconstruit en SQL les règles de l'app (remboursements déduits, avances, « À répartir », budget = charges fixes + complément).
  « Pourquoi Restos a dépassé en septembre ? » a demandé 4 requêtes.
- Ses chiffres peuvent donc diverger de ceux affichés si une requête oublie une règle.
- L'outil `query` lit toute la base : `settings` (clé privée Enable Banking, clé et secret Binance), `bank_connections.session_id`, les IBAN de `bank_accounts`.
  À la question « combien de comptes j'ai ? », Claude est allé lire `bank_accounts` de lui-même.
- Demander ne peut pas chercher sur le web : il l'a dit quand on lui a demandé ce qu'était L'Échoppe.
- Changer de modèle ne change presque rien (Sonnet 5 : 6,2 s, Haiku 4.5 : 16 s, un seul essai chacun).

## 1. Liste blanche de tables

`runReadOnlyQuery` (outil `query` et graphiques) refuse toute requête qui ouvre une table hors liste blanche.
La vérification passe par `EXPLAIN` : chaque ouverture de b-tree (`OpenRead`) donne une page racine, rapprochée de `sqlite_schema` pour retrouver la table, y compris quand la lecture passe seulement par un index.
Cela couvre sous-requêtes, jointures, CTE et vues.

Tables permises : `transactions`, `advances`, `envelopes`, `accounts`, `recurring_rules`, `sorting_rules`, `merchants`, `holdings`, `holding_trades`, `prices`.
Tout le reste est refusé, y compris les tables ajoutées plus tard.
`sqlite_schema` reste lisible : il ne contient que la structure.

Le refus renvoie une erreur explicite (« Table non accessible : settings ») pour que Claude n'insiste pas.
Le prompt système ne cite que les tables permises.

## 2. Les chiffres de l'app

### Résumé du mois dans le prompt système

Le prompt système gagne un résumé du mois en cours, calculé par `buildOverview` (les chiffres de l'Accueil) :
- « À répartir » ;
- le nombre d'opérations à ranger ;
- les comptes avec leur solde (hors archivés), en marquant ceux hors budget ;
- par enveloppe active : budget du mois (charges fixes + complément), réparti ce mois, dépensé ce mois, solde disponible, et la marque épargne.

Ce résumé remplace les listes actuelles d'enveloppes et de comptes.
Les montants y sont en euros au format français, avec l'id de chaque enveloppe et compte pour les requêtes.

### Outil `month_summary`

Nouvel outil MCP `month_summary(month: 'YYYY-MM')` qui renvoie les chiffres du Bilan de ce mois (`monthReview`) :
revenus, dépenses, épargne, puis par enveloppe budget, dépensé et écart (positif = dépassement).
Les montants sont en centimes, comme `query`.
Un mois futur ou mal formé renvoie une erreur d'outil.

Le serveur MCP reçoit la date du jour par la variable d'environnement `RUNWAY_TODAY`, passée par `askArgs` depuis la date de la requête, pour respecter une date simulée en recette.

### Consignes

Le prompt demande de partir du résumé et de `month_summary` pour tout chiffre d'enveloppe ou de mois, et de n'utiliser `query` que pour le détail (quelles opérations, quels commerçants, quelles périodes hors mois calendaire).
Le schéma de la base reste dans le prompt pour ces requêtes de détail.

Les étapes affichées pendant la réflexion gagnent « Je regarde le bilan du mois… » pour `month_summary`.

## 3. Recherche web

`WebSearch` rejoint les outils de Demander (`--tools WebSearch`, ajouté à `--allowedTools`).
Le prompt cadre son usage : identifier un commerçant ou un libellé inconnu, ou répondre quand l'utilisateur le demande.
Une recherche ne contient qu'un nom de commerçant ou un libellé nettoyé, jamais un montant ni une autre donnée personnelle.
L'étape affichée est « Je cherche sur le web… ».

## Écarté : afficher la réponse au fil de l'eau

La réponse fait 1 à 4 phrases et s'écrit en 0,1 à 2 s ; un essai l'a reçue d'un bloc.
Le gain ressenti (1 à 2 s au mieux) ne vaut pas l'analyse d'un JSON incomplet côté serveur.

## Vérification

Tests unitaires :
- liste blanche : table permise, jointure, sous-requête, lecture par index seul, `settings` et `bank_accounts` refusées, y compris dans une sous-requête ou un CTE ;
- `month_summary` : chiffres identiques à ceux du Bilan, mois futur refusé ;
- prompt : le résumé contient « À répartir », les enveloppes avec leurs chiffres et les comptes ;
- `askArgs` : `RUNWAY_TODAY`, `WebSearch` et `mcp__runway__month_summary` présents.

De bout en bout, sur la vraie base en lecture seule, rejouer avec chronométrage :
« Combien en restos ce mois-ci ? », « Pourquoi Restos a dépassé en septembre 2026 ? », « Pourquoi Shopping a dépassé en juin 2026 ? », « C'est quoi L'Échoppe ? ».
Les chiffres donnés doivent correspondre à l'Accueil et au Bilan, et le nombre de tours baisser par rapport au constat.
Puis une question dans l'app elle-même, dans le navigateur.
