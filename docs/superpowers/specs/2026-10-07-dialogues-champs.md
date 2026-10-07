# Runway - refonte des dialogues et des champs

Objectif : des formulaires qui ont la même personnalité que la saisie rapide, au lieu de grilles de champs encadrés génériques.
Prolonge la section « Direction visuelle » de `2026-10-06-ux-redesign.md`.

Constat de départ :

- Deux langages coexistent : la saisie rapide (montant en héros, pastilles d'enveloppe) et des formulaires « Bootstrap » (champs encadrés, labels gris, selects partout).
- Les dates utilisent l'`<input type="date">` natif, affiché au format du navigateur (`mm/dd/yyyy` sur un Chrome en anglais).
- Les boutons d'action sont tantôt dans le pied du `Dialog`, tantôt dans le formulaire.
- Deux formulaires d'opération existent en parallèle : `QuickEntry` (création) et `TransactionForm` (modification, répartition).

## Principe : deux formes, une famille

- Dans les formulaires (dialogues et pages Réglages, Import) : champs **soulignés**, style « registre », sans cadre.
- Dans les barres d'outils et les listes (filtres, selects en ligne) : **pastilles**, cousines du `Segmented` et des puces d'enveloppe.
- Le choix parmi peu d'options visibles (enveloppe, couleur) se fait en pastilles, pas en select.
- Le montant principal d'un formulaire d'opération ou de charge fixe est le héros, comme dans la saisie rapide.

Toutes les couleurs passent par les variables de `tokens.css`, le mode sombre suit sans règle spécifique.

## Composants de base (`components/ui`)

### `Field`

- Label en petites capitales (`--text-xs`, majuscules, espacement 0.07em, `--ink-mute`).
- Le label passe en `--ink` quand le champ a le focus (`:focus-within`), en `--negative` en cas d'erreur.
- Aide et erreur sous le trait, en `--text-xs`.
- API inchangée : `children(id, describedBy)` et liens ARIA conservés.

### `Input`, `Select`, `Textarea`, `MoneyInput`

- Plus de cadre ni de fond : un trait bas de 1px `--rule-strong`, hauteur 38px, texte en `--text-md` légèrement agrandi (16px, ce qui évite aussi le zoom automatique d'iOS).
- Survol : trait `--ink-mute`.
- Focus : trait de 2px `--ink`, souligné d'un liseré `--marking` juste en dessous ; pas d'anneau `outline`.
- Erreur : trait de 2px `--negative` (piloté par `Field` via `aria-invalid`, plus par un sélecteur `:global(input)`).
- Désactivé : opacité réduite et trait en pointillés.
- `Select` reste un `<select>` natif (accessibilité, sélecteurs natifs sur mobile), avec un chevron dessiné en CSS.
- `Textarea` s'agrandit avec son contenu (`field-sizing: content`), hauteur minimale de deux lignes ; la variante technique (clé PEM) garde la police mono.
- `MoneyInput` : chiffres alignés, valeur à droite, symbole « € » en `--ink-mute` après la valeur ; comportement de saisie inchangé.

### `DateField` (remplace `DateInput`)

- Bouton qui affiche la date en français via `date-fns` et la locale `fr` : « jeu. 1 oct. 2026 ».
- Valeur exposée inchangée : chaîne ISO `YYYY-MM-DD`, ou `null` pour une date facultative vide.
- Un champ facultatif vide affiche un texte de remplacement fourni par l'appelant (« Sans fin ») et propose « Effacer » dans le calendrier.
- Au clic, un calendrier `react-day-picker` (nouvelle dépendance, s'appuie sur `date-fns`) s'ouvre dans un popover natif (attribut `popover`, donc dans la couche supérieure, jamais coupé par le défilement du dialogue).
- Le popover se place sous le champ avec le positionnement par ancre CSS, et au-dessus s'il manque de place.
- Semaine du lundi au dimanche, aujourd'hui cerclé, jour choisi en encre pleine.
- Raccourcis « Aujourd'hui » et « Hier » sous la grille.
- Clavier : flèches pour changer de jour, Page haut/bas pour le mois, Entrée pour choisir, Échap pour fermer sans changer et rendre le focus au champ.
- Échap dans le calendrier ne ferme pas le dialogue qui le contient.
- Une variante plage (`DateRangeField`) sert à la période personnalisée des filtres (Opérations, Analyse).

### `ChipPicker` (nouveau, extrait de `QuickEntry`)

- Groupe de pastilles à choix unique, sémantique `radiogroup` avec navigation par flèches et un seul arrêt de tabulation.
- Chaque option peut porter une pastille de couleur (`Dot`).
- Option choisie : fond `--ink`, texte `--paper`.
- Toutes les options sont affichées, sur plusieurs lignes si besoin.
- La saisie rapide l'utilise pour les enveloppes : une seule implémentation.

### `SectionLabel` (nouveau)

- Intertitre de formulaire en petites capitales suivi d'un filet qui occupe le reste de la ligne (« QUAND »).

### `Dialog`

- Titre en police d'affichage (Bricolage Grotesque, 600, `--text-lg` agrandi à ~21px), description en `--text-sm` `--ink-mute` dessous.
- Bouton fermer : rond de 30px sur fond `--paper-sunken`.
- En-tête et pied fixes, seul le corps défile ; un filet `--rule` n'apparaît en haut ou en bas du corps que lorsqu'il reste du contenu caché de ce côté.
- Pied sans filet de séparation : action principale à droite, actions secondaires à sa gauche, action destructive seule tout à gauche, en rouge.
- Les formulaires ne posent plus leurs propres boutons : le `Dialog` reçoit un `footer`, et le bouton d'envoi est relié au formulaire par `form="<id>"`.
- Mobile (moins de 768px) : feuille qui monte du bas, comme aujourd'hui ; action principale en pleine largeur, actions secondaires sur une ligne en dessous, marge basse qui respecte `env(safe-area-inset-bottom)`.
- Inchangé : `<dialog>` natif, fermeture par Échap ou clic sur le fond, animations d'entrée et de sortie, focus initial sur le premier champ.

### `ConfirmDialog` (nouveau)

- Dialogue `sm` : titre en question, phrase d'explication, nom de l'élément concerné, boutons « Annuler » et action rouge.
- Remplace les confirmations écrites à la main : suppression d'une opération, d'une charge fixe, archivage d'une enveloppe, archivage et réactivation d'un compte.

### Pastilles de barre d'outils (nouveau)

- `SearchPill` : recherche en pastille `--paper-sunken`, icône loupe, raccourci « / » conservé.
- `FilterPill` : `<select>` natif habillé en pastille.
  À sa valeur par défaut (« Tous les comptes »), fond `--paper-sunken` ; avec un filtre actif, fond `--ink` et une croix qui remet la valeur par défaut.
- `InlinePill` : select en ligne en pointillés (« + Enveloppe ») pour les listes « À ranger » et l'aperçu d'import ; une fois choisie, l'enveloppe s'affiche comme une puce pleine avec sa couleur.
- Focus clavier des pastilles : anneau `--marking` décalé de 2px.

## Dialogues

### Opérations

- `QuickEntry` reçoit `initial?: Transaction` et `mode: 'create' | 'edit'`.
- En modification : type figé, pas de « Enregistrer et en saisir une autre », pas de suggestions tirées de l'historique ni de proposition d'enveloppe par les règles.
- `TransactionEditDialog` utilise `QuickEntry` en mode `edit` ; « Supprimer » (gauche, rouge) et « Confirmer sans modifier » (opération prévue seulement) passent dans le pied.
- Nouveau `AllocationForm` : montant en héros, « De » (« Pas encore réparti » ou une enveloppe) et « Vers » en `ChipPicker`, date, libellé.
  Il sert à `AllocateDialog` (ajouter ou déplacer de l'argent) et à la modification d'une opération de répartition.
- `TransactionForm` et son fichier de style sont supprimés ; ses tests sont repris sur `QuickEntry` et `AllocationForm`.

### Charge fixe (`RecurringRuleForm`)

- Montant en héros, puis `Segmented` Dépense / Revenu / Virement.
- Nom, libellé des opérations (aide « Par défaut, le nom de la règle »).
- Compte (et compte destination pour un virement) en `Select`, enveloppe en `ChipPicker` pour une dépense.
- Section « QUAND » : répéter, tous les N, jour du mois, « À partir du », « Jusqu'au » (facultatif, « Sans fin »).
- Sous la section, une phrase de résumé : « Tous les mois, le 1er, à partir du 1 oct. 2026 ».

### Enveloppe (`EnvelopeFormDialog`)

- Nom, couleur en pastilles rondes avec la couleur personnalisée en dernier, budget mensuel en `MoneyInput` (aide conservée).

### Compte (`Accounts`)

- Nom, solde initial en `MoneyInput`, numéro de compte (IBAN) en police mono.

### Règle de tri (`SortingRuleDialog`)

- « Le libellé contient » en champ souligné (aide conservée), « Ranger dans » en `ChipPicker` d'enveloppes.

### Répartir l'argent du mois (`FundDialog`)

- Une ligne par enveloppe : pastille de couleur, nom, aide (« il manque X sur Y »), `MoneyInput` aligné à droite.
- Le récapitulatif (« À répartir », « Restera non réparti » ou dépassement) et le bouton « Répartir X € » passent dans le pied du `Dialog`, toujours visibles pendant le défilement.

### Consultation (`EnvelopeDetailDialog`)

- Hérite seulement du nouvel en-tête.

## Hors dialogues

- Réglages (Général, Banque, Comptes) et Import : les champs passent au style souligné sans changement de structure.
- `TransactionFilters` : `SearchPill`, `FilterPill` pour compte, enveloppe et statut, `DateRangeField` en pastille pour « Dates ».
- Analyse : la période personnalisée utilise `DateRangeField` en pastille.
- `UnsortedList` et `ImportPreview` : selects d'enveloppe en `InlinePill`.
- `Upcoming` (prévision) : le select de compte ou d'enveloppe à tracer devient une `FilterPill`.

## Tests et vérification

- Tests unitaires : `DateField` (affichage français, valeur ISO, clavier, Échap, « Sans fin »), `ChipPicker` (flèches, un seul arrêt de tabulation, `aria-checked`), `ConfirmDialog`, `FilterPill` (croix de réinitialisation).
- Tests repris : `QuickEntry` en modes création et modification, `AllocationForm`, `MoneyInput`, `ImportPreview`.
- Passage complet dans le navigateur sur chaque dialogue et chaque barre de filtres, à 1440px et 390px, en mode clair et sombre, au clavier seul.
- `npm run typecheck`, `npm run lint` et `npm test` au vert.
