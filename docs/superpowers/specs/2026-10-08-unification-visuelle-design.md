# Runway - unification visuelle

Objectif : une seule version de chaque élément d'interface, des écrans qui se ressemblent, et une UX plus calme.
On garde la direction visuelle de `2026-10-06-ux-redesign.md` (papier, encre, jaune de piste, Bricolage Grotesque, Instrument Sans, IBM Plex Mono).
On ne change ni la palette ni les fonctionnalités : on factorise, on aligne, et on simplifie là où l'UX se contredit.

La référence visuelle validée est `2026-10-08-unification-visuelle-design-system.html` (à ouvrir dans un navigateur).
En cas de doute sur un rendu, c'est elle qui fait foi.

## Constat

Un audit du client (8 octobre 2026) montre que les tokens sont bien utilisés, mais que les patterns sont refaits à la main et divergent :

- 5 copies du chiffre clé et 6 copies de « libellé + montant », chacune avec ses propres écarts.
- 7 lignes de liste différentes, de 44 à 64 px, et des squelettes de 40 px qui font sauter la page au chargement.
- `.section-title` contournée à 8 endroits, le libellé en capitales recopié 12 fois avec 3 espacements de lettres.
- 4 mécanismes de confirmation (ConfirmDialog, `window.confirm`, confirmation en ligne, aucune).
- `.error` redéfinie dans 20 fichiers, 3 traitements différents des erreurs de chargement.
- Actions de ligne en fondu sur 3 écrans, toujours visibles sur 2, menu mobile seulement pour les enveloppes.
- Investir redéfinit les tokens de couleur en dur, `#2b2000` est recopié 3 fois, plusieurs tailles hors échelle.

## Principes

1. Une version par besoin : pas de variante locale d'un composant partagé.
2. Filets plutôt que cartes : une carte seulement pour des objets parcourus en grille (les idées) et pour le fond sombre d'Investir.
3. Un seul jaune par écran : la tâche à faire et le bouton qui la règle.
4. Les montants parlent en premier : Bricolage pour les grands montants, chiffres tabulaires ailleurs, mono réservé aux identifiants techniques.
5. Calme au repos : les actions secondaires d'une ligne vivent dans un menu.
6. Tout passe par un token : aucune couleur, taille, rayon ou ombre en dur hors de `tokens.css`.

## Fondations

### Tokens ajoutés

| Token | Valeur | Remplace |
|---|---|---|
| `--marking-on` | `#2b2000` dans les deux modes (le jaune reste clair en sombre) | texte sur jaune en dur dans Button, Tabs, SideNav |
| `--scrim` | `rgb(20 32 28 / 0.45)`, `rgb(0 0 0 / 0.6)` en mode sombre | voile de Dialog en dur |
| `--shadow-raise` | `0 1px 2px rgb(20 32 28 / 0.12)` | ombre du Segmented et de la saisie rapide |
| `--s-half` | `2px` | les 17 gaps et marges de 2 px |
| `--text-2xs` | `0.6875rem` | touches clavier et libellés de la barre du bas |
| `--row-h` | `56px` | hauteur de ligne de liste |
| `--row-h-compact` | `44px` | ligne dans un dialogue ou un panneau |
| `--night`… | voir plus bas | couleurs en dur d'Investir |

Les tailles hors échelle disparaissent : le titre de Dialog passe à `--text-xl`, AmountHero utilise `--text-4xl` et `--text-3xl`, `10px` de RunwayStrip passe à `--text-2xs`.
Les rayons en px passent par `--radius-sm` ou `--radius-pill`.
Le fond sombre d'Investir garde son rendu actuel (presque noir, encre chaude) via des tokens « nuit » : `--night`, `--night-ink`, `--night-ink-soft`, `--night-ink-mute`, `--night-positive`, `--night-negative`, `--night-warning`, `--night-sky`.
Plus aucune valeur en dur dans Portfolio et MoonTrail.

### Typographie

Huit rôles :

| Rôle | Police | Taille | Graisse |
|---|---|---|---|
| Titre de page | display | `2xl` | 600 |
| Titre de dialogue | display | `xl` | 600 |
| Titre de section, d'état vide, de carte | display | `lg` | 600 |
| Titre de bloc | display | `md` | 600 |
| Texte courant, libellé de ligne | body | `md` | 400 / 500 |
| Description, intro, aide | body | `sm`, `ink-mute` | 400 |
| Libellé en capitales | body | `xs`, `0.08em` | 500 |
| Identifiant technique | mono | `sm` | 400 |

