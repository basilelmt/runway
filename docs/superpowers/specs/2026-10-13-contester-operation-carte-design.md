# Contester une opération carte depuis Runway

## Objectif

Depuis une dépense carte, Runway guide la contestation auprès de La Banque Postale : quel motif choisir, quelle démarche préalable faire, quelles informations recopier, combien de temps il reste.
La contestation elle-même se fait chez LBP : les API DSP2 (Enable Banking) ne permettent pas de contester, et l'espace client LBP ne permet pas de pointer vers une opération précise.

## Périmètre

- Seules les dépenses carte confirmées sont concernées : achats (`ACHAT CB …`) et retraits (`RETRAIT …`).
- Prélèvements, virements et frais bancaires sont hors périmètre.
- Rien n'est enregistré : pas d'état « contestée », pas de suivi.
  Le suivi des contestations est une évolution possible, à spécifier séparément.

## Parcours

1. Dans le dialogue d'une opération (`TransactionEditDialog`), un bouton discret « Contester » apparaît dans le pied, à côté de « Supprimer ».
   Il n'apparaît que si l'opération est une dépense confirmée reconnue comme opération carte.
2. Le clic ouvre un dialogue « Contester cette opération », étape 1 : « Que s'est-il passé ? », avec quatre choix.
3. Étape 2 : « À faire chez La Banque Postale », avec un bouton « Retour » vers l'étape 1.

### Les quatre motifs

| Choix affiché | Motif LBP à sélectionner | Démarche préalable |
| --- | --- | --- |
| Je ne reconnais pas ce paiement | Ma carte est en ma possession mais je conteste formellement les opérations débitées | Aucune |
| Ma carte a été perdue ou volée | Ma carte est perdue ou volée et je conteste les opérations débitées | Faire opposition d'abord : application LBP, Cartes > Actions > Faire opposition, ou le 3639 (24h/24) |
| Problème lors d'un retrait | Ma carte est en ma possession mais je rencontre un problème avec le retrait que j'ai effectué | Aucune |
| Souci avec le commerçant (non reçu, mauvais montant, débité deux fois…) | Ma carte est en ma possession mais je rencontre un problème avec un paiement que j'ai effectué | Contacter le commerçant d'abord pour demander un remboursement ; contester seulement si le litige n'est pas résolu |

Le choix « Problème lors d'un retrait » n'est proposé que pour un retrait, et les choix propres aux paiements (« Souci avec le commerçant ») seulement pour un achat.
Les motifs sont une table de données dans `core/cardContest.ts`, pas du texte codé en dur dans le JSX.

### Contenu de l'étape 2

- La démarche préalable, si le motif en a une, dans un `Notice` placé en tête (ton alerte pour la perte ou le vol).
- Le chemin dans l'espace client : *Moyens de paiement > Cartes bancaires > Contestation d'opération*.
- Le libellé exact du motif LBP à cocher.
- Les informations à recopier, chacune avec un bouton copier :
  - commerçant (nom de marchand résolu par `useMerchant`, sinon libellé brut) ;
  - date d'achat (tirée du libellé) ;
  - date de débit (date de l'opération) ;
  - montant en euros, et montant en devise d'origine s'il figure dans le libellé ;
  - carte se terminant par les chiffres tirés du libellé.

  Une information introuvable dans le libellé est omise, sans ligne vide.
- Le délai restant : « Il te reste 11 mois pour contester » ; en alerte à 30 jours ou moins ; « Délai dépassé » au-delà, avec un `Notice` qui oriente vers une réclamation auprès du conseiller.
  Quand une devise étrangère est détectée, une note rappelle que le délai est de 120 jours si le commerçant est hors de l'Espace économique européen.
- Un bouton principal « Ouvrir mon espace client », vers `https://voscomptesenligne.labanquepostale.fr/`, dans un nouvel onglet.
- Un lien secondaire « Aide La Banque Postale », vers la page de la FAQ LBP sur la contestation d'une opération carte.

## Architecture

### `core/cardContest.ts` (fonctions pures)

- `parseCardOperation(kind, label)` renvoie `{ type: 'purchase' | 'withdrawal'; purchaseDate: string | null; foreignAmount: string | null; cardEnding: string | null }`, ou `null`.
  - `null` si `kind` n'est pas `expense`, ou si le libellé ne commence ni par `ACHAT CB` ni par `RETRAIT`.
  - `purchaseDate` : première date `JJ.MM.AA` du libellé, convertie en ISO `AAAA-MM-JJ`.
  - `foreignAmount` : segment `<DEVISE> <montant>` qui suit la date quand la devise n'est pas `EUR`, par exemple `USD 12,99` ; `null` pour l'euro.
  - `cardEnding` : chiffres de `CARTE NUMERO 089`, `CARTE NO 089` ou `CARTE X1234`.
    Les motifs de numéro de carte sont partagés avec `core/merchants.ts` (`MERCHANT_NOISE`) plutôt que dupliqués.
- `contestDeadline(debitDate, now)` renvoie `{ deadline: string; daysLeft: number; state: 'ok' | 'soon' | 'expired' }`.
  La date limite est la date de débit plus 13 mois ; `soon` à 30 jours ou moins, `expired` après la date limite.
- `CONTEST_REASONS` : la table des quatre motifs (identifiant, choix affiché, motif LBP, démarche préalable, types d'opération concernés).

### `client/src/components/transactions/ContestDialog.tsx`

- Props : l'opération, `open`, `onClose`.
- État local : le motif choisi (`null` à l'étape 1).
- Réutilise `Dialog`, `Notice` et `Button` de `components/ui`, et suit les dialogues existants pour la mise en forme.
- Le copier utilise `navigator.clipboard.writeText` et confirme par un toast.

### `TransactionEditDialog`

- Calcule `parseCardOperation(t.kind, t.label)` ; affiche « Contester » dans le pied si le résultat est non nul et que `t.status` est `confirmed`.
- Le dialogue d'édition se ferme au profit de `ContestDialog`, comme pour la confirmation de suppression.

## Tests

- `core/cardContest.test.ts`, sur des libellés réels anonymisés :
  - achat avec `CARTE NUMERO`, avec `CARTE NO`, avec `CARTE X1234` ;
  - achat avec `EUR` (pas de montant en devise) et avec une devise étrangère ;
  - retrait ;
  - libellés non carte (prélèvement, virement, frais) et revenus : `null` ;
  - libellé carte sans date ni numéro : champs à `null`, type reconnu ;
  - `contestDeadline` : bornes `ok` / `soon` / `expired`, et fin de mois (débit le 31).
- `ContestDialog.test.tsx` : chaque motif affiche le bon libellé LBP et la bonne démarche préalable ; une information absente n'est pas affichée ; le délai dépassé affiche l'alerte.
- `TransactionEditDialog.test.tsx` : « Contester » présent pour une dépense carte confirmée, absent pour une opération prévue, un prélèvement et un revenu.
- Vérification visuelle dans le navigateur des deux étapes, en clair et en sombre.
