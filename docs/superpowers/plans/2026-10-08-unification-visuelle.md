# Unification visuelle - plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** une seule version de chaque élément d'interface dans le client Runway, des écrans qui suivent le même squelette, et une UX plus calme (menu ⋯, ConfirmDialog partout, erreurs et chargements homogènes).

**Architecture:** on crée d'abord les tokens manquants et les composants communs dans `client/src/components/ui/` (et `PageHeader` dans `layout/`), chacun testé.
Ensuite on migre les écrans un par un : les composants métier (TransactionRow, EnvelopeRow...) restent mais se composent des primitives au lieu d'avoir leur propre CSS.
On finit par supprimer les classes globales devenues inutiles et par un test qui interdit les valeurs CSS en dur.

**Tech Stack:** React 19, TypeScript 5.9, Vite 8, CSS Modules, lucide-react, TanStack Query 5, Vitest + Testing Library (jsdom), react-router.

**Références :**
- Spec : `docs/superpowers/specs/2026-10-08-unification-visuelle-design.md`
- Rendu de référence (fait foi) : `docs/superpowers/specs/2026-10-08-unification-visuelle-design-system.html`, à ouvrir dans un navigateur.

## Global Constraints

- Jamais d'em dash « — » dans le code, les commentaires, les textes ou les commits : tiret simple « - ».
- Textes d'interface en français, apostrophe typographique `’` dans les chaînes JSX (convention du dépôt), guillemets « » avec espaces insécables.
- Commentaires de code en français, sobres, comme le code existant.
- Pas de co-auteur agent dans les messages de commit. Messages au format `type(scope): description en français`.
- Aucune couleur hex/rgb, `font-size`, `border-radius` ou `box-shadow` en dur dans un `*.module.css` : toujours un token de `client/src/styles/tokens.css`.
- Pas de changement serveur, pas de changement de modèle de données, pas de nouvelle dépendance.
- Ne jamais écrire dans `/tmp` : utiliser `tmp/` du worktree (gitignoré).
- Ne jamais lancer le serveur de dev sur `~/projects/runway/data/runway.db` : toujours une copie (voir Tâche 0).
- À la fin de chaque tâche : `npm run typecheck`, `npm run lint` et `npm test` passent.
- Décisions validées : en-tête de l'Accueil standard (1A), chiffre clé sans cadre sauf Investir sombre (2A), menu ⋯ sur toutes les lignes (3A), enveloppe en pastille partout (4A), Réglages en une colonne, idées en cartes allégées + dialogue de détail.

## Carte des fichiers

Créés dans `client/src/components/ui/` :

