# Fiche d'une opération

## Objectif

Se souvenir de ce qu'on a fait de son argent en ouvrant une opération.
Aujourd'hui, cliquer une opération ouvre directement le formulaire de modification : rien n'aide à reconstituer le contexte.
Deux ajouts : une fiche de consultation, et une description de chaque marchand (« qui c'est »).

## Hors périmètre

- Une note personnelle séparée du texte brut de la banque, ou une invite à annoter les opérations peu claires.
- La recherche de justificatifs (Gmail, reçus).
- Donner les descriptions à Demander ou au tri automatique.
- Une page dédiée par marchand.

## Description des marchands

### Stockage

Trois colonnes de plus dans `merchants` (nouvelle migration) :

| colonne | type | note |
| --- | --- | --- |
| description | text, nullable | une phrase, 140 caractères au plus |
| description_source | text, enum `claude`, `web`, `user`, nullable | qui l'a écrite |
| described_at | text, nullable | date ISO du dernier essai, même sans résultat |

`described_at` non nul et `description` nulle veut dire « essayé, pas reconnu ».
Une description `web` ou `user` n'est jamais écrasée par Claude sans web.
Une description `user` n'est jamais écrasée par la recherche web non plus : la recherche n'est proposée que si la description n'est pas `user`.

### Passage de fond (sans web)

Le nommeur existant (`nameMerchants`) devient « nommer et décrire » : un seul prompt, un seul appel par lot de 150, même cadence.
Il traite les clés portées par au moins une opération dont le nom est nul **ou** dont `described_at` est nul, les plus fréquentes d'abord.
Les marchands déjà nommés sont ainsi décrits une fois, sans renommer quoi que ce soit : le nom n'est écrit que là où `source` est nul, comme aujourd'hui.

Le schéma de sortie gagne un champ `description` par clé.
Consignes ajoutées au prompt :

- Une phrase courte qui dit ce qu'est ce marchand : « Chaîne de fast-food », « Éditeur de jeux vidéo (League of Legends) », « Boulangerie ».
- La ville ou le quartier si le libellé en donne un (« BK K0010 PARIS » → « Chaîne de fast-food, Paris »).
- Pour une personne : la relation si elle est claire, sinon « Virement à un particulier ».
- Chaîne vide si le marchand n'est pas reconnaissable : ne jamais deviner.

Côté serveur : description vide ou de plus de 140 caractères → `description` nulle, mais `described_at` est quand même posé, pour ne pas redemander à chaque tour.

### Recherche web à la demande

`POST /api/merchants/:key/describe` lance Claude avec `--tools WebSearch,WebFetch` pour ce seul marchand, attend la réponse (délai max 120 s) et renvoie le `MerchantDetail` à jour.
Le prompt ne contient que la clé et jusqu'à 3 libellés bruts : jamais de montant, de date ou de compte, comme la règle web de Demander.
Il demande la même phrase que le passage de fond, plus de quoi distinguer un commerce local (type, ville, quartier).
Réponse : `{ description: string }`, chaîne vide si rien de fiable n'a été trouvé.
Résultat stocké avec `description_source = 'web'` et `described_at` à jour, description vide stockée nulle.
Un seul appel en cours par clé : un second appel pendant le premier attend le même résultat.
Claude absent ou en erreur → `ClaudeError` habituelle, la fiche affiche le message et le bouton reste disponible.

### Correction à la main

`PUT /api/merchants/:key` accepte en plus `description` (facultatif, trim, 140 caractères au plus).
Non vide → `description_source = 'user'`.
Vide → description remise à nulle, `description_source` et `described_at` nuls : le passage de fond la redécrira.
Le formulaire de renommage existant (`useMerchantHeading`) gagne un champ « Description » sous le nom ; le bouton devient « Modifier le marchand ».

### API

`MerchantDetail` gagne :

- `description: string | null`, `descriptionSource`, `describedAt` ;
- `total12Months: Cents` : somme signée des opérations confirmées de ce marchand sur les 365 derniers jours ;
- `firstDate: ISODate | null` : date de la première opération.

`transactionFilterSchema` gagne `merchant` (clé exacte), pour lister les opérations d'un marchand.

## La fiche

### Quand elle s'ouvre

Cliquer une dépense, un revenu ou un virement **confirmé** ouvre la fiche, partout où `TransactionEditDialog` est ouvert aujourd'hui (Opérations, Accueil, Journal).
Les opérations prévues et les répartitions entre enveloppes ouvrent directement le formulaire, comme aujourd'hui : il n'y a rien à se remémorer.

Fiche et formulaire vivent dans le même dialogue : « Modifier » bascule vers le formulaire actuel, sans fermer.
Annuler dans le formulaire revient à la fiche si on venait de la fiche, ferme sinon ; enregistrer ferme le dialogue, comme aujourd'hui.

### Contenu, de haut en bas

1. **En-tête** : nom du marchand (ou libellé affiché), montant signé, date en toutes lettres, compte, enveloppe (tag) ; bouton « Modifier ».
2. **Qui c'est** (seulement si l'opération a un marchand) :
   - la description, avec la mention de sa source en discret (« d'après Claude », « d'après le web », rien pour l'utilisateur) ;
   - pas de description et pas encore essayé : « Claude n'a pas encore décrit ce marchand » ;
   - pas reconnu, ou envie de mieux : bouton « Chercher sur le web » (absent si la source est `user`), qui affiche « Claude cherche sur le web… » pendant l'appel ;
   - recherche web sans résultat : « Rien trouvé sur le web ».
3. **Chez ce marchand** (seulement s'il a plus d'une opération) : « 14 passages depuis mars 2025 · 182,40 € sur 12 mois », puis les 5 dernières opérations hors celle-ci, cliquables : un clic remplace la fiche par celle de l'opération choisie.
4. **Le même jour** : les autres opérations confirmées du même jour, tous comptes, sans les répartitions, cliquables de la même façon ; section absente s'il n'y en a pas.
5. **Détails bancaires** : libellé brut de la banque, note si elle ne répète pas le libellé (même règle que `TransactionRow`), avances éventuelles.

Les listes réutilisent `TransactionRow` en version compacte.
Les données viennent de `useMerchant` (déjà en cache) et de deux appels à la liste des opérations : `merchant=<clé>&limit=6` et `from=to=<date>&excludeAllocations=true`.

### Composants

- `TransactionSheet` (nouveau, `client/src/components/transactions/`) : la fiche seule, sans dialogue ; reçoit l'opération, `onEdit` et `onOpen(transaction)`.
- `MerchantAbout` (nouveau) : la section « Qui c'est », avec la recherche web.
- `TransactionEditDialog` devient le dialogue de l'opération : état `view` ou `edit`, `view` par défaut selon les règles ci-dessus, et l'opération courante en état local pour la navigation entre fiches.

## Tests

- `core`/serveur : le prompt de fond contient les consignes de description ; `setClaudeNames` (renommé) n'écrase ni nom `user` ni description `web`/`user` ; `described_at` posé même sans description ; les marchands nommés mais non décrits sont repris.
- Route `describe` : prompt sans montant ni date, stockage `web`, description vide stockée nulle, appels concurrents dédoublonnés, erreur Claude propagée (exec simulé).
- Route `PUT` : description `user`, description vide remise à décrire.
- `MerchantDetail` : `total12Months` et `firstDate` ; filtre `merchant` de la liste.
- Client : la fiche s'ouvre pour une dépense confirmée, le formulaire pour une prévue ; « Modifier » puis « Annuler » revient à la fiche ; clic sur une opération voisine change la fiche ; états de « Qui c'est ».
- Recette dans le navigateur sur une copie de la vraie base : quelques marchands connus et inconnus, recherche web réelle sur un petit commerce.