Montants : `Amount xl` pour le seul chiffre clé de l'écran, `lg` pour les stats et soldes, `md` en ligne, `sm` en secondaire.
Les pourcentages de tête (taux d'épargne) utilisent les mêmes tailles.
Les dates en colonne utilisent toutes `formatDateCompact`, en `.num`.
Les descriptions et intros sont toutes en `sm`, `ink-mute`, `max-width: 62ch`.

## Structure de page

Toutes les pages suivent ce squelette, chaque bloc étant facultatif : `PageHeader`, `KeyFigure`, `Tabs`, sections (`SectionHeader` + contenu).
Écarts verticaux : `s-10` entre blocs et entre sections, `s-6` sous les onglets, `s-3` sous un en-tête de section.

### PageHeader (changé)

Props : `title`, `subtitle?`, `eyebrow?`, `back?` (lien retour avec libellé), `actions?`.
L'Accueil l'utilise avec `eyebrow` pour la date, `title` pour le mois et `subtitle` pour les jours restants, à la taille standard (décision 1 : A).
Import l'utilise avec `back`.

### SectionHeader (nouveau)

Props : `title`, `description?`, `aside?` (un seul emplacement à droite), `as?` (niveau de titre, `h2` par défaut).
L'emplacement de droite accepte un lien « voir tout » (composant `SectionLink`, toujours avec l'icône flèche), un `Total`, un bouton `secondary sm` ou des contrôles `sm`.
Remplace `.section-title` et ses variantes (Analyse, FixedCharges, Idées, Réglages, HoldingDialog, IdeasScore, Upcoming).

### Total (nouveau)

`Total label="Total" amount={…}` : libellé `sm ink-mute`, montant `ink-soft` 500.
Remplace `.netWorth` (Accueil), `.total` (Comptes), `.savedLine` (Budget) et le résumé d'Opérations.

## Chiffre clé et stats

### KeyFigure (nouveau)

Props : `label`, `amount` (ou `value` pour un pourcentage), `tone?`, `context?` (« sur 2 401,00 € prévus »), `caption?`, `children?` (barre de progression), `aside?` (StatGroup vertical ou bouton).
Écart fixe de `s-3` entre le libellé et le montant.
Sans cadre sur toutes les pages, sauf Investir qui garde son fond sombre via `variant="night"` (décision 2 : A).
L'Accueil perd sa carte claire.
Utilisé par l'Accueil, le Budget, l'Analyse (dépensé et taux d'épargne), Investir.
Demander garde un montant `lg` mais passe par le même composant en `size="compact"`.

### StatGroup (nouveau)

`StatGroup` avec des `Stat label amount emphasis?`, en `direction="row" | "column"`.
Écart `s-8`, séparateur facultatif (filet gauche 1 px en colonne), stat mise en avant avec un filet gauche de 2 px jaune.
Remplace les groupes de l'Accueil, d'Investir, de FixedCharges, de l'Analyse, d'EnvelopeDetailDialog, de FundDialog et de HoldingDialog (qui passe à `Amount lg`).

## Boutons et actions

Les variantes de `Button` ne changent pas, leur usage devient une règle :

| Variante | Usage |
|---|---|
| `marking` | L'action qui règle ce qui demande ton attention, au plus une par écran (Répartir, Trier avec Claude) |
| `primary` | Valider un formulaire ou un dialogue, jamais dans un en-tête de page |
| `secondary` | Action d'en-tête de page ou de section, et action des états vides |
| `ghost` | Annuler, boutons d'icône, ouvrir un menu |
| `danger` | Uniquement dans un dialogue de confirmation |
| `text` (nouveau) | Afficher ou masquer, lien discret |

Conséquences : « Ajouter une position » et « Nouveau compte » passent en `secondary`, l'état vide du Budget aussi.
Les boutons de la barre latérale, du Shell et des lignes deviennent des `Button` aux tailles standard (38 et 30 px).
Les boutons texte « afficher les archivées » (4 styles) et ceux de la saisie rapide passent par `Button variant="text"`.

## Listes

### ListRow (nouveau)

Emplacements : `lead` (date, point, icône), `title`, `meta`, `middle` (progression, facultatif), `trail` (montant + sous-montant), `actions`.
Props : `compact?` (44 px au lieu de 56), `onClick?` (ligne cliquable avec le survol de `.hover-row`), `muted?` (opération prévue, montant atténué).
`ListRow.Skeleton` reproduit exactement la hauteur et la structure de la vraie ligne, avec un nombre de lignes en paramètre.
Utilisé par TransactionRow, EnvelopeRow, FixedCharges, Comptes, Règles de tri, UnsortedList, les plus grosses dépenses de l'Analyse, Upcoming, ImportPreview, EnvelopeDetailDialog, HoldingDialog, HoldingList.
Les composants métier restent (TransactionRow, EnvelopeRow…) mais se composent de `ListRow` au lieu d'avoir leur propre CSS de ligne.

### ColumnHeader (nouveau)

Ligne d'en-têtes de colonnes en libellés capitales, alignée sur les emplacements de `ListRow`.
Remplace EnvelopeRowHeader, les en-têtes de Portfolio, de l'historique bancaire et d'Upcoming.

### GroupLabel (nouveau)

Libellé en capitales au-dessus d'un groupe de lignes (jours d'Opérations, groupes de FixedCharges).
Rend un titre du bon niveau mais avec le style `.eyebrow`.