| Fichier | Rôle |
|---|---|
| `Spinner.tsx` + `.module.css` | Indicateur de chargement (extrait de Button) |
| `Kbd.tsx` + `.module.css` | Touche clavier |
| `CountBadge.tsx` + `.module.css` | Compteur jaune (onglets, barre latérale) |
| `BrandMark.tsx` + `.module.css` | Logo Runway |
| `SectionHeader.tsx` + `.module.css` | En-tête de section, `SectionLink`, `Total` |
| `KeyFigure.tsx` + `.module.css` | Chiffre clé de l'écran |
| `StatGroup.tsx` + `.module.css` | `StatGroup` et `Stat` |
| `ListRow.tsx` + `.module.css` | `ListRow`, `ListRowSkeleton`, `ColumnHeader`, `GroupLabel` |
| `EnvelopeTag.tsx` + `.module.css` | Pastille d'enveloppe |
| `RowMenu.tsx` + `.module.css` | Menu ⋯ de ligne |
| `Notice.tsx` + `.module.css` | Bandeau unique |
| `TodoItem.tsx` + `.module.css` | Élément de « À faire » |
| `FieldError.tsx` + `.module.css` | Erreur de formulaire |
| `ErrorState.tsx` | Échec de chargement (s'appuie sur EmptyState) |
| `Disclosure.tsx` + `.module.css` | Liste repliable |
| `Range.tsx` + `.module.css` | Curseur |
| `PulseDot.tsx` + `.module.css` | Point qui pulse (travail en cours) |

Modifiés : `styles/tokens.css`, `styles/global.css`, `ui/Button.*`, `ui/Segmented.*`, `ui/Tabs.*`, `ui/Dialog.module.css`, `ui/AmountHero.module.css`, `ui/ProgressBar.module.css`, `ui/EmptyState.*`, `ui/index.ts`, `layout/PageHeader.tsx`, puis tous les écrans et composants métier listés tâche par tâche.

Créé à la fin : `client/src/styles/css-guard.test.ts`.

---

### Task 0: Worktree, base de recette et captures d'avant

**Files:** aucun fichier suivi.

- [ ] **Step 1: Vérifier que `master` est propre**

Run: `cd ~/projects/runway && git status --short`
Expected: aucune ligne. S'il reste des fichiers modifiés (travail sur le portefeuille), s'arrêter et demander à Basile de les commiter : ne pas les commiter soi-même, ne pas les écraser.

- [ ] **Step 2: Créer le worktree**

```bash
cd ~/projects/runway
git worktree add ../runway-unification -b unification-visuelle master
cd ../runway-unification
npm install
```

- [ ] **Step 3: Copier la base pour la recette**

```bash
mkdir -p tmp/e2e
sqlite3 ~/projects/runway/data/runway.db ".backup tmp/e2e/runway.db"
```

- [ ] **Step 4: Lancer l'app de recette**

```bash
PATH="$HOME/.local/bin:$PATH" RUNWAY_DB=tmp/e2e/runway.db PORT=3100 npx tsx server/src/index.ts > tmp/e2e/server.log 2>&1 &
API_PORT=3100 npx vite --config client/vite.config.ts --port 5180 > tmp/e2e/client.log 2>&1 &
```

Expected: `http://localhost:5180/` affiche l'Accueil avec les vraies données (pas « Bienvenue sur Runway »).

- [ ] **Step 5: Captures d'avant**

Avec Chrome DevTools MCP, pour chaque route `/`, `/budget`, `/operations`, `/operations?vue=a-ranger`, `/analyse`, `/analyse?vue=evolution`, `/analyse?vue=a-venir`, `/investir`, `/operations/importer`, `/reglages`, `/reglages/comptes`, `/reglages/banque`, `/reglages/regles` : capture pleine page à 1440×900 et à 390×844, en clair puis en sombre (`emulate` avec `prefers-color-scheme: dark`).
Enregistrer dans `tmp/e2e/avant/<route>-<largeur>-<mode>.png`.

- [ ] **Step 6: Vérifier la base de tests**

Run: `npm run typecheck && npm run lint && npm test`
Expected: tout passe. Si un test échoue déjà sur `master`, le corriger dans un commit séparé `fix: ...` avant de continuer (règle du dépôt : aucun test rouge toléré).

---

### Task 1: Tokens manquants et valeurs en dur des composants ui

**Files:**
- Modify: `client/src/styles/tokens.css`
- Modify: `client/src/components/ui/Button.module.css:96`
- Modify: `client/src/components/ui/Tabs.module.css:40,47-60`
- Modify: `client/src/components/ui/Segmented.module.css:4-5,41`
- Modify: `client/src/components/ui/Dialog.module.css:12,71`
- Modify: `client/src/components/ui/AmountHero.module.css:9,77`
- Modify: `client/src/components/ui/ProgressBar.module.css:14,19,42`
- Modify: `client/src/components/ui/DateField.module.css` (rayons et taille en px)

**Interfaces:**
- Produces: tokens `--marking-on`, `--scrim`, `--shadow-raise`, `--s-half`, `--text-2xs`, `--row-h`, `--row-h-compact`, `--night`, `--night-ink`, `--night-ink-soft`, `--night-ink-mute`, `--night-positive`, `--night-negative`, `--night-warning`, `--night-sky`. Toutes les tâches suivantes les utilisent.

- [ ] **Step 1: Ajouter les tokens**

Dans `client/src/styles/tokens.css`, dans le premier bloc `:root`, après `--focus: var(--marking);` :

```css
  /* Texte posé sur le jaune de piste, dans les deux modes (le jaune reste clair en sombre) */
  --marking-on: #2b2000;

  /* Voile sous les dialogues */
  --scrim: rgb(20 32 28 / 0.45);

  /* La nuit d'Investir : fond du portefeuille, toujours sombre */
  --night: #030408;
  --night-ink: #f2efe8;
  --night-ink-soft: #cfcac1;
  --night-ink-mute: #9a978f;
  --night-positive: #5fc08f;
  --night-negative: #ef6f58;
  --night-warning: #e0a04a;
  --night-sky: #4386d3;
```

Après `--text-xs: 0.75rem;` ajouter `--text-2xs: 0.6875rem;` (et le placer avant `--text-xs` pour garder l'ordre croissant).
Après `--s-1: 4px;`, placer avant lui `--s-half: 2px;`.
Après `--shadow-pop: ...;` ajouter :

```css
  --shadow-raise: 0 1px 2px rgb(20 32 28 / 0.12);

  /* Hauteurs de ligne de liste */
  --row-h: 56px;
  --row-h-compact: 44px;
```

Dans le bloc `@media (prefers-color-scheme: dark)`, après `--shadow-pop: ...;` :

```css
    --shadow-raise: 0 1px 2px rgb(0 0 0 / 0.4);
    --scrim: rgb(0 0 0 / 0.6);
```

- [ ] **Step 2: Remplacer les valeurs en dur des composants ui**

| Fichier | Avant | Après |
|---|---|---|
| `Button.module.css` `.marking` | `color: #2b2000;` | `color: var(--marking-on);` |
| `Tabs.module.css` `.indicator` | `border-radius: 2px 2px 0 0;` | `border-radius: var(--s-half) var(--s-half) 0 0;` |
| `Tabs.module.css` `.count` | `color: #2b2000;` | `color: var(--marking-on);` |
| `Segmented.module.css` `.group` | `padding: 3px; gap: 2px;` | `padding: var(--s-half); gap: var(--s-half);`, puis `.md .option { height: 34px }` et `.sm .option { height: 28px }` pour garder les hauteurs totales (38 et 32 px) |
| `Segmented.module.css` `.active` | `box-shadow: 0 1px 2px rgb(20 32 28 / 0.12);` | `box-shadow: var(--shadow-raise);` |
| `Dialog.module.css` voile | `rgb(20 32 28 / 0.45)` | `var(--scrim)` |
| `Dialog.module.css` `.title` | `font-size: 1.3125rem;` | `font-size: var(--text-xl); letter-spacing: -0.02em;` |
| `AmountHero.module.css` | `4rem` / `3.25rem` | `var(--text-4xl)` / `var(--text-3xl)` |
| `ProgressBar.module.css` `.sm`, `.md` | `border-radius: 3px` / `5px` | `border-radius: var(--radius-pill)` |
| `ProgressBar.module.css` `.marker` | `border-radius: 1px;` | supprimer la ligne |

Pour `DateField.module.css`, remplacer chaque `border-radius` en px par `var(--radius-sm)` (≤ 4 px) ou `var(--radius-md)` (5 à 8 px), et la taille de police en px par le token le plus proche (`--text-2xs`, `--text-xs` ou `--text-sm`).

- [ ] **Step 3: Vérifier**

Run: `grep -nE "#[0-9a-fA-F]{3,8}\b|rgb\(|font-size: *[0-9.]+(px|rem)|border-radius: *[0-9]+px|box-shadow: *[0-9]" client/src/components/ui/*.module.css`
Expected: aucune ligne.

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS.

Dans l'app de recette, ouvrir `/operations` : le Segmented de période et les onglets ont le même rendu qu'avant (comparer aux captures `tmp/e2e/avant`).

- [ ] **Step 4: Commit**

```bash
git add client/src/styles/tokens.css client/src/components/ui
git commit -m "feat(client): tokens texte sur jaune, voile, ombre légère, nuit d'Investir et hauteurs de ligne"
```

---

### Task 2: Button `text`, Spinner, Kbd, CountBadge, BrandMark, PulseDot

**Files:**
- Create: `client/src/components/ui/Spinner.tsx`, `Spinner.module.css`
- Create: `client/src/components/ui/Kbd.tsx`, `Kbd.module.css`
- Create: `client/src/components/ui/CountBadge.tsx`, `CountBadge.module.css`
- Create: `client/src/components/ui/BrandMark.tsx`, `BrandMark.module.css`
- Create: `client/src/components/ui/PulseDot.tsx`, `PulseDot.module.css`
- Modify: `client/src/components/ui/Button.tsx`, `Button.module.css`
- Modify: `client/src/components/ui/Tabs.tsx`, `Tabs.module.css` (utilise CountBadge)
- Modify: `client/src/components/ui/index.ts`
- Test: `client/src/components/ui/Primitives.test.tsx`

**Interfaces:**
- Produces:
  - `Button` accepte `variant: 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-quiet' | 'marking' | 'text'`.
  - `Spinner({ size?: number })`
  - `Kbd({ children: ReactNode })` rend un `<kbd>`.
  - `CountBadge({ count: number, label?: string })`, `label` devient l'`aria-label`.
  - `BrandMark({ size?: number })`, 24 par défaut.
  - `PulseDot({ label?: string })`.

- [ ] **Step 1: Écrire les tests**

`client/src/components/ui/Primitives.test.tsx` :

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BrandMark } from './BrandMark';
import { Button } from './Button';
import { CountBadge } from './CountBadge';
import { Kbd } from './Kbd';
import { PulseDot } from './PulseDot';
import { Spinner } from './Spinner';

describe('Button text', () => {
  it('est un vrai bouton avec la variante texte', () => {
    render(<Button variant="text">Afficher les archivées</Button>);
    expect(screen.getByRole('button', { name: 'Afficher les archivées' })).toHaveAttribute('type', 'button');
  });

  it('affiche le spinner partagé pendant le chargement', () => {
    render(<Button loading>Enregistrer</Button>);
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toHaveAttribute('aria-busy', 'true');
    expect(document.querySelector('[data-spinner]')).not.toBeNull();
  });
});

describe('Spinner', () => {
  it('est décoratif', () => {
    const { container } = render(<Spinner size={20} />);
    const el = container.firstElementChild as HTMLElement;
    expect(el).toHaveAttribute('aria-hidden');
    expect(el.style.width).toBe('20px');
  });
});

describe('Kbd', () => {
  it('rend une touche clavier', () => {
    render(<Kbd>N</Kbd>);
    expect(screen.getByText('N').tagName).toBe('KBD');
  });
});

describe('CountBadge', () => {
  it('annonce son libellé', () => {
    render(<CountBadge count={10} label="10 opérations à ranger" />);
    expect(screen.getByLabelText('10 opérations à ranger')).toHaveTextContent('10');
  });

  it('ne rend rien à zéro', () => {
    const { container } = render(<CountBadge count={0} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('BrandMark', () => {
  it('est décoratif et dimensionné', () => {
    const { container } = render(<BrandMark size={20} />);
    const el = container.firstElementChild as HTMLElement;
    expect(el).toHaveAttribute('aria-hidden');
    expect(el.style.width).toBe('20px');
  });
});

describe('PulseDot', () => {
  it('peut porter un libellé', () => {
    render(<PulseDot label="En cours" />);
    expect(screen.getByRole('status', { name: 'En cours' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Lancer les tests**

Run: `npx vitest run client/src/components/ui/Primitives.test.tsx`
Expected: FAIL, les modules `./BrandMark`, `./CountBadge`, `./Kbd`, `./PulseDot` et `./Spinner` sont introuvables.

- [ ] **Step 3: Implémenter**

`Spinner.tsx` :

```tsx
import styles from './Spinner.module.css';

/** Indicateur de chargement, dans la couleur du texte. */
export function Spinner({ size = 14 }: { size?: number }) {
  return <span data-spinner className={styles.spinner} style={{ width: size, height: size }} aria-hidden />;
}
```

`Spinner.module.css` (déplacer le CSS de `.spinner` et `@keyframes spin` depuis `Button.module.css`) :

```css
.spinner {
  display: inline-block;
  flex-shrink: 0;
  border-radius: 50%;
  border: 2px solid currentColor;
  border-right-color: transparent;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation-duration: 2.4s;
  }
}
```

Dans `Button.tsx`, importer `Spinner` et remplacer `<span className={styles.spinner} aria-hidden />` par `<Spinner />`.
Dans `Button.module.css`, supprimer `.spinner` et `@keyframes spin`, puis ajouter à la fin du fichier (après les tailles, pour l'emporter sur `.md` et `.sm`) :

```css
/* Lien discret : afficher ou masquer, action secondaire dans du texte */
.text {
  height: auto;
  padding: 0;
  gap: var(--s-1);
  background: transparent;
  color: var(--ink-soft);
  font-size: var(--text-sm);
}

.text:hover:not(:disabled) {
  color: var(--ink);
}

.text:active:not(:disabled) {
  transform: none;
}
```

Dans `ButtonProps`, ajouter `'text'` à l'union `variant`.

`Kbd.tsx` :

```tsx
import type { ReactNode } from 'react';
import styles from './Kbd.module.css';

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className={styles.kbd}>{children}</kbd>;
}
```

`Kbd.module.css` (reprend `SideNav.module.css:105-118`) :

```css
.kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 var(--s-1);
  border: 1px solid var(--rule);
  border-bottom-width: 2px;
  border-radius: var(--radius-sm);
  background: var(--paper-raised);
  color: var(--ink-mute);
  font-family: var(--font-mono);
  font-size: var(--text-2xs);
  line-height: 1;
}
```

`CountBadge.tsx` :

```tsx
import styles from './CountBadge.module.css';

/** Compteur jaune : rebondit à chaque changement de valeur. */
export function CountBadge({ count, label }: { count: number; label?: string }) {
  if (count <= 0) return null;
  return (
    <span key={count} className={styles.count} aria-label={label}>
      {count}
    </span>
  );
}
```

`CountBadge.module.css` (reprend `Tabs.module.css:47-60`, une seule animation) :

```css
.count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 var(--s-1);
  border-radius: var(--radius-pill);
  background: var(--marking);
  color: var(--marking-on);
  font-size: var(--text-xs);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  animation: bump 360ms var(--ease-out);
}

@keyframes bump {
  40% {
    transform: scale(1.25);
  }
}

@media (prefers-reduced-motion: reduce) {
  .count {
    animation: none;
  }
}
```

Dans `Tabs.tsx`, remplacer le rendu du compteur par `<CountBadge count={item.count} />` (garder le nom de prop actuel de `TabItem` pour le compteur) et supprimer `.count` et `@keyframes bump` de `Tabs.module.css`.

`BrandMark.tsx` :

```tsx
import styles from './BrandMark.module.css';

/** Le logo : une piste sombre et ses deux bandes jaunes. */
export function BrandMark({ size = 24 }: { size?: number }) {
  return <span className={styles.mark} style={{ width: size, height: size }} aria-hidden />;
}
```

`BrandMark.module.css` : reprendre le CSS de `.brandMark` de `SideNav.module.css:24-32`, en remplaçant `width`/`height` fixes par rien (portés par le style), `border-radius: 6px` par `border-radius: 25%`, et le reflet `inset ... rgb(255 255 255 / 0.14)` par `inset 0 1px 0 color-mix(in oklab, var(--tarmac-ink) 14%, transparent)`.

`PulseDot.tsx` :

```tsx
import styles from './PulseDot.module.css';

/** Travail en cours (Claude cherche, réfléchit). */
export function PulseDot({ label }: { label?: string }) {
  return label ? <span role="status" aria-label={label} className={styles.dot} /> : <span className={styles.dot} aria-hidden />;
}
```

`PulseDot.module.css` (fusion de `Ideas.module.css:261-275` et `AskPanel.module.css:139-152`, 8 px, 1.2 s) :

```css
.dot {
  display: inline-block;
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--marking);
  animation: pulse 1.2s var(--ease-out) infinite;
}

@keyframes pulse {
  50% {
    opacity: 0.35;
    transform: scale(0.8);
  }
}

@media (prefers-reduced-motion: reduce) {
  .dot {
    animation: none;
  }
}
```

Dans `index.ts`, ajouter :

```ts
export { BrandMark } from './BrandMark';
export { CountBadge } from './CountBadge';
export { Kbd } from './Kbd';
export { PulseDot } from './PulseDot';
export { Spinner } from './Spinner';
```

- [ ] **Step 4: Lancer les tests**

Run: `npx vitest run client/src/components/ui`
Expected: PASS (y compris les tests existants de Tabs et Dialog).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/ui
git commit -m "feat(client): bouton texte, spinner, touche clavier, compteur, logo et point d'activité partagés"
```

---

### Task 3: PageHeader, SectionHeader, SectionLink, Total

**Files:**
- Modify: `client/src/components/layout/PageHeader.tsx`
- Create: `client/src/components/layout/PageHeader.module.css`
- Create: `client/src/components/ui/SectionHeader.tsx`, `SectionHeader.module.css`
- Modify: `client/src/components/ui/index.ts`
- Test: `client/src/components/layout/PageHeader.test.tsx`, `client/src/components/ui/SectionHeader.test.tsx`

**Interfaces:**
- Produces:
  - `PageHeader({ title: string; subtitle?: ReactNode; eyebrow?: ReactNode; back?: { to: string; label: string }; actions?: ReactNode })`
  - `SectionHeader({ title: ReactNode; description?: ReactNode; aside?: ReactNode; as?: 'h2' | 'h3'; id?: string })`, `id` va sur le titre (pour `aria-labelledby`).
  - `SectionLink({ to: string; children: ReactNode })`
  - `Total({ label?: string; cents: number })`, `label` vaut « Total » par défaut.

- [ ] **Step 1: Écrire les tests**

`client/src/components/layout/PageHeader.test.tsx` :

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { PageHeader } from './PageHeader';

describe('PageHeader', () => {
  it('pose un titre de niveau 1, un surtitre et un sous-titre', () => {
    render(<PageHeader eyebrow="Jeudi 8 octobre" title="Octobre" subtitle="Encore 23 jours ce mois-ci" />, { wrapper: MemoryRouter });
    expect(screen.getByRole('heading', { level: 1, name: 'Octobre' })).toBeInTheDocument();
    expect(screen.getByText('Jeudi 8 octobre')).toBeInTheDocument();
    expect(screen.getByText('Encore 23 jours ce mois-ci')).toBeInTheDocument();
  });

  it('propose un lien retour', () => {
    render(<PageHeader title="Importer un relevé" back={{ to: '/operations', label: 'Opérations' }} />, { wrapper: MemoryRouter });
    expect(screen.getByRole('link', { name: 'Opérations' })).toHaveAttribute('href', '/operations');
  });
});
```

`client/src/components/ui/SectionHeader.test.tsx` :

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { SectionHeader, SectionLink, Total } from './SectionHeader';

describe('SectionHeader', () => {
  it('rend un titre de niveau 2 par défaut, identifiable', () => {
    render(<SectionHeader id="env-title" title="Enveloppes" description="Les plus serrées d’abord." />);
    const heading = screen.getByRole('heading', { level: 2, name: 'Enveloppes' });
    expect(heading).toHaveAttribute('id', 'env-title');
    expect(screen.getByText('Les plus serrées d’abord.')).toBeInTheDocument();
  });

  it('accepte un niveau 3 et un élément à droite', () => {
    render(<SectionHeader as="h3" title="Mouvements" aside={<button type="button">Ajouter</button>} />);
    expect(screen.getByRole('heading', { level: 3, name: 'Mouvements' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ajouter' })).toBeInTheDocument();
  });
});

describe('SectionLink', () => {
  it('est un lien avec une flèche décorative', () => {
    render(<SectionLink to="/budget">Voir les 11</SectionLink>, { wrapper: MemoryRouter });
    const link = screen.getByRole('link', { name: 'Voir les 11' });
    expect(link).toHaveAttribute('href', '/budget');
    expect(link.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('Total', () => {
  it('affiche le libellé et le montant', () => {
    render(<Total cents={365385} />);
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText(/3\s653,85\s€/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Lancer les tests**

Run: `npx vitest run client/src/components/layout/PageHeader.test.tsx client/src/components/ui/SectionHeader.test.tsx`
Expected: FAIL (`SectionHeader` introuvable, `eyebrow` et `back` sans effet).

- [ ] **Step 3: Implémenter**

`client/src/components/layout/PageHeader.tsx` :

```tsx
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import styles from './PageHeader.module.css';

type PageHeaderProps = {
  title: string;
  subtitle?: ReactNode;
  /** Petite ligne au-dessus du titre (la date sur l'accueil). */
  eyebrow?: ReactNode;
  /** Page fille : lien vers la page parente, au-dessus du titre. */
  back?: { to: string; label: string };
  /** Une seule action, en bouton secondaire. */
  actions?: ReactNode;
};

export function PageHeader({ title, subtitle, eyebrow, back, actions }: PageHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.text}>
        {back ? (
          <Link to={back.to} className={styles.back}>
            <ArrowLeft aria-hidden />
            {back.label}
          </Link>
        ) : null}
        {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
        <h1 className={styles.title}>{title}</h1>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  );
}
```

`client/src/components/layout/PageHeader.module.css` (reprend `.page-header` de `global.css:131-152`) :

```css
.header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--s-4);
  flex-wrap: wrap;
}

.text {
  min-width: 0;
}

.back {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  margin-bottom: var(--s-3);
  color: var(--ink-mute);
  font-size: var(--text-sm);
  text-decoration: none;
  transition: color var(--dur) var(--ease-out);
}

.back:hover {
  color: var(--ink);
}

.back svg {
  width: 14px;
  height: 14px;
}

.eyebrow {
  margin-bottom: var(--s-2);
  color: var(--ink-mute);
  font-size: var(--text-sm);
}

.title {
  font-size: var(--text-2xl);
  font-weight: 600;
  letter-spacing: -0.03em;
}

.subtitle {
  margin-top: var(--s-2);
  max-width: 62ch;
  color: var(--ink-mute);
}

.actions {
  display: flex;
  align-items: center;
  gap: var(--s-2);
}

@media (max-width: 767px) {
  .title {
    font-size: var(--text-xl);
  }
}
```

`client/src/components/ui/SectionHeader.tsx` :

```tsx
import { ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Amount } from './Amount';
import styles from './SectionHeader.module.css';

type SectionHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  /** Un seul élément à droite : SectionLink, Total, bouton secondaire sm ou contrôles sm. */
  aside?: ReactNode;
  as?: 'h2' | 'h3';
  /** Posé sur le titre, pour `aria-labelledby` de la section. */
  id?: string;
};

export function SectionHeader({ title, description, aside, as: Heading = 'h2', id }: SectionHeaderProps) {
  return (
    <div className={styles.header}>
      <div className={styles.text}>
        <Heading id={id} className={Heading === 'h2' ? styles.title : styles.titleSmall}>
          {title}
        </Heading>
        {description ? <p className={styles.description}>{description}</p> : null}
      </div>
      {aside ? <div className={styles.aside}>{aside}</div> : null}
    </div>
  );
}

/** Lien « voir tout » d'un en-tête de section. */
export function SectionLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className={styles.link}>
      {children}
      <ArrowRight aria-hidden />
    </Link>
  );
}

/** Total discret à droite d'un titre. */
export function Total({ label = 'Total', cents }: { label?: string; cents: number }) {
  return (
    <span className={styles.total}>
      {label} <Amount cents={cents} tone="neutral" className={styles.totalAmount} />
    </span>
  );
}
```

`client/src/components/ui/SectionHeader.module.css` :

```css
.header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--s-3);
  margin-bottom: var(--s-3);
}

.text {
  min-width: 0;
}

.title {
  font-size: var(--text-lg);
  font-weight: 600;
  letter-spacing: -0.015em;
}

.titleSmall {
  font-size: var(--text-md);
  font-weight: 600;
  letter-spacing: -0.01em;
}

.description {
  margin-top: var(--s-1);
  max-width: 62ch;
  color: var(--ink-mute);
  font-size: var(--text-sm);
}

.aside {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  flex-shrink: 0;
  color: var(--ink-mute);
  font-size: var(--text-sm);
}

.link {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  color: var(--ink-mute);
  text-decoration: none;
  transition: color var(--dur) var(--ease-out);
}

.link:hover {
  color: var(--ink);
}

.link svg {
  width: 14px;
  height: 14px;
}

.total {
  display: inline-flex;
  align-items: baseline;
  gap: var(--s-2);
  color: var(--ink-mute);
  font-size: var(--text-sm);
  white-space: nowrap;
}

.totalAmount {
  color: var(--ink-soft);
  font-weight: 500;
}

@media (max-width: 767px) {
  .header {
    flex-wrap: wrap;
  }
}
```

Dans `index.ts` : `export { SectionHeader, SectionLink, Total } from './SectionHeader';`

- [ ] **Step 4: Lancer les tests**

Run: `npx vitest run client/src/components/layout client/src/components/ui`
Expected: PASS. Les pages qui utilisent déjà PageHeader gardent leur rendu (même CSS, désormais en module).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/layout/PageHeader.tsx client/src/components/layout/PageHeader.module.css client/src/components/layout/PageHeader.test.tsx client/src/components/ui
git commit -m "feat(client): en-tête de page avec surtitre et retour, en-tête de section, lien voir tout et total"
```

---

### Task 4: KeyFigure et StatGroup

**Files:**
- Create: `client/src/components/ui/KeyFigure.tsx`, `KeyFigure.module.css`
- Create: `client/src/components/ui/StatGroup.tsx`, `StatGroup.module.css`
- Modify: `client/src/components/ui/index.ts`
- Test: `client/src/components/ui/KeyFigure.test.tsx`

**Interfaces:**
- Produces:
  - `KeyFigure({ label: string; figure: ReactNode; context?: ReactNode; caption?: ReactNode; children?: ReactNode; aside?: ReactNode; variant?: 'plain' | 'night'; size?: 'md' | 'compact'; decoration?: ReactNode })`
    - `figure` : en général `<Amount size="xl" … />`, ou `<span className={keyFigureValue}>18 %</span>` pour un pourcentage.
    - `children` : barres et détails sous le chiffre.
    - `aside` : `StatGroup direction="column" divided` ou un bouton.
    - `decoration` : couche décorative derrière le contenu (ascii art d'Investir), en variante `night`.
  - `keyFigureValue` : nom de classe exporté pour un chiffre non monétaire au format `Amount xl`.
  - `StatGroup({ direction?: 'row' | 'column'; divided?: boolean; children: ReactNode })` rend un `<dl>`.
  - `Stat({ label: ReactNode; children: ReactNode; emphasis?: boolean })` rend `<div><dt/><dd/></div>`.

- [ ] **Step 1: Écrire les tests**

`client/src/components/ui/KeyFigure.test.tsx` :

```tsx
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Amount } from './Amount';
import { KeyFigure } from './KeyFigure';
import { Stat, StatGroup } from './StatGroup';

describe('KeyFigure', () => {
  it('forme une région nommée par son libellé, avec le chiffre et son contexte', () => {
    render(<KeyFigure label="Dépensé ce mois-ci" figure={<Amount cents={124317} size="xl" tone="neutral" />} context="sur 2 401,00 € prévus" caption="Sous le rythme du mois." />);
    const region = screen.getByRole('region', { name: 'Dépensé ce mois-ci' });
    expect(within(region).getByText(/1\s243,17\s€/)).toBeInTheDocument();
    expect(within(region).getByText('sur 2 401,00 € prévus')).toBeInTheDocument();
    expect(within(region).getByText('Sous le rythme du mois.')).toBeInTheDocument();
  });

  it('place les stats à droite', () => {
    render(
      <KeyFigure
        label="Dépensé ce mois-ci"
        figure="1 243,17 €"
        aside={
          <StatGroup direction="column" divided>
            <Stat label="Marge restante">1 157,83 €</Stat>
          </StatGroup>
        }
      />,
    );
    const list = screen.getByRole('definition');
    expect(list).toHaveTextContent('1 157,83 €');
    expect(screen.getByRole('term')).toHaveTextContent('Marge restante');
  });

  it('cache la décoration aux lecteurs d’écran', () => {
    const { container } = render(<KeyFigure label="Valeur du portefeuille" figure="6 051,12 €" variant="night" decoration={<canvas />} />);
    expect(container.querySelector('canvas')!.parentElement).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('StatGroup', () => {
  it('marque la stat mise en avant', () => {
    render(
      <StatGroup>
        <Stat label="Revenus par mois">2 450,00 €</Stat>
        <Stat label="Reste pour vivre et investir" emphasis>
          865,77 €
        </Stat>
      </StatGroup>,
    );
    expect(screen.getAllByRole('term')).toHaveLength(2);
    expect(screen.getByText('Reste pour vivre et investir').parentElement).toHaveAttribute('data-emphasis', 'true');
  });
});
```

- [ ] **Step 2: Lancer les tests**

Run: `npx vitest run client/src/components/ui/KeyFigure.test.tsx`
Expected: FAIL, modules introuvables.

- [ ] **Step 3: Implémenter**

`KeyFigure.tsx` :

```tsx
import type { ReactNode } from 'react';
import styles from './KeyFigure.module.css';

type KeyFigureProps = {
  label: string;
  figure: ReactNode;
  /** À côté du chiffre, plus petit : « sur 2 401,00 € prévus ». */
  context?: ReactNode;
  /** Phrase sous le chiffre et ses barres. */
  caption?: ReactNode;
  /** Barres et détails entre le chiffre et la légende. */
  children?: ReactNode;
  /** À droite : stats en colonne ou action. */
  aside?: ReactNode;
  /** `night` : le fond sombre d'Investir. */
  variant?: 'plain' | 'night';
  /** `compact` : chiffre en taille lg (réponses de Demander). */
  size?: 'md' | 'compact';
  /** Couche décorative derrière le contenu, en variante `night`. */
  decoration?: ReactNode;
};

/** Le chiffre clé d'un écran : un seul par écran, sans cadre sauf la nuit d'Investir. */
export function KeyFigure({ label, figure, context, caption, children, aside, variant = 'plain', size = 'md', decoration }: KeyFigureProps) {
  return (
    <section aria-label={label} className={[styles.figure, styles[variant], styles[size]].join(' ')}>
      {decoration ? (
        <div className={styles.decoration} aria-hidden="true">
          {decoration}
        </div>
      ) : null}
      <div className={styles.main}>
        <p className={styles.label} aria-hidden="true">
          {label}
        </p>
        <div className={styles.line}>
          {figure}
          {context ? <span className={styles.context}>{context}</span> : null}
        </div>
        {children ? <div className={styles.details}>{children}</div> : null}
        {caption ? <p className={styles.caption}>{caption}</p> : null}
      </div>
      {aside ? <div className={styles.aside}>{aside}</div> : null}
    </section>
  );
}

/** Chiffre non monétaire (pourcentage) au format d'un montant xl. */
export const keyFigureValue = styles.value;
```

`KeyFigure.module.css` :

```css
.figure {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: var(--s-8);
}

.main {
  position: relative;
  min-width: 0;
}

.label {
  margin-bottom: var(--s-3);
  font-size: var(--text-xs);
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-mute);
}

.line {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--s-1) var(--s-3);
}

.context {
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: 500;
  letter-spacing: -0.02em;
  color: var(--ink-mute);
}

.details {
  display: flex;
  flex-direction: column;
  gap: var(--s-4);
  margin-top: var(--s-5);
}

.caption {
  margin-top: var(--s-4);
  max-width: 62ch;
  font-size: var(--text-sm);
  color: var(--ink-soft);
}

.aside {
  position: relative;
}

.value {
  font-family: var(--font-display);
  font-size: var(--text-4xl);
  font-weight: 500;
  line-height: 1;
  letter-spacing: -0.04em;
  font-variant-numeric: tabular-nums;
}

.compact .value,
.compact .line > :first-child {
  font-size: var(--text-xl);
}

.compact .label {
  margin-bottom: var(--s-1);
}

/* La nuit d'Investir : fond sombre, encre claire, quel que soit le mode */
.night {
  overflow: hidden;
  padding: var(--s-8);
  border-radius: var(--radius-lg);
  background: var(--night);
  color: var(--night-ink);
  --ink: var(--night-ink);
  --ink-soft: var(--night-ink-soft);
  --ink-mute: var(--night-ink-mute);
  --positive: var(--night-positive);
  --negative: var(--night-negative);
  --warning: var(--night-warning);
  --rule: color-mix(in oklab, var(--night-ink) 18%, transparent);
}

.decoration {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

@media (max-width: 767px) {
  .figure {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--s-6);
  }

  .value {
    font-size: var(--text-3xl);
  }

  .night {
    padding: var(--s-6);
  }
}
```

`StatGroup.tsx` :

```tsx
import type { ReactNode } from 'react';
import styles from './StatGroup.module.css';

type StatGroupProps = {
  direction?: 'row' | 'column';
  /** En colonne : filet à gauche du groupe, pour le séparer du chiffre clé. */
  divided?: boolean;
  children: ReactNode;
};

export function StatGroup({ direction = 'row', divided = false, children }: StatGroupProps) {
  return <dl className={[styles.group, styles[direction], divided ? styles.divided : ''].join(' ')}>{children}</dl>;
}

/** Un libellé et sa valeur, en général un `Amount size="lg"`. */
export function Stat({ label, children, emphasis = false }: { label: ReactNode; children: ReactNode; emphasis?: boolean }) {
  return (
    <div className={[styles.stat, emphasis ? styles.emphasis : ''].join(' ')} data-emphasis={emphasis || undefined}>
      <dt className={styles.label}>{label}</dt>
      <dd className={styles.value}>{children}</dd>
    </div>
  );
}
```

`StatGroup.module.css` :

```css
.group {
  display: flex;
  margin: 0;
}

.row {
  flex-wrap: wrap;
  gap: var(--s-5) var(--s-8);
}

.column {
  flex-direction: column;
  gap: var(--s-5);
}

.divided {
  padding-left: var(--s-8);
  border-left: 1px solid var(--rule);
}

.stat {
  min-width: 0;
}

.label {
  margin-bottom: var(--s-1);
  font-size: var(--text-sm);
  color: var(--ink-mute);
}

.value {
  margin: 0;
}

/* La stat qui résume les autres */
.emphasis {
  padding-left: var(--s-8);
  border-left: 2px solid var(--marking);
}

@media (max-width: 767px) {
  .divided {
    padding-left: 0;
    padding-top: var(--s-5);
    border-left: none;
    border-top: 1px solid var(--rule);
  }

  .emphasis {
    padding-left: var(--s-4);
  }
}
```

Dans `index.ts` :

```ts
export { KeyFigure, keyFigureValue } from './KeyFigure';
export { Stat, StatGroup } from './StatGroup';
```

- [ ] **Step 4: Lancer les tests**

Run: `npx vitest run client/src/components/ui/KeyFigure.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/ui
git commit -m "feat(client): chiffre clé et groupe de stats partagés"
```

---

### Task 5: ListRow, ListRowSkeleton, ColumnHeader, GroupLabel, EnvelopeTag

**Files:**
- Create: `client/src/components/ui/ListRow.tsx`, `ListRow.module.css`
- Create: `client/src/components/ui/EnvelopeTag.tsx`, `EnvelopeTag.module.css`
- Modify: `client/src/components/ui/Skeleton.tsx` (supprimer `SkeletonRows` à la Task 19, pas maintenant)
- Modify: `client/src/components/ui/index.ts`
- Test: `client/src/components/ui/ListRow.test.tsx`

**Interfaces:**
- Produces:
  - `ListRow({ lead?: ReactNode; title: ReactNode; meta?: ReactNode; middle?: ReactNode; trail?: ReactNode; trailSub?: ReactNode; actions?: ReactNode; compact?: boolean; muted?: boolean; onClick?: () => void; clickLabel?: string; as?: 'li' | 'div'; className?: string })`
    - `as` vaut `'li'` par défaut : à placer dans un `<ul className="ledger">`.
    - `onClick` ajoute un bouton qui couvre la ligne, nommé par `clickLabel` (obligatoire si `onClick`), les `actions` restent cliquables au-dessus.
    - `muted` atténue la fin (opération prévue).
  - `listRowDate` : classe exportée pour la date en début de ligne (`<span className={listRowDate}>7 oct.</span>`).
  - `ListRowSkeleton({ rows?: number; compact?: boolean; meta?: boolean; middle?: boolean; actions?: boolean })`
  - `ColumnHeader({ title: ReactNode; middle?: ReactNode; trail?: ReactNode; actions?: boolean })`, sur la même grille que `ListRow`.
  - `GroupLabel({ as?: 'h2' | 'h3' | 'p'; children: ReactNode })`
  - `EnvelopeTag({ name: string; color: string })`
  - Variables CSS de réglage par le parent : `--list-middle` (largeur du milieu, 34 % par défaut), `--list-trail` (largeur min. de la fin, 110 px par défaut).

- [ ] **Step 1: Écrire les tests**

`client/src/components/ui/ListRow.test.tsx` :

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EnvelopeTag } from './EnvelopeTag';
import { ColumnHeader, GroupLabel, ListRow, ListRowSkeleton } from './ListRow';

describe('ListRow', () => {
  it('rend un élément de liste avec titre, méta et fin', () => {
    render(
      <ul>
        <ListRow title="ACHAT CB SNCF" meta="Compte courant" trail="−11,00 €" trailSub="le 7 oct." />
      </ul>,
    );
    const item = screen.getByRole('listitem');
    expect(item).toHaveTextContent('ACHAT CB SNCF');
    expect(item).toHaveTextContent('Compte courant');
    expect(item).toHaveTextContent('−11,00 €');
    expect(item).toHaveTextContent('le 7 oct.');
  });

  it('ouvre la ligne au clic sans déclencher ses actions', async () => {
    const onClick = vi.fn();
    const onAction = vi.fn();
    render(
      <ul>
        <ListRow title="Courses" onClick={onClick} clickLabel="Voir les dépenses de Courses" actions={<button type="button" onClick={onAction}>Actions</button>} />
      </ul>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Actions' }));
    expect(onAction).toHaveBeenCalledOnce();
    expect(onClick).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Voir les dépenses de Courses' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('peut être un div hors liste', () => {
    render(<ListRow as="div" title="Seule" />);
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    expect(screen.getByText('Seule')).toBeInTheDocument();
  });
});

describe('ListRowSkeleton', () => {
  it('rend le nombre de lignes demandé, caché aux lecteurs d’écran', () => {
    const { container } = render(<ListRowSkeleton rows={3} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(root.children).toHaveLength(3);
  });
});

describe('ColumnHeader', () => {
  it('est décoratif (les lignes portent déjà leurs libellés)', () => {
    const { container } = render(<ColumnHeader title="Enveloppe" middle="Dépensé ce mois / budget" trail="Disponible" actions />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(container).toHaveTextContent('Disponible');
  });
});

describe('GroupLabel', () => {
  it('rend un titre du niveau demandé', () => {
    render(<GroupLabel as="h2">Hier</GroupLabel>);
    expect(screen.getByRole('heading', { level: 2, name: 'Hier' })).toBeInTheDocument();
  });
});

describe('EnvelopeTag', () => {
  it('affiche le nom et un point de couleur décoratif', () => {
    const { container } = render(<EnvelopeTag name="Transports" color="#2f7d5b" />);
    expect(screen.getByText('Transports')).toBeInTheDocument();
    expect(container.querySelector('[aria-hidden]')).toHaveStyle({ background: '#2f7d5b' });
  });
});
```

- [ ] **Step 2: Lancer les tests**

Run: `npx vitest run client/src/components/ui/ListRow.test.tsx`
Expected: FAIL, modules introuvables.

- [ ] **Step 3: Implémenter**

`ListRow.tsx` :

```tsx
import type { ReactNode } from 'react';
import { Skeleton } from './Skeleton';
import styles from './ListRow.module.css';

type ListRowProps = {
  /** Début : date, point, icône. */
  lead?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  /** Milieu facultatif : progression. */
  middle?: ReactNode;
  /** Fin : montant. */
  trail?: ReactNode;
  /** Sous le montant, plus petit. */
  trailSub?: ReactNode;
  /** En général un RowMenu. */
  actions?: ReactNode;
  compact?: boolean;
  /** Opération prévue : la fin est atténuée. */
  muted?: boolean;
  onClick?: () => void;
  clickLabel?: string;
  as?: 'li' | 'div';
  className?: string;
};

/** La ligne de liste de l'app : à placer dans un `<ul className="ledger">`. */
export function ListRow({ lead, title, meta, middle, trail, trailSub, actions, compact = false, muted = false, onClick, clickLabel, as: Tag = 'li', className }: ListRowProps) {
  return (
    <Tag className={[styles.row, compact ? styles.compact : '', muted ? styles.muted : '', onClick ? `hover-row ${styles.clickable}` : '', className ?? ''].join(' ')}>
      {/* Bouton qui couvre toute la ligne ; les actions passent au-dessus. */}
      {onClick ? <button type="button" className={styles.open} onClick={onClick} aria-label={clickLabel} /> : null}
      {lead ? <span className={styles.lead}>{lead}</span> : null}
      <span className={styles.body}>
        <span className={styles.title}>{title}</span>
        {meta ? <span className={styles.meta}>{meta}</span> : null}
      </span>
      {middle ? <span className={styles.middle}>{middle}</span> : null}
      {trail !== undefined || trailSub ? (
        <span className={styles.trail}>
          {trail}
          {trailSub ? <span className={styles.trailSub}>{trailSub}</span> : null}
        </span>
      ) : null}
      {actions ? <span className={styles.actions}>{actions}</span> : null}
    </Tag>
  );
}

/** Date en début de ligne, en colonne alignée. */
export const listRowDate = styles.date;

type ListRowSkeletonProps = { rows?: number; compact?: boolean; meta?: boolean; middle?: boolean; actions?: boolean };

/** Chargement d'une liste : mêmes hauteurs que les vraies lignes, la page ne saute pas. */
export function ListRowSkeleton({ rows = 4, compact = false, meta = !compact, middle = false, actions = false }: ListRowSkeletonProps) {
  return (
    <div className="ledger" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={[styles.row, compact ? styles.compact : ''].join(' ')}>
          <span className={styles.body}>
            <Skeleton width={`${38 + ((i * 17) % 28)}%`} height={14} />
            {meta ? <Skeleton width={`${16 + ((i * 7) % 12)}%`} height={10} /> : null}
          </span>
          {middle ? (
            <span className={styles.middle}>
              <Skeleton height={6} />
            </span>
          ) : null}
          <span className={styles.trail}>
            <Skeleton width={64 + ((i * 11) % 24)} height={14} />
          </span>
          {actions ? <span className={styles.actions} /> : null}
        </div>
      ))}
    </div>
  );
}

type ColumnHeaderProps = { title: ReactNode; middle?: ReactNode; trail?: ReactNode; actions?: boolean };

/** Intitulés de colonnes, sur la même grille que les lignes. */
export function ColumnHeader({ title, middle, trail, actions = false }: ColumnHeaderProps) {
  return (
    <div className={[styles.row, styles.header].join(' ')} aria-hidden="true">
      <span className={styles.body}>{title}</span>
      {middle ? <span className={[styles.middle, styles.headerEnd].join(' ')}>{middle}</span> : null}
      {trail ? <span className={styles.trail}>{trail}</span> : null}
      {actions ? <span className={styles.actions} /> : null}
    </div>
  );
}

/** Libellé au-dessus d'un groupe de lignes (un jour, une catégorie). */
export function GroupLabel({ as: Tag = 'h3', children }: { as?: 'h2' | 'h3' | 'p'; children: ReactNode }) {
  return <Tag className={styles.group}>{children}</Tag>;
}
```

`ListRow.module.css` :

```css
.row {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--s-4);
  min-height: var(--row-h);
  padding: var(--s-2) 0;
  list-style: none;
}

.compact {
  min-height: var(--row-h-compact);
  padding: var(--s-1) 0;
}

.open {
  position: absolute;
  inset: 0;
  z-index: 0;
  padding: 0;
  border: none;
  border-radius: var(--radius-md);
  background: none;
  cursor: pointer;
}

.open:focus-visible {
  outline-offset: -2px;
}

.lead {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: var(--s-2);
  color: var(--ink-mute);
}

.date {
  width: 64px;
  font-size: var(--text-sm);
  font-variant-numeric: tabular-nums;
  color: var(--ink-mute);
}

.body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--s-half);
}

.title {
  overflow: hidden;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.compact .title {
  font-weight: 400;
}

.meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--s-1) var(--s-2);
  font-size: var(--text-xs);
  color: var(--ink-mute);
}

.middle {
  flex: 0 0 var(--list-middle, 34%);
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--s-4);
}

.trail {
  flex-shrink: 0;
  min-width: var(--list-trail, 110px);
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--s-half);
  text-align: right;
}

.trailSub {
  font-size: var(--text-xs);
  color: var(--ink-mute);
}

.muted .trail {
  opacity: 0.55;
}

.actions {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--s-1);
  min-width: 38px;
}

.header {
  min-height: 0;
  padding: 0 0 var(--s-2);
  font-size: var(--text-xs);
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-mute);
}

.headerEnd {
  justify-content: flex-end;
}

.group {
  padding: var(--s-6) 0 var(--s-2);
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-mute);
}

.group:first-child {
  padding-top: 0;
}

/* Sur mobile, la progression passe sous le titre et le montant */
@media (max-width: 767px) {
  .row:has(.middle) {
    flex-wrap: wrap;
    row-gap: var(--s-2);
  }

  .middle {
    order: 10;
    flex-basis: 100%;
  }

  .header .middle {
    display: none;
  }
}
```

`EnvelopeTag.tsx` :

```tsx
import styles from './EnvelopeTag.module.css';

/** L'enveloppe d'une ligne : pastille grise et point de couleur. */
export function EnvelopeTag({ name, color }: { name: string; color: string }) {
  return (
    <span className={styles.tag}>
      <span className={styles.dot} style={{ background: color }} aria-hidden />
      {name}
    </span>
  );
}
```

`EnvelopeTag.module.css` :

```css
.tag {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  height: 20px;
  padding: 0 var(--s-2);
  border-radius: var(--radius-pill);
  background: var(--paper-sunken);
  color: var(--ink-soft);
  font-size: var(--text-xs);
  font-weight: 500;
  white-space: nowrap;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
```

Dans `index.ts` :

```ts
export { EnvelopeTag } from './EnvelopeTag';
export { ColumnHeader, GroupLabel, ListRow, ListRowSkeleton, listRowDate } from './ListRow';
```

- [ ] **Step 4: Lancer les tests**

Run: `npx vitest run client/src/components/ui/ListRow.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/ui
git commit -m "feat(client): ligne de liste, squelette, en-têtes de colonnes, libellé de groupe et pastille d'enveloppe"
```

---

### Task 6: RowMenu

**Files:**
- Create: `client/src/components/ui/RowMenu.tsx`, `RowMenu.module.css`
- Modify: `client/src/components/ui/index.ts`
- Test: `client/src/components/ui/RowMenu.test.tsx`

**Interfaces:**
- Consumes: `Button` (Task 2).
- Produces:
  - `RowMenu({ label: string; items: RowMenuItem[] })`, où `label` est le nom accessible du bouton et du menu (« Actions pour Courses »).
  - `type RowMenuItem = { label: string; icon?: ReactNode; onSelect: () => void; danger?: boolean; disabled?: boolean }`
  - Les éléments `danger` sont rendus en dernier, après un séparateur.

- [ ] **Step 1: Écrire les tests**

`client/src/components/ui/RowMenu.test.tsx` :

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RowMenu } from './RowMenu';

function setup() {
  const edit = vi.fn();
  const archive = vi.fn();
  render(
    <RowMenu
      label="Actions pour Courses"
      items={[
        { label: 'Archiver', onSelect: archive, danger: true },
        { label: 'Modifier', onSelect: edit },
        { label: 'Déplacer vers…', onSelect: vi.fn(), disabled: true },
      ]}
    />,
  );
  return { edit, archive };
}

describe('RowMenu', () => {
  it('ouvre un menu nommé depuis un bouton', async () => {
    setup();
    const trigger = screen.getByRole('button', { name: 'Actions pour Courses' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu', { name: 'Actions pour Courses' })).toBeVisible();
  });

  it('range les actions destructrices en dernier, après un séparateur', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Actions pour Courses' }));
    const items = screen.getAllByRole('menuitem').map((i) => i.textContent);
    expect(items).toEqual(['Modifier', 'Déplacer vers…', 'Archiver']);
    expect(screen.getByRole('separator')).toBeInTheDocument();
  });

  it('se pilote au clavier et ferme après le choix', async () => {
    const { edit } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Actions pour Courses' }));
    expect(screen.getByRole('menuitem', { name: 'Modifier' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    // L'élément désactivé est sauté.
    expect(screen.getByRole('menuitem', { name: 'Archiver' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Modifier' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(edit).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Actions pour Courses' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('se ferme avec Échap et rend le focus au bouton', async () => {
    setup();
    const trigger = screen.getByRole('button', { name: 'Actions pour Courses' });
    await userEvent.click(trigger);
    await userEvent.keyboard('{Escape}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });
});
```

- [ ] **Step 2: Lancer les tests**

Run: `npx vitest run client/src/components/ui/RowMenu.test.tsx`
Expected: FAIL, module introuvable.

- [ ] **Step 3: Implémenter**

`RowMenu.tsx` :

```tsx
import { MoreHorizontal } from 'lucide-react';
import { useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type ToggleEvent } from 'react';
import { Button } from './Button';
import styles from './RowMenu.module.css';

export type RowMenuItem = { label: string; icon?: ReactNode; onSelect: () => void; danger?: boolean; disabled?: boolean };

function anchor(name: string, property: 'anchorName' | 'positionAnchor'): CSSProperties {
  return { [property]: name } as unknown as CSSProperties;
}

/** Le seul bouton d'action d'une ligne : un menu en popover natif, piloté aux flèches. */
export function RowMenu({ label, items }: { label: string; items: RowMenuItem[] }) {
  const reactId = useId();
  const id = `menu-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const regular = items.filter((i) => !i.danger);
  const danger = items.filter((i) => i.danger);

  const enabledItems = () => Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const list = enabledItems();
    if (list.length === 0) return;
    const index = list.indexOf(document.activeElement as HTMLButtonElement);
    const focus = (i: number) => list[(i + list.length) % list.length]?.focus();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focus(index + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focus(index - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focus(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focus(list.length - 1);
    }
  }

  function onToggle(e: ToggleEvent<HTMLDivElement>) {
    const isOpen = e.newState === 'open';
    setOpen(isOpen);
    if (isOpen) {
      enabledItems()[0]?.focus();
      return;
    }
    // Le focus revient au bouton, sauf si le choix l'a déjà emmené ailleurs (un dialogue).
    const active = document.activeElement;
    if (!active || active === document.body || menuRef.current?.contains(active)) triggerRef.current?.focus();
  }

  function select(item: RowMenuItem) {
    menuRef.current?.hidePopover();
    item.onSelect();
  }

  const renderItem = (item: RowMenuItem) => (
    <button key={item.label} type="button" role="menuitem" className={[styles.item, item.danger ? styles.danger : ''].join(' ')} disabled={item.disabled} onClick={() => select(item)}>
      {item.icon ? (
        <span className={styles.icon} aria-hidden>
          {item.icon}
        </span>
      ) : null}
      {item.label}
    </button>
  );

  return (
    <>
      <Button
        ref={triggerRef}
        variant="ghost"
        icon={<MoreHorizontal />}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        popoverTarget={id}
        className={open ? styles.triggerOpen : undefined}
        style={anchor(`--${id}`, 'anchorName')}
      />
      <div ref={menuRef} id={id} popover="auto" role="menu" aria-label={label} className={styles.menu} style={anchor(`--${id}`, 'positionAnchor')} onKeyDown={onKeyDown} onToggle={onToggle}>
        {regular.map(renderItem)}
        {regular.length > 0 && danger.length > 0 ? <div role="separator" className={styles.separator} /> : null}
        {danger.map(renderItem)}
      </div>
    </>
  );
}
```

`RowMenu.module.css` :

```css
/* Menu placé sous son bouton, aligné à droite (au-dessus s'il manque de place) */
.menu {
  inset: auto;
  top: anchor(bottom);
  right: anchor(right);
  margin: var(--s-1) 0;
  position-try-fallbacks: flip-block;
  min-width: 200px;
  padding: var(--s-1);
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  background: var(--paper-raised);
  color: var(--ink);
  box-shadow: var(--shadow-pop);
}

.item {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  width: 100%;
  height: 36px;
  padding: 0 var(--s-3);
  border: none;
  border-radius: var(--radius-sm);
  background: none;
  font-size: var(--text-sm);
  text-align: left;
  white-space: nowrap;
}

.item:hover:not(:disabled),
.item:focus-visible {
  background: var(--paper-sunken);
  outline: none;
}

.item:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.danger {
  color: var(--negative);
}

.danger:hover:not(:disabled),
.danger:focus-visible {
  background: var(--negative-soft);
}

.icon {
  display: inline-flex;
  width: 16px;
  height: 16px;
  color: var(--ink-mute);
}

.danger .icon {
  color: inherit;
}

.icon :global(svg) {
  width: 16px;
  height: 16px;
}

.separator {
  height: 1px;
  margin: var(--s-1) 0;
  background: var(--rule);
}

.triggerOpen {
  background: var(--paper-sunken);
  color: var(--ink);
}
```

Dans `index.ts` : `export { RowMenu, type RowMenuItem } from './RowMenu';`

- [ ] **Step 4: Lancer les tests**

Run: `npx vitest run client/src/components/ui/RowMenu.test.tsx`
Expected: PASS. Si `Enter` sur un `menuitem` n'appelle pas `onClick` dans jsdom, c'est que le focus n'est pas sur le bouton : vérifier que `onToggle` est bien appelé par le polyfill de `test-setup.ts` (événement `toggle` avec `newState`).

- [ ] **Step 5: Vérifier dans le navigateur**

Monter temporairement un `RowMenu` n'est pas nécessaire : la vérification visuelle se fait à la Task 11 (Budget).

- [ ] **Step 6: Commit**

```bash
git add client/src/components/ui
git commit -m "feat(client): menu d'actions de ligne en popover natif, piloté au clavier"
```

---

### Task 7: Notice, TodoItem, FieldError, ErrorState, Disclosure

**Files:**
- Create: `client/src/components/ui/Notice.tsx`, `Notice.module.css`
- Create: `client/src/components/ui/TodoItem.tsx`, `TodoItem.module.css`
- Create: `client/src/components/ui/FieldError.tsx`, `FieldError.module.css`
- Create: `client/src/components/ui/ErrorState.tsx`
- Modify: `client/src/components/ui/EmptyState.tsx`, `EmptyState.module.css` (ton négatif)
- Create: `client/src/components/ui/Disclosure.tsx`, `Disclosure.module.css`
- Modify: `client/src/components/ui/ConfirmDialog.tsx`, `ConfirmDialog.module.css` (utilise FieldError)
- Modify: `client/src/components/ui/index.ts`
- Test: `client/src/components/ui/Messages.test.tsx`

**Interfaces:**
- Produces:
  - `Notice({ tone?: 'marking' | 'negative' | 'warning' | 'neutral'; icon?: ReactNode; children: ReactNode; action?: ReactNode; label?: string })`
    - `negative` : `role="alert"`.
    - Les autres tons : `role="group"` si `label` est fourni, sinon pas de rôle.
    - Les tons `negative` et `warning` affichent `AlertCircle` par défaut, `icon={null}` le retire.
  - `TodoItem({ to: string; icon: ReactNode; tone?: 'marking' | 'negative'; children: ReactNode })` rend un `<Link>`.
  - `FieldError({ children?: ReactNode })` ne rend rien si `children` est vide, sinon `<p role="alert">`.
  - `ErrorState({ title: string; description?: string; onRetry?: () => void })`
  - `EmptyState` accepte `tone?: 'neutral' | 'negative'`.
  - `Disclosure({ label: string; openLabel?: string; count?: number; defaultOpen?: boolean; children: ReactNode })`
    - Bouton texte avec chevron, `aria-expanded`, `aria-controls`.
    - Le libellé affiché vaut `label` fermé et `openLabel ?? label` ouvert, suivi de ` (count)` si `count` est fourni.

- [ ] **Step 1: Écrire les tests**

`client/src/components/ui/Messages.test.tsx` :

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Inbox } from 'lucide-react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { Disclosure } from './Disclosure';
import { ErrorState } from './ErrorState';
import { FieldError } from './FieldError';
import { Notice } from './Notice';
import { TodoItem } from './TodoItem';

describe('Notice', () => {
  it('annonce les erreurs immédiatement', () => {
    render(<Notice tone="negative">La synchronisation a échoué.</Notice>);
    expect(screen.getByRole('alert')).toHaveTextContent('La synchronisation a échoué.');
  });

  it('forme un groupe nommé avec son action', () => {
    render(
      <Notice tone="marking" label="Créer une règle de tri" action={<button type="button">Créer la règle</button>}>
        Toujours « Courses » ?
      </Notice>,
    );
    const group = screen.getByRole('group', { name: 'Créer une règle de tri' });
    expect(group).toHaveTextContent('Toujours « Courses » ?');
    expect(screen.getByRole('button', { name: 'Créer la règle' })).toBeInTheDocument();
  });
});

describe('TodoItem', () => {
  it('est un lien vers la tâche', () => {
    render(
      <TodoItem to="/operations?vue=a-ranger" icon={<Inbox />}>
        10 opérations à ranger
      </TodoItem>,
      { wrapper: MemoryRouter },
    );
    expect(screen.getByRole('link', { name: '10 opérations à ranger' })).toHaveAttribute('href', '/operations?vue=a-ranger');
  });
});

describe('FieldError', () => {
  it('ne rend rien sans message', () => {
    const { container } = render(<FieldError>{null}</FieldError>);
    expect(container).toBeEmptyDOMElement();
  });

  it('annonce le message', () => {
    render(<FieldError>Le montant doit être supérieur à zéro.</FieldError>);
    expect(screen.getByRole('alert')).toHaveTextContent('Le montant doit être supérieur à zéro.');
  });
});

describe('ErrorState', () => {
  it('propose de réessayer', async () => {
    const onRetry = vi.fn();
    render(<ErrorState title="Impossible de charger le budget" description="Le serveur ne répond pas." onRetry={onRetry} />);
    expect(screen.getByRole('heading', { name: 'Impossible de charger le budget' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe('Disclosure', () => {
  it('replie et déplie son contenu', async () => {
    render(
      <Disclosure label="Afficher les enveloppes archivées" openLabel="Masquer les enveloppes archivées" count={2}>
        <p>Vacances</p>
      </Disclosure>,
    );
    const button = screen.getByRole('button', { name: 'Afficher les enveloppes archivées (2)' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Vacances')).not.toBeInTheDocument();
    await userEvent.click(button);
    expect(screen.getByRole('button', { name: 'Masquer les enveloppes archivées (2)' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Vacances')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Lancer les tests**

Run: `npx vitest run client/src/components/ui/Messages.test.tsx`
Expected: FAIL, modules introuvables.

- [ ] **Step 3: Implémenter**

`Notice.tsx` :

```tsx
import { AlertCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import styles from './Notice.module.css';

type NoticeProps = {
  tone?: 'marking' | 'negative' | 'warning' | 'neutral';
  /** `null` retire l'icône par défaut des tons négatif et attention. */
  icon?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  /** Nom du groupe (bandeau avec actions). */
  label?: string;
};

/** Le seul bandeau de l'app : proposition, erreur, mise en garde ou note. */
export function Notice({ tone = 'neutral', icon, children, action, label }: NoticeProps) {
  const shownIcon = icon === undefined ? (tone === 'negative' || tone === 'warning' ? <AlertCircle /> : null) : icon;
  const role = tone === 'negative' ? 'alert' : label ? 'group' : undefined;
  return (
    <div className={[styles.notice, styles[tone]].join(' ')} role={role} aria-label={role === 'group' ? label : undefined}>
      {shownIcon ? (
        <span className={styles.icon} aria-hidden>
          {shownIcon}
        </span>
      ) : null}
      <div className={styles.text}>{children}</div>
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
```

`Notice.module.css` :

```css
.notice {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--s-2) var(--s-3);
  padding: var(--s-3) var(--s-4);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  color: var(--ink);
  animation: open var(--dur-slow) var(--ease-out);
}

.marking {
  background: var(--marking-soft);
}

.negative {
  background: var(--negative-soft);
}

.warning {
  background: var(--warning-soft);
}

.neutral {
  background: var(--paper-sunken);
}

.icon {
  display: inline-flex;
  flex-shrink: 0;
  width: 16px;
  height: 16px;
}

.icon :global(svg) {
  width: 16px;
  height: 16px;
}

.marking .icon {
  color: var(--marking-ink);
}

.negative .icon {
  color: var(--negative);
}

.warning .icon {
  color: var(--warning);
}

.neutral .icon {
  color: var(--ink-soft);
}

.text {
  flex: 1;
  min-width: 0;
}

.action {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  margin-left: auto;
}

@keyframes open {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
}
```

`TodoItem.tsx` :

```tsx
import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import styles from './TodoItem.module.css';

type TodoItemProps = { to: string; icon: ReactNode; tone?: 'marking' | 'negative'; children: ReactNode };

/** Une tâche de « À faire » : barre jaune, ou rouge si c'est une alerte. */
export function TodoItem({ to, icon, tone = 'marking', children }: TodoItemProps) {
  return (
    <Link to={to} className={[styles.todo, styles[tone]].join(' ')}>
      <span className={styles.icon} aria-hidden>
        {icon}
      </span>
      <span className={styles.text}>{children}</span>
      <ChevronRight className={styles.chevron} aria-hidden />
    </Link>
  );
}
```

`TodoItem.module.css` (repris de `pages/Home.module.css:144-205`) :

```css
.todo {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--s-3);
  min-height: 52px;
  padding: var(--s-3) var(--s-4) var(--s-3) var(--s-5);
  border-radius: var(--radius-md);
  background: var(--paper-sunken);
  color: inherit;
  text-decoration: none;
  overflow: hidden;
  transition: background var(--dur) var(--ease-out);
}

/* La barre de gauche : jaune pour une tâche, rouge pour une alerte */
.todo::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--marking);
}

.negative::before {
  background: var(--negative);
}

.todo:hover {
  background: color-mix(in oklab, var(--paper-sunken) 70%, var(--rule));
}

.icon {
  display: flex;
  color: var(--ink-soft);
}

.icon :global(svg) {
  width: 18px;
  height: 18px;
  stroke-width: 1.75;
}

.negative .icon {
  color: var(--negative);
}

.text {
  flex: 1;
  font-weight: 500;
}

.chevron {
  width: 18px;
  height: 18px;
  color: var(--ink-mute);
  transition: transform var(--dur) var(--ease-out);
}

.todo:hover .chevron {
  transform: translateX(2px);
}
```

Avant de recopier, lire la fin de `.todoChevron` dans `Home.module.css` (après la ligne 205) et reprendre son effet de survol exact s'il diffère de `translateX(2px)`.
`.todoDetail` reste dans `Home.module.css` : c'est un détail de texte propre à l'Accueil.

`FieldError.tsx` :

```tsx
import type { ReactNode } from 'react';
import styles from './FieldError.module.css';

/** Erreur d'un formulaire ou d'un dialogue, lue dès qu'elle apparaît. */
export function FieldError({ children }: { children?: ReactNode }) {
  if (children === null || children === undefined || children === false || children === '') return null;
  return (
    <p className={styles.error} role="alert">
      {children}
    </p>
  );
}
```

`FieldError.module.css` :

```css
.error {
  color: var(--negative);
  font-size: var(--text-sm);
}
```

`EmptyState.tsx` : ajouter la prop `tone?: 'neutral' | 'negative'` (défaut `'neutral'`) et appliquer `styles.negative` à la racine quand `tone === 'negative'`. Dans `EmptyState.module.css`, ajouter :

```css
.negative .icon {
  background: var(--negative-soft);
  color: var(--negative);
}
```

`ErrorState.tsx` :

```tsx
import { AlertCircle } from 'lucide-react';
import { Button } from './Button';
import { EmptyState } from './EmptyState';

type ErrorStateProps = { title: string; description?: string; onRetry?: () => void };

/** Échec de chargement d'une page ou d'une section : partout le même message et « Réessayer ». */
export function ErrorState({ title, description, onRetry }: ErrorStateProps) {
  return (
    <EmptyState
      tone="negative"
      icon={<AlertCircle />}
      title={title}
      description={description}
      action={
        onRetry ? (
          <Button size="sm" onClick={onRetry}>
            Réessayer
          </Button>
        ) : undefined
      }
    />
  );
}
```

`Disclosure.tsx` :

```tsx
import { ChevronDown } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { Button } from './Button';
import styles from './Disclosure.module.css';

type DisclosureProps = { label: string; openLabel?: string; count?: number; defaultOpen?: boolean; children: ReactNode };

/** Liste repliable : éléments archivés, idées closes, détails d'un import. */
export function Disclosure({ label, openLabel, count, defaultOpen = false, children }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const text = `${open ? (openLabel ?? label) : label}${count !== undefined ? ` (${count})` : ''}`;
  return (
    <div className={styles.disclosure}>
      <Button variant="text" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        {text}
        <ChevronDown aria-hidden className={[styles.chevron, open ? styles.open : ''].join(' ')} />
      </Button>
      {open ? (
        <div id={id} className={styles.content}>
          {children}
        </div>
      ) : null}
    </div>
  );
}
```

`Disclosure.module.css` :

```css
.disclosure {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--s-3);
}

.chevron {
  width: 14px;
  height: 14px;
  transition: transform var(--dur) var(--ease-out);
}

.open {
  transform: rotate(180deg);
}

.content {
  align-self: stretch;
}
```

`ConfirmDialog.tsx` : remplacer le `<p className={styles.error} role="alert">` par `<FieldError>{error}</FieldError>` et supprimer `.error` de `ConfirmDialog.module.css`.

Dans `index.ts` :

```ts
export { Disclosure } from './Disclosure';
export { ErrorState } from './ErrorState';
export { FieldError } from './FieldError';
export { Notice } from './Notice';
export { TodoItem } from './TodoItem';
```

- [ ] **Step 4: Lancer les tests**

Run: `npx vitest run client/src/components/ui`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/ui
git commit -m "feat(client): bandeau, tâche à faire, erreur de formulaire, état d'erreur et liste repliable partagés"
```

---

### Task 8: Segmented avec icônes et Range

**Files:**
- Modify: `client/src/components/ui/Segmented.tsx`, `Segmented.module.css`
- Create: `client/src/components/ui/Range.tsx`, `Range.module.css`
- Modify: `client/src/components/ui/index.ts`
- Test: `client/src/components/ui/Segmented.test.tsx` (nouveau)

**Interfaces:**
- Produces:
  - `Segmented` : les options acceptent `icon?: ReactNode` (`type Option<T> = { value: T; label: string; icon?: ReactNode }`).
  - `Range(props: InputHTMLAttributes<HTMLInputElement>)` rend un `<input type="range">` stylé.

- [ ] **Step 1: Écrire le test**

`client/src/components/ui/Segmented.test.tsx` :

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ArrowDownLeft } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { Range } from './Range';
import { Segmented } from './Segmented';

describe('Segmented', () => {
  it('affiche une icône décorative à côté du libellé', async () => {
    const onChange = vi.fn();
    render(
      <Segmented
        label="Type"
        value="expense"
        onChange={onChange}
        options={[
          { value: 'expense', label: 'Dépense' },
          { value: 'income', label: 'Revenu', icon: <ArrowDownLeft /> },
        ]}
      />,
    );
    const income = screen.getByRole('radio', { name: 'Revenu' });
    expect(income.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    await userEvent.click(income);
    expect(onChange).toHaveBeenCalledWith('income');
  });
});

describe('Range', () => {
  it('est un curseur', () => {
    render(<Range aria-label="Horizon" min={30} max={365} defaultValue={90} />);
    expect(screen.getByRole('slider', { name: 'Horizon' })).toHaveValue('90');
  });
});
```

- [ ] **Step 2: Lancer le test**

Run: `npx vitest run client/src/components/ui/Segmented.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implémenter**

Dans `Segmented.tsx`, typer `Option<T> = { value: T; label: string; icon?: ReactNode }` (importer `ReactNode`) et rendre :

```tsx
{o.icon ? (
  <span className={styles.icon} aria-hidden="true">
    {o.icon}
  </span>
) : null}
{o.label}
```

Comme lucide pose déjà `aria-hidden="true"` sur ses svg, le test vérifie le svg ; garder le `span` pour la taille.
Dans `Segmented.module.css`, ajouter à `.option` : `display: inline-flex; align-items: center; gap: var(--s-2);` et :

```css
.icon {
  display: inline-flex;
  width: 14px;
  height: 14px;
}

.icon :global(svg) {
  width: 14px;
  height: 14px;
}
```

`Range.tsx` :

```tsx
import type { InputHTMLAttributes } from 'react';
import styles from './Range.module.css';

export function Range({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="range" className={[styles.range, className ?? ''].join(' ')} {...rest} />;
}
```

`Range.module.css` :

```css
.range {
  width: 100%;
  accent-color: var(--ink);
  cursor: pointer;
}
```

Dans `index.ts` : `export { Range } from './Range';`

- [ ] **Step 4: Lancer les tests**

Run: `npx vitest run client/src/components/ui`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/ui
git commit -m "feat(client): icônes dans le Segmented et curseur partagé"
```

---

## Phase 2 : migration des écrans

Règles communes à toutes les tâches de cette phase :

- Remplacer, pas ajouter : quand un composant métier passe sur une primitive, supprimer son CSS devenu inutile dans le même commit.
- Les textes d'interface ne changent pas, sauf mention explicite.
- Les tests existants du composant migré doivent passer ; s'ils testent un comportement qui change volontairement (RowMenu au lieu d'icônes, ConfirmDialog au lieu de `window.confirm`), les adapter dans le même commit, en gardant la même intention.
- Vérification visuelle à la fin de chaque tâche, dans l'app de recette (`http://localhost:5180`), avec Chrome DevTools MCP :
  - à 1440×900 et 390×844, en clair et en sombre ;
  - comparer aux captures de `tmp/e2e/avant` et au rendu de référence du design system ;
  - corriger tout défaut visible avant de commiter (alignement, débordement, écart incohérent), même s'il ne vient pas de la tâche ;
  - enregistrer les captures d'après dans `tmp/e2e/apres/`.
- Après chaque tâche : `npm run typecheck && npm run lint && npm test`.

### Task 9: Barre latérale, Shell, barre du bas

**Files:**
- Modify: `client/src/components/layout/SideNav.tsx`, `SideNav.module.css`
- Modify: `client/src/components/layout/Shell.tsx`, `Shell.module.css`
- Modify: `client/src/components/layout/BottomNav.module.css`

**Interfaces:**
- Consumes: `Button`, `Kbd`, `CountBadge`, `BrandMark` (Task 2).

- [ ] **Step 1: SideNav**

Dans `SideNav.tsx` :
- le logo `.brandMark` devient `<BrandMark />` ;
- les boutons « Nouvelle opération » (`.newButton`, ligne 44) et « Demander » (`.askButton`, ligne 50) deviennent `<Button variant="secondary" icon={<Plus />} className={styles.navAction} …>` et `<Button variant="ghost" icon={<Sparkles />} className={styles.navAction} …>`, avec gardés : `onClick`, `aria-keyshortcuts`, et un `<Kbd>N</Kbd>` / `<Kbd>K</Kbd>` en fin de libellé, poussé à droite (garder l'icône actuelle de chaque bouton) ;
- le compteur jaune de « Opérations » devient `<CountBadge count={…} label={…} />`, avec la même valeur et le même libellé accessible qu'aujourd'hui.

Dans `SideNav.module.css` :
- supprimer `.brandMark`, `.newButton`, `.askButton`, `.kbd` et le compteur (lignes 24-32, 41-118, 184-198) ;
- ajouter :

```css
.navAction {
  width: 100%;
  justify-content: flex-start;
}

.navAction > :last-child {
  margin-left: auto;
}
```

Remplacer les valeurs en dur restantes : rayons en px (`165`, etc.) par `var(--radius-sm)` ou `var(--radius-md)`, `padding: 0 6px` et `margin: … 6px` (lignes 187, 203) par `var(--s-1)` ou `var(--s-2)`, `0.6875rem` par `var(--text-2xs)`.

- [ ] **Step 2: Shell et barre du bas**

Dans `Shell.tsx` : le logo mobile devient `<BrandMark size={20} />`, le bouton réglages `.settings` (ligne 33) devient `<ButtonLink to="/reglages" variant="ghost" icon={<Settings />} aria-label="Réglages" />` (garder la destination et le nom actuels ; si c'est un bouton et non un lien, utiliser `Button variant="ghost"` avec le même `onClick`).
Dans `Shell.module.css` : supprimer `.brandMark` et `.settings` (lignes 59-94).
Dans `BottomNav.module.css` : `0.6875rem` en `var(--text-2xs)`, le rayon en px en `var(--radius-sm)`, l'espacement en px vers le token le plus proche.

- [ ] **Step 3: Vérifier et commiter**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS.
Vérification visuelle : barre latérale à 1440 px (les deux boutons font maintenant 38 px de haut, alignés, raccourcis à droite) et barre du bas à 390 px.

```bash
git add client/src/components/layout
git commit -m "refactor(client): barre latérale et shell sur les boutons, touches, compteur et logo partagés"
```

---

### Task 10: Accueil

**Files:**
- Modify: `client/src/pages/Home.tsx`, `Home.module.css`
- Modify: `client/src/components/budget/EnvelopeRow.tsx` (seulement si nécessaire pour l'Accueil, sinon Task 11)

**Interfaces:**
- Consumes: `PageHeader`, `KeyFigure`, `StatGroup`, `Stat`, `SectionHeader`, `SectionLink`, `Total`, `TodoItem`, `ErrorState`, `ListRowSkeleton`, `Badge`, `EmptyState`.

- [ ] **Step 1: En-tête**

Remplacer le `<header className={styles.header}>` (lignes 61-65) par :

```tsx
<PageHeader eyebrow={longDay(data.today)} title={monthName(data.today)} subtitle={daysLeft === 0 ? 'Dernier jour du mois' : `Encore ${plural(daysLeft, 'jour')} ce mois-ci`} />
```

- [ ] **Step 2: Chiffre clé**

Réécrire `MonthHero` avec `KeyFigure` sans carte :

```tsx
function MonthHero({ data }: { data: Overview }) {
  const { spent, budget, saved, variable } = data.month;
  const progress = monthProgress(data.today, data.month.end);
  const margin = budget - spent;
  // Le rythme ne vaut que pour les dépenses courantes : le loyer tombe en début de mois, pas au fil des jours.
  const pace = Math.round(variable.budget * progress) - variable.spent;

  return (
    <KeyFigure
      label="Dépensé ce mois-ci"
      figure={<Amount cents={spent} size="xl" tone="neutral" animate />}
      context={budget > 0 ? `sur ${formatEuros(budget)} prévus` : undefined}
      caption={
        budget > 0 ? (
          variable.budget > 0 ? (
            <>
              <strong className={['num', pace < 0 ? styles.paceOver : styles.paceUnder].join(' ')}>{formatEuros(Math.abs(pace))}</strong> {pace >= 0 ? 'sous le' : 'au-dessus du'} rythme du mois pour les dépenses courantes. Le trait marque aujourd’hui.
            </>
          ) : undefined
        ) : (
          <>
            Aucun budget mensuel pour l’instant. <Link to="/budget">Fixe un budget à tes enveloppes</Link> pour suivre ton rythme.
          </>
        )
      }
      aside={
        <StatGroup direction="column" divided>
          {budget > 0 ? (
            <Stat label={margin >= 0 ? 'Marge restante' : 'Budget dépassé de'}>
              <Amount cents={Math.abs(margin)} size="lg" tone="neutral" className={margin < 0 ? styles.negative : ''} animate />
            </Stat>
          ) : null}
          <Stat label="Mis de côté">
            <Amount cents={saved} size="lg" tone="neutral" className={saved > 0 ? styles.positive : saved < 0 ? styles.negative : ''} animate />
          </Stat>
        </StatGroup>
      }
    >
      {budget > 0 ? (
        <>
          <ProgressBar ratio={spent / budget} size="md" color="var(--ink)" label={`${formatEuros(spent)} dépensés sur un budget de ${formatEuros(budget)}`} />
          {variable.budget > 0 ? (
            <div className={styles.variable}>
              <div className={styles.variableHead}>
                <span>
                  Dépenses courantes <span className={styles.muted}>hors charges fixes</span>
                </span>
                <span className="num">
                  {formatEuros(variable.spent)} <span className={styles.muted}>/ {formatEuros(variable.budget)}</span>
                </span>
              </div>
              <ProgressBar
                ratio={variable.spent / variable.budget}
                color="var(--ink-soft)"
                label={`Dépenses courantes : ${formatEuros(variable.spent)} sur ${formatEuros(variable.budget)}`}
                marker={progress}
                markerLabel="Aujourd’hui"
              />
            </div>
          ) : null}
        </>
      ) : null}
    </KeyFigure>
  );
}
```

Dans `Home.module.css` : supprimer `.header`, `.date`, `.title`, `.daysLeft`, `.hero`, `.heroMain`, `.heroFigure`, `.heroBudget`, `.stats`, `.stat`, `.pace` ; garder `.variable`, `.variableHead`, `.muted`, `.negative`, `.positive` ; ajouter `.paceUnder { color: var(--positive); font-weight: 600; }` et `.paceOver { color: var(--negative); font-weight: 600; }` (reprendre les couleurs de l'ancien `.pace strong`).

- [ ] **Step 3: À faire**

Dans `TodoList`, remplacer le `<div className="section-title">` par `<SectionHeader id="todo-title" title="À faire" />` et chaque lien par :

```tsx
<li key={t.key}>
  <TodoItem to={t.to} icon={t.icon} tone={t.tone === 'alert' ? 'negative' : 'marking'}>
    {t.text}
  </TodoItem>
</li>
```

L'état « Rien à faire » (`.allClear`) devient :

```tsx
<EmptyState icon={<Check />} title="Rien à faire" description="Tout est rangé et la piste est dégagée." />
```

Supprimer `.todo*` et `.allClear` de `Home.module.css` (garder `.todoDetail` et `.nowrap` s'ils servent encore dans les textes).

- [ ] **Step 4: Enveloppes et comptes**

`EnvelopesPreview` :

```tsx
<SectionHeader
  id="envelopes-title"
  title="Enveloppes"
  aside={<SectionLink to="/budget">{spending.length > HOME_ENVELOPES ? `Voir les ${spending.length}` : 'Voir le budget'}</SectionLink>}
/>
```

L'action de l'EmptyState reste un `ButtonLink` secondaire.

`AccountsStrip` :

```tsx
<SectionHeader id="accounts-title" title="Comptes" aside={<Total cents={data.netWorth} />} />
```

et la pastille `.accountKind` devient `<Badge>Épargne</Badge>`.
Supprimer `.netWorth` et `.accountKind` de `Home.module.css`.

- [ ] **Step 5: Erreur et chargement**

L'erreur de chargement devient :

```tsx
<div className="page">
  <ErrorState title="Impossible de charger l’accueil" description={errorMessage(overview.error)} onRetry={() => overview.refetch()} />
</div>
```

`HomeSkeleton` : en-tête (`Skeleton` de 140×14 puis 220×36), chiffre clé (`Skeleton` 120×12 puis 280×68 puis barre de 10 px), puis `<ListRowSkeleton rows={4} meta={false} middle />`. Supprimer les classes de squelette faites main.

- [ ] **Step 6: Vérifier et commiter**

Run: `npm run typecheck && npm run lint && npm test`
Vérification visuelle de `/` (1440 et 390, clair et sombre) : en-tête identique aux autres pages, chiffre clé sans carte, stats séparées par un filet, « À faire » inchangé, flèche du lien « Voir les 11 » en icône.

```bash
git add client/src/pages/Home.tsx client/src/pages/Home.module.css
git commit -m "refactor(client): accueil sur l'en-tête, le chiffre clé, les stats et les tâches partagés"
```

---

### Task 11: Budget (enveloppes, charges fixes, archivées, dialogues)

**Files:**
- Modify: `client/src/pages/Budget.tsx`, `Budget.module.css`
- Modify: `client/src/components/budget/EnvelopeRow.tsx`, `EnvelopeRow.module.css`, `EnvelopeRow.test.tsx`
- Modify: `client/src/components/budget/FixedCharges.tsx`, `FixedCharges.module.css`
- Modify: `client/src/components/budget/FundingBanner.tsx`, `FundingBanner.module.css`, `FundingBanner.test.tsx`
- Modify: `client/src/components/budget/EnvelopeDetailDialog.tsx`, `EnvelopeDetailDialog.module.css`
- Modify: `client/src/components/budget/FundDialog.tsx`, `FundDialog.module.css`
- Modify: `client/src/components/envelopes/EnvelopeFormDialog.tsx`, `AllocationForm.tsx`, `client/src/components/recurring/RecurringRuleForm.tsx` (et leurs `.module.css`)

**Interfaces:**
- Consumes: `ListRow`, `ColumnHeader`, `ListRowSkeleton`, `RowMenu`, `KeyFigure`, `StatGroup`, `Stat`, `SectionHeader`, `Total`, `Notice`, `Disclosure`, `ErrorState`, `FieldError`, `EnvelopeTag`, `Button`.
- Produces: `EnvelopeRow({ envelope, menu?: RowMenuItem[], leading?, onOpen?, className? })` et `EnvelopeRowHeader({ withActions?, spentLabel? })`, avec les mêmes noms d'export qu'aujourd'hui.

- [ ] **Step 1: EnvelopeRow sur ListRow**

Réécrire `EnvelopeRow.tsx` :

```tsx
import type { EnvelopeWithBalance } from '@shared/api-types';
import { formatEuros } from '@shared/money';
import { Amount, ColumnHeader, Dot, ListRow, ProgressBar, RowMenu, type RowMenuItem } from '@/components/ui';
import styles from './EnvelopeRow.module.css';

type EnvelopeRowProps = {
  envelope: EnvelopeWithBalance;
  /** Actions du menu ⋯ (Budget) ; absent sur l'accueil. */
  menu?: RowMenuItem[];
  /** Poignée de réordonnancement. */
  leading?: React.ReactNode;
  /** Clic sur la ligne : ouvre le détail des dépenses de l'enveloppe. */
  onOpen?: () => void;
  className?: string;
};

/** Intitulés de colonnes, sur la même grille que les lignes. */
export function EnvelopeRowHeader({ withActions = false, spentLabel = 'Dépensé ce mois' }: { withActions?: boolean; spentLabel?: string }) {
  return <ColumnHeader title="Enveloppe" middle={`${spentLabel} / budget`} trail="Disponible" actions={withActions} />;
}

/** Une enveloppe en une ligne : dépensé du mois face à son budget, et ce qu'il reste dedans. */
export function EnvelopeRow({ envelope, menu, leading, onOpen, className }: EnvelopeRowProps) {
  const target = envelope.monthlyTarget;
  const ratio = target ? envelope.spentThisMonth / target : 0;
  const over = target !== null && envelope.spentThisMonth > target;
  const verb = envelope.isSavings ? 'versés' : 'dépensés';

  return (
    <ListRow
      as="div"
      className={className}
      onClick={onOpen}
      clickLabel={`Voir les dépenses de ${envelope.name}`}
      lead={
        <>
          {leading}
          <Dot color={envelope.color} />
        </>
      }
      title={envelope.name}
      middle={
        <>
          {target ? (
            <ProgressBar ratio={ratio} color={envelope.color} label={`${envelope.name} : ${formatEuros(envelope.spentThisMonth)} ${verb} sur ${formatEuros(target)}`} />
          ) : (
            <span className={styles.noBudget}>Sans budget</span>
          )}
          <span className={['num', styles.spent, over ? styles.over : ''].join(' ')}>
            {formatEuros(envelope.spentThisMonth)}
            {target ? <span className={styles.target}> / {formatEuros(target)}</span> : <span className={styles.target}> {verb}</span>}
          </span>
        </>
      }
      trail={<Amount cents={envelope.balance} />}
      trailSub={envelope.balance < 0 ? 'dépassé' : 'disponible'}
      actions={menu ? <RowMenu label={`Actions pour ${envelope.name}`} items={menu} /> : undefined}
    />
  );
}
```

`EnvelopeRow.module.css` ne garde que `.noBudget`, `.spent`, `.over`, `.target` (relire les valeurs actuelles), et y ajoute `.noBudget { flex: 1; }` pour occuper la place de la barre. Supprimer tout le reste (grille, header, actions, fondu, `.more`, `.open`).
Garder `as="div"` : les enveloppes du Budget sont dans un conteneur réordonnable qui pose déjà ses propres éléments. Si le conteneur est un `<ul>`/`<ol>`, passer `as="li"` et retirer l'enveloppe `li` du parent.

Mettre à jour `EnvelopeRow.test.tsx` : les assertions sur les boutons d'actions passés en `actions` deviennent une ouverture du menu (`getByRole('button', { name: 'Actions pour Courses' })` puis `getByRole('menuitem', …)`).

- [ ] **Step 2: Budget - en-tête, chiffre clé, plan de revenu**

Dans `Budget.tsx` :
- l'action d'en-tête reste `<Button icon={<Plus />}>Nouvelle enveloppe</Button>` (secondaire par défaut) ; l'action de l'EmptyState passe de `variant="primary"` à secondaire (retirer `variant`) ;
- la section `.unallocated` devient :

```tsx
<KeyFigure
  label="Pas encore réparti"
  figure={data ? <Amount cents={data.toAllocate} size="xl" tone="neutral" className={data.toAllocate < 0 ? styles.negative : ''} animate /> : <Skeleton width={220} height={68} />}
  caption={
    !data
      ? undefined
      : data.toAllocate < 0
        ? 'Tu as réparti plus que ce que tes comptes contiennent. Retire de l’argent d’une enveloppe pour revenir à zéro.'
        : data.month.toFund > 0
          ? `Il manque ${formatEuros(data.month.toFund)} à tes enveloppes pour atteindre le budget du mois.`
          : 'Toutes tes enveloppes ont leur budget du mois. Le reste peut aller à l’épargne.'
  }
  aside={
    <Button variant="marking" icon={<WalletCards />} onClick={() => setFunding(true)} disabled={!data || order.length === 0}>
      Répartir
    </Button>
  }
/>
```

- `IncomePlan` : en cas de dépassement, rendre un `<Notice tone="negative">` avec le même texte ; sinon un paragraphe `<p className={styles.plan}>` en `sm ink-mute`. Supprimer `.planOver` et la marge négative de `.plan` (`Budget.module.css:40`).

- [ ] **Step 3: Budget - listes et menu**

- Le chargement devient `<ListRowSkeleton rows={6} meta={false} middle actions />`.
- L'erreur devient `<ErrorState title="Impossible de charger le budget" description={errorMessage(overview.error)} onRetry={() => overview.refetch()} />`.
- Les titres de section : `<SectionHeader id="spending-title" title="Dépenses" />` et `<SectionHeader id="savings-title" title="Épargne" aside={data ? <Total label="Mis de côté ce mois" cents={data.month.saved} /> : undefined} />`.
- Dans la fonction `rows(...)` (lignes ~100-140, lire le code), remplacer les boutons d'icône et `onMore` par :

```tsx
menu={[
  { label: 'Ajouter de l’argent', icon: <Plus />, onSelect: () => setAlloc({ mode: 'allocate', envelope: e }) },
  { label: 'Déplacer vers une autre enveloppe', icon: <ArrowRightLeft />, onSelect: () => setAlloc({ mode: 'move', envelope: e }) },
  { label: 'Modifier', icon: <Pencil />, onSelect: () => setEditing(e) },
  { label: 'Archiver', icon: <Archive />, onSelect: () => setArchiving(e), danger: true },
]}
```

- Supprimer l'état `menuFor`, le `<Dialog>` de feuille d'actions mobile et `.sheet`, `.sheetItem`.
- La poignée de glisser (`leading`) reste un `<button>` utilisable au clavier, visible au survol de la ligne et toujours visible sur écran tactile (`@media (hover: none)`) : c'est le modèle à reprendre pour les Règles de tri (Task 17).
- `ArchivedEnvelopes` :

```tsx
<Disclosure label="Afficher les enveloppes archivées" openLabel="Masquer les enveloppes archivées" count={archived.length}>
  <ul className="ledger">
    {archived.map((e) => (
      <ListRow
        key={e.id}
        compact
        lead={<Dot color={e.color} />}
        title={e.name}
        actions={
          <Button variant="ghost" size="sm" icon={<ArchiveRestore />} loading={restore.isPending && restore.variables?.id === e.id} onClick={() => restore.mutate({ id: e.id, archived: false })}>
            Réactiver
          </Button>
        }
      />
    ))}
  </ul>
</Disclosure>
```

Supprimer `.toggle`, `.archived`, `.archivedRow`, `.archivedName`, `.savedLine`, `.unallocated*`, `.hint` s'il n'est plus utilisé, `.error`.

- [ ] **Step 4: FixedCharges**

Dans `FixedCharges.tsx` :
- en-tête : `<SectionHeader id="fixed-title" title="Charges fixes et revenus" description="Ce qui revient tout seul. Runway les attend dans la prévision et les rapproche du relevé quand ils passent." aside={<Button size="sm" icon={<Plus />} onClick={…}>Ajouter</Button>} />` (reprendre le texte et le handler actuels) ;
- totaux : `StatGroup` avec trois `Stat` et le quatrième « Reste pour vivre et investir » en `emphasis`, chaque valeur en `<Amount size="lg" tone="neutral" />` ;
- groupes : `<GroupLabel>Revenus</GroupLabel>` et `<GroupLabel>Charges et virements</GroupLabel>` ;
- chaque règle devient un `ListRow` avec : `title` = libellé, `meta` = fréquence + `EnvelopeTag` (ou comptes), `trail` = montant signé, `trailSub` = prochaine date (`le 28 oct.`), `actions` = `RowMenu` avec « Mettre en pause » / « Reprendre », « Modifier » et « Supprimer » (`danger`, ouvre le ConfirmDialog existant) ;
- le chargement : `<ListRowSkeleton rows={5} actions />` à la place du bloc de 160 px ;
- les erreurs : `ErrorState` pour le chargement, `FieldError` dans les formulaires.

Supprimer de `FixedCharges.module.css` tout ce qui est remplacé (grille de ligne, `.groupTitle`, `.totals`, fondu des actions, `.error`).

- [ ] **Step 5: FundingBanner, dialogues et formulaires**

- `FundingBanner` rend `<Notice tone="marking" icon={<WalletCards />} label="Répartition du salaire" action={…boutons actuels…}>…texte actuel…</Notice>` ; supprimer `FundingBanner.module.css` sauf `.shortfall` (le déplacer en `<span className="muted">`, puis supprimer le fichier s'il est vide). Adapter `FundingBanner.test.tsx` si un test s'appuie sur une classe.
- `EnvelopeDetailDialog` : chiffres en `StatGroup` + `Stat` avec `Amount size="lg"`, opérations en `ListRow compact` avec `lead={<span className={listRowDate}>{formatDateCompact(t.date)}</span>}`, état vide en `EmptyState`, lien vers les opérations en `ButtonLink variant="ghost" size="sm"` sans marge négative, compteur en `GroupLabel`.
- `FundDialog` : les totaux (`.module.css:54-74`) passent en `StatGroup` ; l'erreur en `FieldError`.
- `EnvelopeFormDialog`, `AllocationForm`, `RecurringRuleForm` : chaque `<p className={styles.error} role="alert">` devient `<FieldError>`, supprimer `.error` de leurs modules.

- [ ] **Step 6: Vérifier et commiter**

Run: `npm run typecheck && npm run lint && npm test`
Vérification visuelle de `/budget` (1440 et 390, clair et sombre) :
- menu ⋯ ouvert sur une enveloppe, avec « Archiver » en rouge en bas ;
- réordonnancement par glisser toujours fonctionnel ;
- dialogue de détail d'une enveloppe ;
- archivées dépliées.

```bash
git add client/src/pages/Budget.tsx client/src/pages/Budget.module.css client/src/components/budget client/src/components/envelopes client/src/components/recurring
git commit -m "refactor(client): budget sur la ligne de liste, le menu d'actions, le chiffre clé et les bandeaux partagés"
```

---

### Task 12: Opérations (liste, à ranger, saisie et édition)

**Files:**
- Modify: `client/src/pages/Operations.tsx`, `Operations.module.css`
- Modify: `client/src/components/transactions/TransactionRow.tsx`, `TransactionRow.module.css`, `TransactionRow.test.tsx`
- Modify: `client/src/components/transactions/UnsortedList.tsx`, `UnsortedList.module.css`
- Modify: `client/src/components/transactions/RuleBanner.tsx`, `RuleBanner.module.css`, `RuleBanner.test.tsx`
- Modify: `client/src/components/transactions/TransactionEditDialog.tsx`

**Interfaces:**
- Consumes: `ListRow`, `ListRowSkeleton`, `GroupLabel`, `EnvelopeTag`, `Badge`, `Total`, `Notice`, `ErrorState`, `FieldError`.

- [ ] **Step 1: TransactionRow sur ListRow**

Dans `TransactionRow.tsx`, garder la logique (`signedAmount`, `where`, `repeatsLabel`) et remplacer le rendu par :

```tsx
return (
  <ListRow
    muted={planned}
    onClick={onClick}
    clickLabel={onClick ? `Modifier ${t.label}` : undefined}
    title={t.label}
    meta={
      <>
        {t.kind !== 'expense' ? <Badge tone={t.kind === 'income' ? 'positive' : 'neutral'}>{KIND_LABELS[t.kind]}</Badge> : null}
        {t.kind === 'expense' ? envelope ? <EnvelopeTag name={envelope.name} color={envelope.color} /> : <Badge tone="marking">À ranger</Badge> : null}
        {planned ? <Badge tone="warning">Prévue</Badge> : null}
        {where ? <span className={styles.where}>{where}</span> : null}
        {t.note && !repeatsLabel(t.note, t.label) ? <span className={styles.note}>{t.note}</span> : null}
      </>
    }
    trail={<Amount cents={amount} tone={amount > 0 && t.kind !== 'allocation' ? 'always' : 'neutral'} />}
    actions={
      planned && onConfirm ? (
        <Button size="sm" variant="secondary" icon={<Check />} onClick={onConfirm} loading={confirming}>
          Confirmer
        </Button>
      ) : undefined
    }
  />
);
```

Le clic passe désormais par le bouton qui couvre la ligne. Il faut vérifier que le nom accessible attendu par `TransactionRow.test.tsx` et par les tests d'Opérations reste trouvable. Si des tests cherchaient le bouton par le libellé, les adapter à `Modifier <libellé>`.
`TransactionRow.module.css` ne garde que `.where` et `.note`.
Les badges de méta passent à 20 px de haut dans une ligne : ajouter dans `Badge.module.css` une règle de contexte n'est pas souhaitable. Garder 22 px partout, la méta s'en accommode (la ligne fait 56 px).

- [ ] **Step 2: Page Opérations**

Dans `Operations.tsx` :
- le résumé (`.summary`, lignes ~100) devient une ligne `<p className={styles.summary}>` contenant `{plural(n, 'opération')}` puis `<Total label="Entrées" cents={…} />` et `<Total label="Sorties" cents={…} />` ; `.summary` ne garde que `display: flex; gap: var(--s-4); align-items: baseline; font-size: var(--text-sm); color: var(--ink-mute);` ;
- chaque jour : `<GroupLabel as="h2">{relativeDay(day)}</GroupLabel>` suivi de `<ul className="ledger stagger">` ; supprimer `.day` ;
- chargement : `<ListRowSkeleton rows={8} />` (ligne 111) ;
- erreur : `<ErrorState title="Impossible de charger les opérations" description={errorMessage(query.error)} onRetry={() => query.refetch()} />` (ligne 113) ;
- écart sous les onglets : `s-6` (déjà le cas, vérifier).

- [ ] **Step 3: À ranger**

Dans `UnsortedList.tsx` :
- barre d'intro (lignes ~100) : texte `sm ink-mute` à gauche, `max-width: 62ch`, bouton `marking` « Trier avec Claude » à droite (c'est l'action qui règle l'alerte de l'écran) ;
- suggestions en erreur (`Card tone="negative"`, ligne 117) : `<Notice tone="negative">` ;
- bloc de suggestions (`Card`, ligne 124, et `.bannerBlock`) : `<Notice tone="neutral" label="Suggestions de Claude" action={…}>` ;
- chaque ligne : `ListRow` avec `lead={<span className={listRowDate}>{formatDateCompact(t.date)}</span>}`, `title`, `meta` (compte), `trail` = montant, `actions` = l'`InlinePill` de choix d'enveloppe existant ; mettre `--list-trail` à 110 px et laisser l'`InlinePill` dans `actions` (sa largeur de 200 px est portée par l'`InlinePill` lui-même) ;
- `.rulesLegend` utilise `GroupLabel as="p"`.

`RuleBanner` rend :

```tsx
<Notice
  tone="marking"
  label="Créer une règle de tri"
  action={
    <>
      <Button size="sm" variant="secondary" loading={create.isPending} disabled={pattern.trim().length < 2} onClick={() => create.mutate({ pattern: pattern.trim(), envelopeId })}>
        Créer la règle
      </Button>
      <Button size="sm" variant="ghost" onClick={onDone}>
        Non merci
      </Button>
    </>
  }
>
  <span className={styles.sentence}>
    Toujours ranger les libellés contenant
    <Input aria-label="Motif de la règle" value={pattern} onChange={(e) => setPattern(e.target.value)} className={styles.pattern} />
    dans <strong>{envelopeName}</strong> ?
  </span>
</Notice>
```

« Créer la règle » passe de `primary` à `secondary` (règle : pas de bouton noir dans un bandeau ; le jaune est déjà le fond).
`RuleBanner.module.css` ne garde que `.sentence { display: inline-flex; flex-wrap: wrap; align-items: center; gap: var(--s-2); }` et `.pattern` (motif en mono, largeur actuelle).

- [ ] **Step 4: Dialogue d'édition**

`TransactionEditDialog` : erreurs en `FieldError`. Il utilise déjà `ConfirmDialog` pour la suppression : vérifier.

- [ ] **Step 5: Vérifier et commiter**

Run: `npm run typecheck && npm run lint && npm test`
Vérification visuelle de `/operations` et `/operations?vue=a-ranger` (1440 et 390, clair et sombre) : hauteur des squelettes identique aux lignes (recharger avec le réseau ralenti dans DevTools pour le voir), pastilles d'enveloppe, bandeau de règle après un tri manuel.

```bash
git add client/src/pages/Operations.tsx client/src/pages/Operations.module.css client/src/components/transactions
git commit -m "refactor(client): opérations et tri sur la ligne de liste, les libellés de groupe et les bandeaux partagés"
```

---

### Task 13: Analyse et À venir

**Files:**
- Modify: `client/src/pages/Analyse.tsx`, `Analyse.module.css`
- Modify: `client/src/components/analyse/Upcoming.tsx`, `Upcoming.module.css`
- Modify: `client/src/components/dashboard/RunwayStrip.module.css`

**Interfaces:**
- Consumes: `KeyFigure`, `keyFigureValue`, `StatGroup`, `Stat`, `SectionHeader`, `ListRow`, `ColumnHeader`, `ListRowSkeleton`, `listRowDate`, `EnvelopeTag`, `ProgressBar`, `ErrorState`, `Range`, `ButtonLink`.

- [ ] **Step 1: Où part l'argent**

- Le chiffre de tête (lignes 123-129) devient `<KeyFigure label="Dépensé sur la période" figure={<Amount cents={…} size="xl" tone="neutral" animate />} aside={<p className={styles.versus}>…comparaison actuelle…</p>} />`.
- Barres par enveloppe (lignes 150-170) : chaque ligne devient un `ListRow` cliquable (`onClick` = navigation actuelle vers Opérations, `clickLabel={`Voir les opérations de ${name}`}`), `lead={<Dot color={color} />}`, `title={name}`, `middle={<ProgressBar ratio={…} color={color} size="md" label={…} marker={budget ? …ratio du budget… : undefined} markerLabel="Budget de la période" />}`, `trail={<Amount cents={…} tone="neutral" />}`, `trailSub={budget ? `sur ${formatEuros(budget)}` : `${pct} %`}`. Mettre `--list-middle: 50%` sur la liste via une classe de `Analyse.module.css`. Supprimer `.barTrack`, `.barFill`, `.barTarget`, `@keyframes grow`, `.barRow`.
  `ProgressBar` normalise sur 1 : la barre de chaque enveloppe doit être rapportée au maximum de la liste comme aujourd'hui. Passer `ratio = montant / max` et `marker = budget / max`.
- Note sous la liste : `<p className={styles.note}>` en `xs ink-mute`, inchangée.
- Plus grosses dépenses : `<SectionHeader title="Plus grosses dépenses" />` puis `ListRow` avec `lead={<span className={listRowDate}>{formatDateCompact(t.date)}</span>}`, `title`, `meta={envelope ? <EnvelopeTag … /> : <Badge tone="marking">À ranger</Badge>}`, `trail`. L'enveloppe passe de la colonne du milieu à la méta (deux lignes, comme Opérations). Supprimer `.topRow`.
- Erreurs : `ErrorState` pour le chargement de la vue, et pour `TopExpenses` qui n'en a pas aujourd'hui (`isError` → `ErrorState title="Impossible de charger les plus grosses dépenses"`).

- [ ] **Step 2: Évolution**

- KPI (lignes ~183-223 du CSS) : `KeyFigure label="Taux d’épargne" figure={<span className={keyFigureValue}>{pct} %</span>} aside={<StatGroup direction="column" divided><Stat label="…">…</Stat><Stat label="…">…</Stat></StatGroup>}` avec les deux `Amount lg` actuels. Supprimer `.kpi*`.
- Les graphiques gardent leur composant, chacun sous un `SectionHeader`.
- Erreur : quand les KPI échouent (aujourd'hui ils renvoient `null`, ligne 242), afficher un `ErrorState`.

- [ ] **Step 3: À venir**

Dans `Upcoming.tsx` :
- barre d'intro : texte `sm ink-mute` `62ch` à gauche, curseur d'horizon `<Range …props actuelles… />` à droite ;
- titres : `SectionHeader` (le `<h3>` de la ligne 139 devient `SectionHeader as="h3"`), l'icône dans le h2 (lignes 63-64) passe en `Notice` si c'est une alerte, sinon est supprimée ;
- tableau des découverts : `ColumnHeader` + `ListRow` cliquables (au lieu de `role="table"` et `.tr`), dates en `formatDateCompact` dans `lead` ;
- événements : `ListRow compact` avec date en `lead`, montant en `trail` ;
- lien vers Opérations : `ButtonLink variant="ghost" size="sm"` (règle des liens discrets) ;
- état vide (ligne 143) : `EmptyState` ;
- supprimer de `Upcoming.module.css` tout ce qui est remplacé.

Dans `RunwayStrip.module.css` :
- `rgb(255 255 255 / x)` devient `color-mix(in oklab, var(--tarmac-ink) x%, transparent)` ;
- `rgb(0 0 0 / 0.5)` devient `color-mix(in oklab, black 50%, transparent)` ;
- `10px` devient `var(--text-2xs)` ;
- le rayon en px devient `var(--radius-sm)`.

- [ ] **Step 4: Vérifier et commiter**

Run: `npm run typecheck && npm run lint && npm test`
Vérification visuelle des trois vues de `/analyse` (1440 et 390, clair et sombre) : barres alignées sur la même colonne, trait de budget visible, clic sur une enveloppe qui mène aux opérations filtrées.

```bash
git add client/src/pages/Analyse.tsx client/src/pages/Analyse.module.css client/src/components/analyse client/src/components/dashboard
git commit -m "refactor(client): analyse et prévision sur le chiffre clé, la ligne de liste et la barre de progression partagés"
```

---

### Task 14: Investir (portefeuille, positions, Binance)

**Files:**
- Modify: `client/src/pages/Invest.tsx`
- Modify: `client/src/components/invest/PortfolioSummary.tsx`, `Portfolio.module.css`, `MoonTrail.module.css`
- Modify: `client/src/components/invest/PortfolioChart.tsx`
- Modify: `client/src/components/invest/HoldingList.tsx`, `HoldingList.test.tsx`
- Modify: `client/src/components/invest/HoldingDialog.tsx`, `HoldingDialog.module.css`
- Modify: `client/src/components/invest/BinancePanel.tsx`, `BinancePanel.module.css`, `BinancePanel.test.tsx`
- Modify: `client/src/components/invest/AddHoldingDialog.tsx`, `AddHoldingDialog.module.css`, `Forms.module.css`, `TradeDialog.tsx`, `BinanceConnectDialog.tsx`

**Interfaces:**
- Consumes: `KeyFigure` (`variant="night"`, `decoration`), `StatGroup`, `Stat`, `SectionHeader`, `ListRow`, `ColumnHeader`, `ListRowSkeleton`, `listRowDate`, `RowMenu`, `Notice`, `ConfirmDialog`, `FieldError`, `ErrorState`, `SearchPill`, `Badge`.

- [ ] **Step 1: En-tête et chiffre clé**

- `Invest.tsx` : « Ajouter une position » passe en secondaire (retirer `variant="primary"`) et reste affichée seulement s'il y a des positions (l'EmptyState porte l'action sinon, en secondaire). L'erreur de chargement (ligne 45) devient `ErrorState`.
- `PortfolioSummary` rend `<KeyFigure variant="night" label="Valeur du portefeuille" figure={<Amount … size="xl" … />} caption={…plus-value actuelle…} decoration={…ascii art / MoonTrail actuel…} aside={<StatGroup direction="column"><Stat label="Investi">…</Stat><Stat label="Réalisée">…</Stat></StatGroup>} />`. Garder exactement le contenu affiché aujourd'hui (plus-value, stats).
- `Portfolio.module.css` : supprimer `.hero` et la redéfinition locale des tokens (lignes 5-26, 44, 73-95, 246), désormais portées par `.night` de KeyFigure. Garder le positionnement propre à l'art (taille, position de la lune) dans une classe passée à l'élément de `decoration`. Remplacer le voile `rgb(3 4 8 / …)` par `color-mix(in oklab, var(--night) …%, transparent)`.
- `MoonTrail.module.css` : `#f2efe8` → `var(--night-ink)`, `#ef6f58` → `var(--night-negative)`, `#4386d3` → `var(--night-sky)`.
- Squelette (`PortfolioSummary.tsx:57-67`) : un `KeyFigure variant="night"` avec `Skeleton` à la place des valeurs.

- [ ] **Step 2: Évolution et positions**

- `PortfolioChart` : en-tête en `SectionHeader title="Évolution" aside={…FilterPill sm et Segmented sm actuels…}` ; la légende reste.
- Positions : `SectionHeader title="Positions"`, puis `<ColumnHeader title="" middle="Aujourd’hui" trail="All time" />` (garder les libellés du dernier commit `f0760fb`) et chaque position en `ListRow` cliquable (ouvre HoldingDialog) : `title` = nom, `meta` = `Badge` du courtier + quantité + ticker en `.mono`, `middle` = variation du jour alignée à droite, `trail` = valeur, `trailSub` = plus-value. Mettre `--list-middle: 120px` sur cette liste. Supprimer la subgrid de `Portfolio.module.css:128-154`. Adapter `HoldingList.test.tsx`.
- `BinancePanel` : ligne de statut en `ListRow as="div" compact` (texte + actions « Déconnecter » / « Synchroniser ») ; l'erreur en `Notice tone="negative"` ; la confirmation en ligne de déconnexion (lignes 57-66) devient un `ConfirmDialog` (« Déconnecter Binance ? », bouton `danger` « Déconnecter »). Adapter `BinancePanel.test.tsx` pour passer par le dialogue.

- [ ] **Step 3: Dialogues**

- `HoldingDialog` : chiffres en `StatGroup` + `Stat` avec `Amount size="lg"` (au lieu de `formatEuros` en body md), titre « Mouvements » en `SectionHeader as="h3"`, mouvements en `ListRow compact` avec `lead={<span className={listRowDate}>{formatDateCompact(t.date)}</span>}` (la date passe enfin en `.num`), actions de chaque mouvement en `RowMenu` (« Modifier », « Supprimer » `danger`). Les deux suppressions (position, lignes 142-151 ; mouvement, ligne 125, aujourd'hui sans confirmation) passent par `ConfirmDialog`. La note `warning-soft` (lignes 44-50) devient `Notice tone="warning"`.
- `AddHoldingDialog` : la recherche (`.searchBox`, loupe positionnée à la main) devient `SearchPill` ; les résultats deviennent des `ListRow compact` cliquables. Supprimer `.searchBox` et `.result`.
- `TradeDialog`, `BinanceConnectDialog`, `Forms.module.css` : erreurs en `FieldError`, suppression de `.error`.

- [ ] **Step 4: Vérifier et commiter**

Run: `npm run typecheck && npm run lint && npm test`
Vérification visuelle de `/investir` (1440 et 390, clair et sombre) : la nuit et l'art identiques à avant, positions alignées sous leurs en-têtes, dialogue d'une position avec menu ⋯ sur un mouvement.

```bash
git add client/src/pages/Invest.tsx client/src/components/invest
git commit -m "refactor(client): investir sur le chiffre clé de nuit, la ligne de liste et les confirmations partagés"
```

---

### Task 15: Idées en cartes allégées et dialogue de détail

**Files:**
- Modify: `client/src/components/invest/IdeasSection.tsx`, `Ideas.module.css`
- Modify: `client/src/components/invest/IdeaCard.tsx`, `IdeaCard.test.tsx`
- Create: `client/src/components/invest/IdeaDialog.tsx`, `IdeaDialog.test.tsx`
- Modify: `client/src/components/invest/IdeasScore.tsx`, `IdeasScore.test.tsx`

**Interfaces:**
- Consumes: `Card`, `Badge`, `Dialog`, `SectionHeader`, `Disclosure`, `Notice`, `PulseDot`, `Button`.
- Produces:
  - `IdeaCard({ idea: IdeaView; onOpen: () => void })` : carte cliquable allégée.
  - `IdeaDialog({ idea: IdeaView | null, onClose: () => void })` : raisonnement complet (`IdeaView` vient de `@shared/api-types`).
  - `openIdea` : fixture partagée des tests, dans `client/src/components/invest/idea-fixture.ts`.

- [ ] **Step 1: Écrire les tests de la carte**

Remplacer `client/src/components/invest/IdeaCard.test.tsx` (garder la fixture `open` telle quelle) :

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { IdeaView } from '@shared/api-types';
import { IdeaCard } from './IdeaCard';

const open: IdeaView = {
  id: 1,
  createdOn: '2026-10-07',
  title: 'La fête des nouilles fait vendre des baguettes',
  event: 'La fête des nouilles a lieu le 20 octobre.',
  sources: ['https://www.exemple.fr/fete', 'https://news.exemple.jp/men'],
  risk: null,
  marketContext: null,
  reasoning: ['La fête des nouilles approche', 'Les gens vont acheter des baguettes', 'Le fabricant de baguettes va vendre plus'],
  pricedIn: 'En partie.',
  ticker: 'BAG.PA',
  assetName: 'Baguettes SA',
  whereToBuy: 'trade_republic',
  horizon: '2026-10-28',
  startPriceEur: 12,
  status: 'open',
  return: 0.083,
  benchReturn: 0.01,
  priceDate: '2026-10-10',
};

describe('IdeaCard', () => {
  it('résume l’idée : titre, horizon, actif et performances', () => {
    render(<IdeaCard idea={open} onOpen={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'La fête des nouilles fait vendre des baguettes' })).toBeInTheDocument();
    expect(screen.getByText('D’ici le 28 oct.')).toBeInTheDocument();
    expect(screen.getByText('Baguettes SA')).toBeInTheDocument();
    expect(screen.getByText('BAG.PA')).toBeInTheDocument();
    expect(screen.getByText('Sur Trade Republic')).toBeInTheDocument();
    expect(screen.getByText('+8,3 %')).toBeInTheDocument();
    expect(screen.getByText('+1,0 %')).toBeInTheDocument();
  });

  it('garde le raisonnement pour le dialogue', () => {
    render(<IdeaCard idea={{ ...open, risk: 'La fête peut être annulée.' }} onOpen={vi.fn()} />);
    expect(screen.queryByRole('list', { name: 'Déduction' })).not.toBeInTheDocument();
    expect(screen.queryByText(/La fête des nouilles a lieu/)).not.toBeInTheDocument();
    expect(screen.queryByText('Déjà dans les prix ?')).not.toBeInTheDocument();
    expect(screen.queryByText('Ce qui peut mal tourner')).not.toBeInTheDocument();
  });

  it('s’ouvre au clic', async () => {
    const onOpen = vi.fn();
    render(<IdeaCard idea={open} onOpen={onOpen} />);
    await userEvent.click(screen.getByRole('button', { name: 'Voir le raisonnement : La fête des nouilles fait vendre des baguettes' }));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('une idée close affiche son verdict', () => {
    const { rerender } = render(<IdeaCard idea={{ ...open, status: 'closed', return: 0.25, benchReturn: 0.05 }} onOpen={vi.fn()} />);
    expect(screen.getByText('A battu le S&P 500')).toBeInTheDocument();
    expect(screen.getByText('Close le 28 oct.')).toBeInTheDocument();
    rerender(<IdeaCard idea={{ ...open, status: 'closed', return: -0.1, benchReturn: 0.05 }} onOpen={vi.fn()} />);
    expect(screen.getByText('N’a pas battu le S&P 500')).toBeInTheDocument();
  });
});
```

Pour que la fixture soit partagée, la déplacer dans `client/src/components/invest/idea-fixture.ts` (`export const openIdea: IdeaView = {…}`) et l'importer dans les deux fichiers de test.
Le code ci-dessus la garde en ligne pour la lisibilité du plan : l'implémenteur fait l'extraction.

- [ ] **Step 2: Écrire les tests du dialogue**

`client/src/components/invest/IdeaDialog.test.tsx` :

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { openIdea } from './idea-fixture';
import { IdeaDialog } from './IdeaDialog';

describe('IdeaDialog', () => {
  it('montre l’événement, les sources, la déduction et ce qui est déjà dans les prix', () => {
    render(<IdeaDialog idea={openIdea} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'La fête des nouilles fait vendre des baguettes' })).toBeInTheDocument();
    expect(screen.getByText(/La fête des nouilles a lieu le 20 octobre\./)).toBeInTheDocument();
    const source = screen.getByRole('link', { name: /exemple\.fr/ });
    expect(source).toHaveAttribute('href', 'https://www.exemple.fr/fete');
    expect(source).toHaveAttribute('target', '_blank');
    expect(source).toHaveAttribute('rel', 'noreferrer');
    expect(screen.getByRole('link', { name: /news\.exemple\.jp/ })).toHaveAttribute('href', 'https://news.exemple.jp/men');
    expect(screen.getByRole('list', { name: 'Déduction' }).querySelectorAll('li')).toHaveLength(3);
    expect(screen.getByText('Déjà dans les prix ?')).toBeInTheDocument();
    expect(screen.getByText(/En partie\./)).toBeInTheDocument();
  });

  it('montre le risque et ce que le cours avait déjà fait', () => {
    render(<IdeaDialog idea={{ ...openIdea, risk: 'La fête peut être annulée.', marketContext: { perf3m: 0.18, benchPerf3m: 0.04 } }} onClose={vi.fn()} />);
    expect(screen.getByText('Ce qui peut mal tourner')).toBeInTheDocument();
    expect(screen.getByText(/La fête peut être annulée\./)).toBeInTheDocument();
    expect(screen.getByText('Avant l’idée : +18,0 % sur 3 mois (S&P 500 +4,0 %)')).toBeInTheDocument();
  });

  it('une idée d’avant la critique n’a ni risque ni contexte de marché', () => {
    render(<IdeaDialog idea={openIdea} onClose={vi.fn()} />);
    expect(screen.queryByText('Ce qui peut mal tourner')).not.toBeInTheDocument();
    expect(screen.queryByText(/sur 3 mois/)).not.toBeInTheDocument();
  });

  it('reste fermé sans idée et se ferme avec le bouton', async () => {
    const onClose = vi.fn();
    const { rerender } = render(<IdeaDialog idea={null} onClose={onClose} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    rerender(<IdeaDialog idea={openIdea} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
```

Vérifier dans `Dialog.tsx` le nom accessible exact du bouton de fermeture et l'ajuster dans le test si ce n'est pas « Fermer ».

- [ ] **Step 3: Lancer les tests**

Run: `npx vitest run client/src/components/invest/IdeaCard.test.tsx client/src/components/invest/IdeaDialog.test.tsx`
Expected: FAIL (`onOpen` inconnu, `IdeaDialog` introuvable, le raisonnement est encore sur la carte).

- [ ] **Step 4: Implémenter**

`IdeaCard` :
- signature `IdeaCard({ idea, onOpen }: { idea: IdeaView; onOpen: () => void })` ;
- racine `<Card tone="flat" padding="md" className={styles.card}>` avec `position: relative`, contenant en premier un `<button type="button" className={styles.cardButton} onClick={onOpen} aria-label={`Voir le raisonnement : ${idea.title}`} />` qui couvre la carte (`position: absolute; inset: 0; border-radius: inherit;`, même principe que `ListRow`) ;
- contenu, dans l'ordre :
  - le titre (`h3` en display `lg` 600, `keepTogether`) ;
  - l'horizon (`D’ici le …` ou `Close le …`) en libellé capitales ;
  - l'actif : nom, ticker en `.mono`, plateforme (`Sur Trade Republic` / `Ailleurs`) ;
  - le pied : performance en display `xl` **500** (au lieu de 600) avec sa légende, S&P 500 en `sm ink-mute`, et pour une idée close le verdict en `<Badge tone={beat ? 'positive' : 'neutral'}>` ;
- supprimer de la carte l'événement, les sources, la déduction, le contexte de marché, « Déjà dans les prix ? » et le risque (ils passent dans le dialogue) ;
- supprimer `.verdict`, `.verdictWin`, `.verdictLose` (remplacés par `Badge`).

`IdeaDialog` :

```tsx
import { Dialog } from '@/components/ui';

export function IdeaDialog({ idea, onClose }: { idea: IdeaView | null; onClose: () => void }) {
  return (
    <Dialog open={idea !== null} onClose={onClose} title={idea?.title ?? ''} size="lg">
      {idea ? <IdeaReasoning idea={idea} /> : null}
    </Dialog>
  );
}
```

`IdeaReasoning` est un composant local du même fichier. Il reprend, déplacés tels quels depuis l'`IdeaCard` actuelle :
- l'événement et ses sources (`<a target="_blank" rel="noreferrer">` avec `domainOf` et `ArrowUpRight`) ;
- la déduction (`<ol aria-label="Déduction">`, la dernière étape en jaune) ;
- l'actif (nom, ticker, plateforme) ;
- le contexte de marché (`formatMarketContext`) ;
- « Déjà dans les prix ? » et « Ce qui peut mal tourner ».

Les styles correspondants (`.event`, `.sources`, `.source`, `.chain`, `.asset`, `.market`, `.pricedIn`, `.pricedInLabel`) quittent `Ideas.module.css` pour `IdeaDialog.module.css`, avec un écart de `s-5` entre les blocs.

`IdeasSection` :
- en-tête : `<SectionHeader title="Idées" description="Trouvées par 4 chercheurs, passées au crible par un critique, suivies face au S&P 500." aside={<Button size="sm" icon={<Sparkles />} …>Trouver des idées</Button>} />` (texte et handler actuels) ;
- état de la fournée en cours (`.running`) : `<Notice tone="neutral" icon={<PulseDot />}>…texte actuel…</Notice>` ;
- erreur (`Ideas.module.css:306-315`) : `<Notice tone="negative">` ;
- grille de cartes inchangée (3 colonnes, 1 sur mobile), avec un état `const [open, setOpen] = useState<IdeaView | null>(null)` et `<IdeaDialog idea={open} onClose={() => setOpen(null)} />` ;
- idées closes : `<Disclosure label="Afficher les idées closes" openLabel="Masquer les idées closes" count={closed.length}>` ;
- `IdeasScore` : titre en `SectionHeader as="h3"`, chiffres en `StatGroup`.

Supprimer de `Ideas.module.css` : `.head*`, `.subtitle`, `.verdict`, `.running`, le point qui pulse, l'erreur, le bouton de repli et tout le détail déplacé dans le dialogue.

- [ ] **Step 5: Lancer les tests**

Run: `npx vitest run client/src/components/invest`
Expected: PASS.

- [ ] **Step 6: Vérifier et commiter**

Vérification visuelle de `/investir` (1440 et 390, clair et sombre) :
- cartes nettement plus courtes, de hauteur homogène ;
- dialogue d'une idée lisible, avec la source cliquable ;
- idées closes repliées.

```bash
git add client/src/components/invest
git commit -m "feat(client): idées en cartes allégées, raisonnement complet dans un dialogue"
```

---

### Task 16: Import

**Files:**
- Modify: `client/src/pages/Import.tsx`, `Import.module.css`
- Modify: `client/src/components/import/DropZone.tsx`, `DropZone.module.css`
- Modify: `client/src/components/import/ImportPreview.tsx`, `ImportPreview.module.css`

**Interfaces:**
- Consumes: `PageHeader` (`back`), `EmptyState`, `Spinner`, `Card`, `Disclosure`, `ListRow`, `listRowDate`, `Badge`, `EnvelopeTag`, `StatGroup`, `Stat`, `FieldError`.

- [ ] **Step 1: Page**

`<PageHeader back={{ to: '/operations', label: 'Opérations' }} title="Importer un relevé" subtitle={…sous-titre actuel…} />` ; supprimer le lien retour fait main et `.head`, `.back` de `Import.module.css`.

- [ ] **Step 2: DropZone**

- Le contenu de la zone (icône, titre, texte, bouton primaire « Choisir un fichier ») est rendu par `EmptyState`, et `DropZone.module.css` ne garde que le cadre en pointillés (`border: 2px dashed var(--rule-strong); border-radius: var(--radius-lg);`) et son état survolé.
- Le spinner devient `<Spinner size={20} />`.
- Supprimer `.title`, `.text`, `.spinner`, `@keyframes`.

- [ ] **Step 3: ImportPreview**

- Compteurs (`.counts strong` en mono, lignes 14-18) : `StatGroup` avec des `Stat` dont la valeur est en `.num` display `xl` 500 (pas de mono).
- Les trois `<details>` (nouvelles, rapprochées, doublons) : `Disclosure` avec `label="Nouvelles"` etc., `count`, et `defaultOpen` pour « Nouvelles ».
- Lignes : `ListRow compact` avec `lead={<span className={listRowDate}>{formatDateCompact(t.date)}</span>}`, `title`, `meta={t.kind === 'income' ? <Badge tone="positive">Revenu</Badge> : envelope ? <EnvelopeTag … /> : null}`, `trail`.
- « Rien de nouveau » (`.nothing`) : `EmptyState`.
- `.none` (ligne 25) : `EmptyState` sans icône ou `<p className="muted">` d'une ligne selon le contexte (si c'est dans une section repliée, un paragraphe suffit).
- Supprimer les classes remplacées, dont `.section`, `.nothing`, `.nothingTitle`, `.income`, `.counts`.

- [ ] **Step 4: Vérifier et commiter**

Run: `npm run typecheck && npm run lint && npm test`
Vérification visuelle de `/operations/importer` : sans fichier, puis avec un relevé de `~/Documents/releves-bancaires/` en aperçu, **sans cliquer sur Importer** (la base de recette est une copie, mais l'aperçu suffit).

```bash
git add client/src/pages/Import.tsx client/src/pages/Import.module.css client/src/components/import/DropZone.tsx client/src/components/import/DropZone.module.css client/src/components/import/ImportPreview.tsx client/src/components/import/ImportPreview.module.css
git commit -m "refactor(client): import sur l'en-tête avec retour, l'état vide, les listes repliables et la ligne de liste"
```

---

### Task 17: Réglages en une colonne

**Files:**
- Modify: `client/src/pages/settings/General.tsx`, `Bank.tsx`, `Accounts.tsx`, `SortingRules.tsx` (et le layout des réglages s'il est dans un fichier séparé)
- Modify: `client/src/pages/settings/Settings.module.css`, `Bank.module.css`, `Accounts.module.css`, `SortingRules.module.css`
- Modify: `client/src/components/import/BankSyncPanel.tsx`, `BankSyncPanel.module.css`
- Modify: `client/src/components/sorting/SortingRuleDialog.tsx`, `RuleTester` (chemin à trouver avec `grep -rn "function RuleTester" client/src`)

**Interfaces:**
- Consumes: `SectionHeader`, `ListRow`, `ColumnHeader`, `ListRowSkeleton`, `RowMenu`, `Badge`, `Total`, `Disclosure`, `ConfirmDialog`, `ErrorState`, `FieldError`, `ButtonLink`.

- [ ] **Step 1: Structure commune**

Dans `Settings.module.css` :
- supprimer la grille `1fr/2fr` (lignes 2-13) et `.aside h2` ;
- ajouter `.section + .section { margin-top: var(--s-10); }` et `.form { display: flex; flex-direction: column; gap: var(--s-4); max-width: 480px; }`.

Chaque onglet devient une suite de `<section className={styles.section}>` qui commencent par un `SectionHeader` (titre, description, action à droite). Les textes de description sont ceux de la colonne de gauche actuelle.

- [ ] **Step 2: Général**

- Section « Prévision et tri » : `SectionHeader` + description (les deux paragraphes actuels, avec `claude -p` et `/login` en `<code className="mono">`), puis le formulaire en `.form`, bouton `primary` « Enregistrer » en bas du formulaire, erreurs en `FieldError`.
- Section « Sauvegarde » : `SectionHeader` + description, puis les deux exports en `ListRow` avec `lead` = icône actuelle, `title`, `meta` = description. Chaque ligne est un lien de téléchargement : utiliser `ListRow` avec `onClick` qui déclenche le téléchargement existant, ou garder un `<a download>` qui couvre la ligne, en reprenant le mécanisme actuel.

- [ ] **Step 3: Banque**

- Trois sections : synchronisation (BankSyncPanel), accès Enable Banking (formulaire en `.form`, clé stockée, « Tester »), historique des imports.
- Le `ButtonLink sm` de la colonne de gauche (`Bank.tsx:178`) va dans l'`aside` du `SectionHeader`.
- Historique : `ColumnHeader` + `ListRow` (date en `lead` au format `formatDateCompact` au lieu de `formatDateLong`, fichier en `.mono` dans `title`, compteurs en `meta`, compte en `trail`). Supprimer la grille fixe `112px 1fr 112px 72px 92px 72px` (`Bank.module.css:61-76`).
- « Afficher tout » (`Bank.tsx:216`) devient `Disclosure`.
- État vide (ligne 190) : `EmptyState`.
- `BankSyncPanel` : `window.confirm` (ligne 190) remplacé par un `ConfirmDialog` avec le même texte ; erreurs en `Notice tone="negative"` ou `FieldError` selon qu'elles concernent le panneau ou un champ ; renommer la classe `.card` (sans apparence de carte) en `.panel`.

- [ ] **Step 4: Comptes**

- `SectionHeader title="Comptes" aside={<Button size="sm" icon={<Plus />} onClick={…}>Nouveau compte</Button>}` (bouton secondaire, handler actuel).
- Le `Total` passe sous la liste, aligné à droite : `<div className={styles.total}><Total cents={…} /></div>` avec `.total { display: flex; justify-content: flex-end; padding-top: var(--s-3); }`.
- Chaque compte : `ListRow` cliquable (ouvre l'édition) avec `title` = nom, `meta` = `Badge` (Épargne, Hors budget…) + méta actuelle, `trail={<Amount cents={…} size="lg" />}`, `actions` = `RowMenu` (« Modifier », « Archiver » `danger` → ConfirmDialog existant).
- Archivés : `Disclosure` + `ListRow compact` avec `Badge` « Archivé » ; supprimer l'opacité 0,7.
- Chargement : `ListRowSkeleton` ; erreur (ligne 166) : `ErrorState`.

- [ ] **Step 5: Règles de tri**

- `SectionHeader title="Règles de tri" description={…texte de .explain…} aside={<Button size="sm" icon={<Plus />} onClick={…}>Nouvelle règle</Button>}`.
- L'autre bouton actuel de la barre (`SortingRules.tsx:51-63`) va dans le RuleTester, juste sous l'en-tête, s'il concerne le test des règles. Sinon, il devient un second `Button size="sm" variant="ghost"` placé avant « Nouvelle règle » dans le même `aside`.
- RuleTester : champ en `.form` (`max-width` 480 px au lieu de 420).
- Chaque règle : `ListRow` avec `lead` = poignée de glisser (même bouton clavier que le Budget, Task 11) + numéro de priorité, `title={<><span className="mono">{pattern}</span> → <EnvelopeTag … /></>}`, `actions` = `RowMenu` (« Monter », « Descendre », « Modifier », « Supprimer » `danger`).
- `window.confirm` (ligne 135) remplacé par `ConfirmDialog`.
- Chargement (ligne 68) : `ListRowSkeleton rows={6} actions`.
- `SortingRuleDialog` : erreurs en `FieldError`.

- [ ] **Step 6: Vérifier et commiter**

Run: `npm run typecheck && npm run lint && npm test`
Vérification visuelle des 4 onglets (1440 et 390, clair et sombre) : même structure partout, formulaires à 480 px, menus ⋯, confirmations en dialogue.

```bash
git add client/src/pages/settings client/src/components/import/BankSyncPanel.tsx client/src/components/import/BankSyncPanel.module.css client/src/components/sorting
git commit -m "refactor(client): réglages en une colonne, sur l'en-tête de section, la ligne de liste et le menu d'actions"
```

---

### Task 18: Saisie rapide, Demander et derniers dialogues

**Files:**
- Modify: `client/src/components/transactions/QuickEntry.tsx`, `QuickEntry.module.css`, `QuickEntry.test.tsx`
- Modify: `client/src/components/layout/QuickAdd.tsx`, `QuickAdd.module.css`
- Modify: `client/src/components/ask/AskPanel.tsx`, `AskPanel.module.css`
- Modify: `client/src/components/ask/AskMessage.tsx`, `ActionCard.tsx`, `ActionCard.module.css`

**Interfaces:**
- Consumes: `Segmented` (avec icônes), `ChipPicker`, `Kbd`, `Button` (`text`), `Textarea`, `Notice`, `FieldError`, `PulseDot`, `KeyFigure` (`size="compact"`), `Card`.

- [ ] **Step 1: QuickEntry**

- Choix Dépense / Revenu / Virement (lignes 189-206, `.kinds`, `.kind`, `.kindActive`) : `<Segmented label="Type d’opération" value={kind} onChange={setKind} options={[{ value: 'expense', label: 'Dépense', icon: … }, …]} />` avec les icônes actuelles.
- « Aujourd'hui » / « Hier » (lignes 290-295, `.chip`) : `ChipPicker`.
- `.addNote` et `.again` (lignes 330, 353) : `Button variant="text"`.
- Suggestions (`.suggestion`, ligne 253) : `ListRow compact` cliquables dans un `<ul className="ledger">`.
- `.legend` : `GroupLabel as="p"`.
- Touches : `Kbd`.
- Erreurs : `FieldError`.
- Supprimer de `QuickEntry.module.css` tout ce qui est remplacé (lignes 8-49, 90-108, 141-151, 168-202, 241-290) et les valeurs en dur.
- Adapter `QuickEntry.test.tsx` : le choix du type passe par `getByRole('radio', { name: 'Revenu' })` (Segmented est un `radiogroup`) ; « Aujourd'hui » aussi (ChipPicker). Garder les mêmes scénarios.

- [ ] **Step 2: Demander**

- Zone de saisie (lignes 117-127, `.input`) : `Textarea` (le focus redevient jaune) ; supprimer `.input`.
- Suggestions (`.suggestion`, ligne 93) : `ListRow compact` cliquables.
- Point qui pulse (lignes 139-152) : `PulseDot label="Claude réfléchit"`.
- Erreur (lignes 194-204) : `Notice tone="negative"`.
- Titre du panneau : `SectionHeader` n'est pas adapté à un en-tête de panneau. Garder le titre, mais au style « titre de section » (display `lg` 600, `-0.015em`).
- `AskMessage` : le chiffre (lignes 36-39) devient `<KeyFigure size="compact" label={…} figure={<Amount size="lg" … />} />`.
- `ActionCard` : `Card tone="raised" padding="sm"` au lieu du `radius-md` et du fond `paper` faits main ; erreurs en `FieldError`.

- [ ] **Step 3: Vérifier et commiter**

Run: `npm run typecheck && npm run lint && npm test`
Vérification visuelle : saisie rapide (touche N) et Demander (touche K) à 1440 et 390, en clair et en sombre. Poser une vraie question à Demander, ce qui nécessite `PATH` avec `~/.local/bin` (voir Task 0).

```bash
git add client/src/components/transactions/QuickEntry.tsx client/src/components/transactions/QuickEntry.module.css client/src/components/transactions/QuickEntry.test.tsx client/src/components/layout/QuickAdd.tsx client/src/components/layout/QuickAdd.module.css client/src/components/ask
git commit -m "refactor(client): saisie rapide et Demander sur les contrôles, bandeaux et chiffre clé partagés"
```

---

### Task 19: Nettoyage et garde-fou CSS

**Files:**
- Modify: `client/src/styles/global.css`
- Modify: `client/src/components/ui/Skeleton.tsx`, `Skeleton.module.css`, `index.ts`
- Create: `client/src/styles/css-guard.test.ts`
- Modify: tout module qui fait échouer le garde-fou

- [ ] **Step 1: Écrire le garde-fou**

`client/src/styles/css-guard.test.ts` :

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));

/** Valeurs en dur interdites hors de tokens.css : tout passe par un token. */
const RULES: { name: string; pattern: RegExp }[] = [
  { name: 'couleur hex', pattern: /#[0-9a-fA-F]{3,8}\b/ },
  { name: 'couleur rgb/hsl', pattern: /\b(rgba?|hsla?)\(/ },
  { name: 'taille de police en dur', pattern: /font-size:\s*[\d.]+(px|rem|em)/ },
  { name: 'rayon en px', pattern: /border-radius:[^;]*\b\d+px/ },
  { name: 'ombre en dur', pattern: /box-shadow:\s*(?!var\(|none|inset 0 2px 0 var\()[^;]*\d+px/ },
];

/**
 * Exceptions justifiées, fichier par fichier. Chaque entrée dit pourquoi.
 * Une nouvelle exception doit rester rare : préférer un token.
 */
const ALLOWED: Record<string, string[]> = {
  'styles/tokens.css': ['couleur hex', 'couleur rgb/hsl', 'taille de police en dur', 'ombre en dur'],
};

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return cssFiles(path);
    return name.endsWith('.css') ? [path] : [];
  });
}

describe('CSS sans valeur en dur', () => {
  for (const file of cssFiles(root)) {
    const rel = relative(root, file);
    it(rel, () => {
      const allowed = ALLOWED[rel] ?? [];
      const offenders = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .flatMap((line, i) => RULES.filter((r) => !allowed.includes(r.name) && r.pattern.test(line)).map((r) => `${rel}:${i + 1} ${r.name} : ${line.trim()}`));
      expect(offenders).toEqual([]);
    });
  }
});
```

- [ ] **Step 2: Lancer le garde-fou**

Run: `npx vitest run client/src/styles/css-guard.test.ts`
Expected: la liste des fichiers encore fautifs. Pour chacun, remplacer la valeur par un token, ou par `color-mix(in oklab, var(--…) x%, transparent)` pour un voile.
Les rayons de 1 ou 2 px des marqueurs passent à `var(--radius-sm)` ou `var(--s-half)`.
N'ajouter une entrée à `ALLOWED` qu'en dernier recours, avec un commentaire qui dit pourquoi (par exemple un rendu de graphique qui exige un px exact).
Les couleurs d'enveloppes viennent de la base et sont posées en `style` inline, donc elles ne passent pas par les CSS et ne sont pas concernées.

- [ ] **Step 3: Supprimer les restes**

- `global.css` : supprimer `.page-header` et ses règles (désormais dans `PageHeader.module.css`), `.section-title`, `.section-title h2`, `.section-link` et leurs variantes. Garder `.eyebrow`, `.ledger`, `.hover-row`, `.stagger`, `.page`, `.num`, `.mono`, `.muted`, les utilitaires de mise en page.
- Corriger le commentaire de `.mono` : `/* Identifiants techniques : IBAN, tickers, motifs, noms de fichier, axes de graphiques */`.
- `Skeleton.tsx` : supprimer `SkeletonRows` (remplacé par `ListRowSkeleton`) et `.rows` ; le retirer de `index.ts`.
- Vérifier qu'il ne reste aucun usage :

```bash
grep -rnE "section-title|section-link|page-header|SkeletonRows|window\.confirm|className=\{styles\.error\}" client/src
```

Expected: aucune ligne.

```bash
grep -rn "letter-spacing: 0.0[67]em" client/src
```

Expected: aucune ligne (tous les libellés en capitales sont en `0.08em` via `.eyebrow`, `GroupLabel` ou `ColumnHeader`).

Le libellé de `Field` et de `FormSection` (`0.07em`) passe à `0.08em`.

- [ ] **Step 4: Tout lancer**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS, garde-fou compris.

- [ ] **Step 5: Commit**

```bash
git add client/src
git commit -m "chore(client): classes globales obsolètes retirées et garde-fou contre les valeurs CSS en dur"
```

---

### Task 20: Recette visuelle finale

**Files:** aucun, sauf corrections.

- [ ] **Step 1: Captures d'après**

Refaire toutes les captures de la Task 0, Step 5, dans `tmp/e2e/apres/`.

- [ ] **Step 2: Revue écran par écran**

Pour chaque écran, comparer avant et après, et vérifier face au design system :
- même en-tête de page, même rythme vertical (`s-10` entre sections) ;
- un seul jaune par écran ;
- aucune rangée d'icônes sur les lignes, seulement le menu ⋯ ;
- lignes à 56 px (44 px dans les dialogues), dates au même format ;
- squelettes de la bonne hauteur (recharger avec le réseau ralenti) ;
- mode sombre correct partout, y compris les nouveaux tokens ;
- mobile à 390 px : rien ne déborde, les menus restent dans l'écran (le `position-try-fallbacks` les retourne vers le haut en bas de page).

Corriger chaque défaut dans un commit `fix(client): …`.

- [ ] **Step 3: Accessibilité**

Avec le skill `chrome-devtools-mcp:a11y-debugging`, sur `/`, `/budget` et `/reglages/regles` :
- navigation au clavier dans un RowMenu ;
- focus visible jaune partout ;
- contraste des libellés `ink-mute` sur `paper-sunken`.

- [ ] **Step 4: Dernière vérification**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: tout passe.

- [ ] **Step 5: Arrêter l'app de recette**

Arrêter les deux processus lancés à la Task 0 (`kill` des PID du serveur et de Vite). La copie de base `tmp/e2e/runway.db` reste dans `tmp/` (gitignoré).