### RowMenu (nouveau)

Chaque ligne a au plus un bouton `ghost` icône ⋯ qui ouvre un menu (décision 3 : A).
Clic sur la ligne : l'action principale (détail ou modification).
Même comportement sur ordinateur et sur mobile, la feuille d'actions mobile du Budget disparaît.
Le menu est accessible au clavier (flèches, Échap, retour du focus sur le bouton) et se ferme au clic extérieur.
Les actions destructrices sont en bas, après un séparateur, en rouge, et ouvrent un ConfirmDialog.
Remplace les rangées d'icônes d'EnvelopeRow, FixedCharges, Comptes, Règles de tri et HoldingDialog.
Les flèches monter / descendre des Règles de tri passent dans le menu, le glisser-déposer reste avec une poignée identique au Budget (bouton utilisable au clavier).

### EnvelopeTag (nouveau)

L'enveloppe d'une ligne est toujours une pastille grise avec point de couleur (décision 4 : A).
Remplace le point + texte de l'Analyse, de FixedCharges, d'UnsortedList.

### Disclosure (nouveau)

Liste repliable avec un `Button variant="text"` et un chevron.
Remplace les sections archivées du Budget et des Comptes, les idées closes, les `<details>` de l'import.

## Messages et états

### Notice (nouveau)

Bandeau unique, tons `marking`, `negative`, `warning`, `neutral`, avec icône, texte et action facultative.
Remplace FundingBanner, RuleBanner, les erreurs de BinancePanel, Ideas, AskPanel, `Card tone="negative"` d'UnsortedList, la note de HoldingDialog et l'état « en cours » des idées.
FundingBanner et RuleBanner restent comme composants métier mais rendent un `Notice`.

### TodoItem (nouveau)

Lien avec barre gauche de 3 px jaune ou rouge, réservé à la liste « À faire » de l'Accueil.
`.planOver` du Budget devient un `Notice`.

### FieldError (nouveau)

Message d'erreur de formulaire avec `role="alert"`.
Remplace les 20 classes `.error` locales.

### EmptyState et ErrorState

`EmptyState` ne change pas et absorbe les états vides faits main (EnvelopeDetailDialog, ImportPreview, DropZone, `.allClear` de l'Accueil, paragraphes de Budget, Banque, Upcoming).
`ErrorState` (nouveau) : même gabarit en ton négatif, titre « Impossible de charger … », bouton « Réessayer » qui relance la requête.
Toutes les erreurs de chargement de page et de section l'utilisent, y compris les KPI de l'Analyse et TopExpenses qui n'en affichent aucune aujourd'hui.

## Petits éléments

- `Badge` : seule pastille de statut, remplace `.accountKind` de l'Accueil, le verdict des idées, le « Revenu » de l'import.
- `CountBadge` (nouveau) : compteur jaune commun aux onglets et à la barre latérale, une seule animation.
- `Kbd` (nouveau) : touche clavier, barre latérale et saisie rapide.
- `Spinner` (nouveau) : extrait de Button, réutilisé par DropZone.
- Point qui pulse : un seul style, partagé par Idées et Demander.
- Le logo de la barre latérale et du Shell mobile devient un composant `BrandMark` avec une prop de taille.

## Contrôles

Les copies disparaissent : le choix Dépense / Revenu / Virement de la saisie rapide devient un `Segmented` (qui accepte des icônes), « Aujourd'hui / Hier » un `ChipPicker`, la recherche d'AddHoldingDialog un `SearchPill`, la zone de saisie de Demander un `Textarea` (focus jaune comme partout).
Le curseur d'horizon d'Upcoming reste un `<input type="range">` mais passe par un composant `Range` stylé avec les tokens.

## Dialogues et confirmations

`ConfirmDialog` est le seul mécanisme de confirmation.
Les `window.confirm` (Règles de tri, BankSyncPanel), les confirmations en ligne (HoldingDialog, BinancePanel) disparaissent, la suppression d'un mouvement demande désormais confirmation.

## Écrans

- **Accueil** : PageHeader standard, KeyFigure sans carte avec StatGroup vertical, « À faire » en TodoItem, enveloppes en ListRow avec SectionLink, comptes avec Total et Badge.
- **Budget** : KeyFigure « Pas encore réparti » avec bouton `marking`, enveloppes en ListRow + RowMenu, FixedCharges avec SectionHeader, StatGroup et ListRow, archivées en Disclosure.
- **Opérations** : Total pour le résumé, GroupLabel par jour, ListRow avec EnvelopeTag, ErrorState, squelettes exacts. UnsortedList sur Notice et ListRow.
- **Analyse** : KeyFigure, barres sur `ProgressBar` (la copie locale disparaît), plus grosses dépenses en ListRow, taux d'épargne en KeyFigure, Upcoming sur SectionHeader, ColumnHeader et ListRow.
- **Investir** : KeyFigure `night`, tokens « nuit » au lieu des couleurs en dur, positions en ListRow + ColumnHeader, Notice pour les erreurs Binance.
  Idées : en-tête en SectionHeader, cartes allégées (titre, horizon, action visée, performance face au S&P 500, verdict en Badge), raisonnement complet dans un dialogue `IdeaDialog` ouvert au clic (contexte, puces, « déjà dans les prix », sources), idées closes en Disclosure.
- **Import** : PageHeader avec `back`, DropZone et ImportPreview sur EmptyState, Disclosure, ListRow et Badge, compteurs hors mono.
- **Réglages** : une colonne pour les 4 onglets, chaque bloc en SectionHeader (titre, description, action), formulaires limités à 480 px, Comptes et Règles de tri en ListRow + RowMenu.
- **Barre latérale, Shell, barre du bas, saisie rapide, Demander, dialogues** : passent sur Button, Kbd, CountBadge, Segmented, ChipPicker, Textarea, Notice, FieldError.

## Nettoyage

À la fin, plus aucun module ne doit contenir :

- de couleur hex ou rgb hors de `tokens.css` (sauf les couleurs d'enveloppes stockées en base) ;
- de `font-size`, `border-radius` ou `box-shadow` sans token ;
- de classe `.error`, de copie de `.eyebrow`, de grille de ligne de liste locale.

`.section-title` et `.section-link` sont retirés de `global.css`.
Un test automatisé (vitest) parcourt les `*.module.css` du client et échoue s'il trouve une couleur, une taille de police, un rayon ou une ombre en dur, avec une liste d'exceptions explicite et commentée.

## Tests et vérification

- Chaque nouveau composant de `ui/` a ses tests (rendu, accessibilité : rôles, clavier pour RowMenu et Disclosure, `role="alert"` pour FieldError et Notice négatif).
- Les tests existants des composants migrés continuent de passer (TransactionRow, EnvelopeRow, FundingBanner, IdeaCard, HoldingList, BinancePanel…), adaptés quand le comportement change (RowMenu, ConfirmDialog).
- Chaque écran migré est vérifié dans le navigateur, en clair et en sombre, à 1440 px et à 390 px, et comparé aux captures d'avant.
- `npm run typecheck`, `npm run lint` et `npm test` passent à chaque étape.

## Hors périmètre

- Pas de nouvelle palette, pas de nouvelle police, pas de changement de navigation.
- Pas de changement côté serveur ni de modèle de données.
- Les graphiques (BalanceAreaChart, MonthlyBars, NetWorthLine, PortfolioChart, RunwayStrip) ne changent que pour retirer les valeurs en dur.
