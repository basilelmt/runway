# Refonte des dialogues et des champs - plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner à tous les formulaires de Runway le langage de la saisie rapide : champs soulignés dans les formulaires, pastilles dans les barres d'outils, calendrier en français, dialogue au pied de page unifié.

**Architecture:** Les briques vivent dans `client/src/components/ui` (champs, `DateField`, `ChipPicker`, `AmountHero`, pastilles, `Dialog` avec `DialogFooter` en portail, `ConfirmDialog`).
Chaque formulaire de dialogue rend ses boutons dans `<DialogFooter>`, qui les téléporte dans le pied du `Dialog` ; le bouton d'envoi est relié au formulaire par `form="<id>"`.
`TransactionForm` disparaît : `QuickEntry` gère création et modification, `AllocationForm` gère les répartitions.

**Tech Stack:** React 19, CSS Modules, Vite 8, Vitest 5 + Testing Library + jsdom, `@daypicker/react` 10 (nouvelle dépendance), `date-fns` 4 (déjà présent), `lucide-react`.

**Spec :** `docs/superpowers/specs/2026-10-07-dialogues-champs.md`.

## Global Constraints

- Toutes les commandes se lancent depuis la racine du worktree : `/home/basile/projects/runway/.claude/worktrees/dialog-fields-redesign`.
- Ne jamais écrire dans `/tmp` ; fichiers temporaires dans `tmp/` (ignoré par git).
- Ne jamais toucher `/home/basile/projects/runway/data/runway.db` (base réelle) : la vérification E2E travaille sur une copie.
- Pas de tiret cadratin « — » dans le code, les commentaires, les messages de commit ; utiliser « - ».
- Messages de commit en français, style du dépôt (`feat(client): ...`, `refactor(client): ...`), sans co-auteur.
- Textes d'interface en français, apostrophe typographique `’` dans les nouveaux libellés.
- Toutes les couleurs passent par les variables de `client/src/styles/tokens.css` (le mode sombre suit).
- Le lint interdit les `setState` synchrones dans le corps d'un `useEffect` (règles `react-hooks` v7) : ajuster l'état pendant le rendu ou dans des callbacks.
- Vérifications à chaque tâche : `npm test`, et en fin de tâche `npm run typecheck` et `npm run lint`.
- Le spec nomme `SectionLabel` l'intertitre de formulaire : il est implémenté sous le nom `FormSection` (un `<fieldset>` + `<legend>`, plus accessible).
- Le filtre « Statut » des opérations reste un `Segmented` (déjà de la famille pastille) ; seuls compte et enveloppe deviennent des `FilterPill`.
- Ajout hors spec mais dans son esprit : un composant `Checkbox` partagé remplace les deux cases à cocher dupliquées (enveloppe d'épargne, compte d'épargne).

---

### Task 1: Socle des champs soulignés

**Files:**
- Modify: `client/src/test-setup.ts`
- Modify: `client/src/components/ui/Field.tsx`, `client/src/components/ui/Field.module.css`
- Modify: `client/src/components/ui/Input.tsx`, `client/src/components/ui/Input.module.css`
- Create: `client/src/components/ui/Checkbox.tsx`, `client/src/components/ui/Checkbox.module.css`
- Create: `client/src/components/ui/FormSection.tsx`, `client/src/components/ui/FormSection.module.css`
- Modify: `client/src/components/ui/index.ts`
- Modify: `client/src/components/ui/MoneyInput.test.tsx` (le test du `Dialog` part en tâche 5, on retire seulement ses polyfills ici)
- Modify: `client/src/pages/settings/Bank.tsx:124` (clé PEM en mono)
- Test: `client/src/components/ui/Field.test.tsx`

**Interfaces:**
- Produces: `Field` dont `children` reçoit `(id: string, describedBy: string | undefined, labelId: string)`.
- Produces: variables CSS posées par `Field` et lues par tous les contrôles : `--line`, `--line-hover`, `--line-focus`, `--line-accent`.
- Produces: `Textarea` accepte `mono?: boolean`.
- Produces: `Checkbox({ label: string; hint?: string } & InputHTMLAttributes)`, `FormSection({ title: string; children: ReactNode })`.
- Produces: polyfills de test pour `HTMLDialogElement.showModal/close` et l'API `popover` (`showPopover`, `hidePopover`, `togglePopover`, clic sur `[popovertarget]`, Échap), utilisés par les tâches 2, 5 et suivantes.

- [ ] **Step 1: Polyfills jsdom dans `client/src/test-setup.ts`**

Remplacer tout le fichier par :

```ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(cleanup);

// jsdom ne connaît ni la modale native ni l'API popover : on simule ce que fait le navigateur.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
}

if (!('showPopover' in HTMLElement.prototype)) {
  const setOpen = (el: HTMLElement, open: boolean) => {
    const wasOpen = el.hasAttribute('data-popover-open');
    if (wasOpen === open) return;
    el.toggleAttribute('data-popover-open', open);
    const event = new Event('toggle');
    Object.assign(event, { oldState: wasOpen ? 'open' : 'closed', newState: open ? 'open' : 'closed' });
    el.dispatchEvent(event);
  };
  Object.assign(HTMLElement.prototype, {
    showPopover(this: HTMLElement) {
      setOpen(this, true);
    },
    hidePopover(this: HTMLElement) {
      setOpen(this, false);
    },
    togglePopover(this: HTMLElement, force?: boolean) {
      const next = force ?? !this.hasAttribute('data-popover-open');
      setOpen(this, next);
      return next;
    },
  });
  // Un bouton `popovertarget` ouvre ou ferme sa cible, Échap ferme la dernière ouverte et rend le focus.
  document.addEventListener('click', (e) => {
    const invoker = (e.target as Element | null)?.closest?.('[popovertarget]');
    const target = invoker ? document.getElementById(invoker.getAttribute('popovertarget')!) : null;
    target?.togglePopover();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const open = Array.from(document.querySelectorAll<HTMLElement>('[data-popover-open]')).at(-1);
    if (!open) return;
    open.hidePopover();
    document.querySelector<HTMLElement>(`[popovertarget="${open.id}"]`)?.focus();
  });
}
```

- [ ] **Step 2: Écrire le test qui échoue `client/src/components/ui/Field.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Checkbox } from './Checkbox';
import { Field } from './Field';
import { FormSection } from './FormSection';
import { Input, Textarea } from './Input';

describe('Field', () => {
  it('relie le label, l’aide et le champ', () => {
    render(<Field label="Nom" hint="Ex. Loyer">{(id, describedBy) => <Input id={id} aria-describedby={describedBy} />}</Field>);
    const input = screen.getByLabelText('Nom');
    expect(input).toHaveAccessibleDescription('Ex. Loyer');
  });

  it('remplace l’aide par l’erreur, annoncée', () => {
    render(
      <Field label="Nom" hint="Ex. Loyer" error="Nom requis">
        {(id, describedBy) => <Input id={id} aria-describedby={describedBy} />}
      </Field>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Nom requis');
    expect(screen.queryByText('Ex. Loyer')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Nom')).toHaveAccessibleDescription('Nom requis');
  });

  it('fournit l’id du label pour nommer un groupe', () => {
    render(<Field label="Enveloppe">{(_id, _d, labelId) => <div role="radiogroup" aria-labelledby={labelId} />}</Field>);
    expect(screen.getByRole('radiogroup', { name: 'Enveloppe' })).toBeInTheDocument();
  });
});

describe('Textarea', () => {
  it('passe en mono à la demande', () => {
    render(<Textarea aria-label="Clé" mono />);
    expect(screen.getByLabelText('Clé').className).toMatch(/mono/);
  });
});

describe('Checkbox', () => {
  it('se coche en cliquant sur son libellé et décrit son aide', async () => {
    render(<Checkbox label="Compte d’épargne" hint="Hors budget" />);
    const box = screen.getByRole('checkbox', { name: /Compte d’épargne/ });
    await userEvent.click(screen.getByText('Compte d’épargne'));
    expect(box).toBeChecked();
    expect(screen.getByText('Hors budget')).toBeInTheDocument();
  });
});

describe('FormSection', () => {
  it('regroupe les champs sous un intertitre', () => {
    render(
      <FormSection title="Quand">
        <Input aria-label="Jour" />
      </FormSection>,
    );
    expect(screen.getByRole('group', { name: 'Quand' })).toContainElement(screen.getByLabelText('Jour'));
  });
});
```

- [ ] **Step 3: Lancer le test, il doit échouer**

Run: `npx vitest run client/src/components/ui/Field.test.tsx`
Expected: FAIL, `Failed to resolve import "./Checkbox"`.

- [ ] **Step 4: `Field.tsx`**

```tsx
import { useId, type ReactNode } from 'react';
import styles from './Field.module.css';

type FieldProps = {
  label: string;
  hint?: string;
  error?: string | null;
  /** `labelId` nomme les groupes (pastilles) qu'un `<label for>` ne peut pas nommer. */
  children: (id: string, describedBy: string | undefined, labelId: string) => ReactNode;
  className?: string;
};

/** Étiquette, champ, aide et erreur, reliés par les attributs ARIA. */
export function Field({ label, hint, error, children, className }: FieldProps) {
  const id = useId();
  const labelId = `${id}-label`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint && !error ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={[styles.field, error ? styles.invalid : '', className ?? ''].join(' ')}>
      <label id={labelId} htmlFor={id} className={styles.label}>
        {label}
      </label>
      {children(id, describedBy, labelId)}
      {hint && !error ? (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: `Field.module.css`**

```css
/* Les contrôles lisent ces variables : le trait suit l'état du champ. */
.field {
  --line: var(--rule-strong);
  --line-hover: var(--ink-mute);
  --line-focus: var(--ink);
  --line-accent: var(--marking);
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.invalid {
  --line: var(--negative);
  --line-hover: var(--negative);
  --line-focus: var(--negative);
  --line-accent: transparent;
}

.label {
  font-size: var(--text-xs);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--ink-mute);
  transition: color var(--dur) var(--ease-out);
}

.field:focus-within .label {
  color: var(--ink);
}

.invalid .label,
.invalid:focus-within .label {
  color: var(--negative);
}

.hint,
.error {
  margin-top: 2px;
  font-size: var(--text-xs);
}

.hint {
  color: var(--ink-mute);
}

.error {
  color: var(--negative);
}
```

- [ ] **Step 6: `Input.tsx`**

```tsx
import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import styles from './Input.module.css';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={[styles.input, className ?? ''].join(' ')} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...rest }, ref) {
  return <select ref={ref} className={[styles.input, styles.select, className ?? ''].join(' ')} {...rest} />;
});

export const DateInput = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>>(function DateInput(props, ref) {
  return <Input ref={ref} type="date" {...props} />;
});

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  /** Contenu technique (clé, motif) : police mono. */
  mono?: boolean;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ className, mono = false, ...rest }, ref) {
  return <textarea ref={ref} className={[styles.input, styles.textarea, mono ? styles.mono : '', className ?? ''].join(' ')} {...rest} />;
});
```

`DateInput` reste exporté jusqu'à la tâche 12, qui le supprime.

- [ ] **Step 7: `Input.module.css`**

```css
/* Champ « registre » : pas de cadre, un trait de base qui suit l'état du `Field`. */
.input {
  width: 100%;
  height: 38px;
  padding: 0;
  border: none;
  border-bottom: 1px solid var(--line, var(--rule-strong));
  border-radius: 0;
  background: transparent;
  color: var(--ink);
  font-size: 1rem;
  transition:
    border-color var(--dur) var(--ease-out),
    box-shadow var(--dur) var(--ease-out);
}

.input::placeholder {
  color: var(--ink-mute);
}

.input:hover:not(:disabled) {
  border-bottom-color: var(--line-hover, var(--ink-mute));
}

.input:focus,
.input:focus-visible {
  outline: none;
  border-bottom-color: var(--line-focus, var(--ink));
  box-shadow:
    inset 0 -1px 0 var(--line-focus, var(--ink)),
    0 2px 0 var(--line-accent, var(--marking));
}

.input[aria-invalid='true'] {
  border-bottom-color: var(--negative);
}

.input:disabled {
  opacity: 0.5;
  border-bottom-style: dashed;
  cursor: not-allowed;
}

.select {
  appearance: none;
  padding-right: var(--s-6);
  text-overflow: ellipsis;
  cursor: pointer;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'><path d='M1 1l5 5 5-5' fill='none' stroke='%2376827d' stroke-width='1.6' stroke-linecap='round'/></svg>");
  background-repeat: no-repeat;
  background-position: right 2px center;
}

.select option {
  color: var(--ink);
  background: var(--paper-raised);
}

.textarea {
  height: auto;
  min-height: calc(2lh + 2 * var(--s-2));
  max-height: 20lh;
  padding: var(--s-2) 0;
  line-height: 1.5;
  resize: none;
  field-sizing: content;
}

.mono {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}

.money {
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum';
  text-align: right;
}

.moneyWrap {
  position: relative;
  display: block;
}

.moneyWrap .money {
  padding-right: var(--s-5);
}

.moneyWrap::after {
  content: '€';
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  color: var(--ink-mute);
  pointer-events: none;
}
```

- [ ] **Step 8: `Checkbox.tsx` et `Checkbox.module.css`**

```tsx
import type { InputHTMLAttributes } from 'react';
import styles from './Checkbox.module.css';

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: string;
  hint?: string;
};

/** Case à cocher avec son libellé et une ligne d'explication. */
export function Checkbox({ label, hint, className, ...rest }: CheckboxProps) {
  return (
    <label className={[styles.check, className ?? ''].join(' ')}>
      <input type="checkbox" className={styles.box} {...rest} />
      <span className={styles.text}>
        {label}
        {hint ? <span className={styles.hint}>{hint}</span> : null}
      </span>
    </label>
  );
}
```

```css
.check {
  display: flex;
  align-items: flex-start;
  gap: var(--s-3);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--ink-soft);
  cursor: pointer;
}

.box {
  flex: none;
  width: 16px;
  height: 16px;
  margin: 3px 0 0;
  accent-color: var(--ink);
  cursor: pointer;
}

.text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.hint {
  font-weight: 400;
  font-size: var(--text-xs);
  color: var(--ink-mute);
}
```

- [ ] **Step 9: `FormSection.tsx` et `FormSection.module.css`**

```tsx
import type { ReactNode } from 'react';
import styles from './FormSection.module.css';

/** Groupe de champs sous un intertitre en petites capitales suivi d'un filet. */
export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className={styles.section}>
      <legend className={styles.title}>{title}</legend>
      <div className={styles.body}>{children}</div>
    </fieldset>
  );
}
```

```css
.section {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: none;
}

.title {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  width: 100%;
  padding: 0;
  margin-bottom: var(--s-4);
  font-size: var(--text-xs);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--ink-mute);
}

.title::after {
  content: '';
  flex: 1;
  border-top: 1px solid var(--rule);
}

.body {
  display: flex;
  flex-direction: column;
  gap: var(--s-4);
}
```

- [ ] **Step 10: Exports et retrait des polyfills devenus globaux**

Dans `client/src/components/ui/index.ts`, ajouter après la ligne `export { Card } from './Card';` :

```ts
export { Checkbox } from './Checkbox';
```

et après `export { Field } from './Field';` :

```ts
export { FormSection } from './FormSection';
```

Dans `client/src/components/ui/MoneyInput.test.tsx`, supprimer le bloc de polyfills du test `Dialog` (les lignes `HTMLDialogElement.prototype.showModal ??= ...` et `HTMLDialogElement.prototype.close ??= ...`), le setup global les fournit.

Dans `client/src/pages/settings/Bank.tsx`, ajouter `mono` au `Textarea` de la clé privée :

```tsx
<Textarea id={id} aria-describedby={describedBy} mono value={privateKey} onChange={(e) => setPrivateKey(e.target.value)} placeholder={'-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----'} spellCheck={false} />
```

- [ ] **Step 11: Lancer les tests**

Run: `npm test`
Expected: PASS, dont les 6 nouveaux tests de `Field.test.tsx`.

- [ ] **Step 12: Typecheck, lint, commit**

Run: `npm run typecheck && npm run lint`
Expected: aucune erreur.

```bash
git add client/src/test-setup.ts client/src/components/ui client/src/pages/settings/Bank.tsx
git commit -m "feat(client): champs soulignés, case à cocher et section de formulaire partagées"
```

---

### Task 2: `DateField` et `DateRangeField` en français

**Files:**
- Modify: `package.json`, `package-lock.json` (dépendance `@daypicker/react`)
- Modify: `shared/dates.ts`, `shared/dates.test.ts`
- Create: `client/src/components/ui/DateField.tsx`, `client/src/components/ui/DateField.module.css`
- Modify: `client/src/components/ui/index.ts`
- Test: `client/src/components/ui/DateField.test.tsx`

**Interfaces:**
- Consumes: polyfills popover de la tâche 1, variables `--line*` de `Field`.
- Produces (`shared/dates.ts`): `formatDateWithWeekday(iso: ISODate): string` (« jeu. 1 oct. 2026 »), `formatDateMedium(iso: ISODate): string` (« 1 oct. 2026 »).
- Produces (`ui`):
  - `DateField(props: { value: string | null; onChange: (value: string | null) => void; id?: string; 'aria-label'?: string; 'aria-describedby'?: string; placeholder?: string; clearable?: boolean; shortcuts?: boolean; min?: string; max?: string; variant?: 'line' | 'pill'; className?: string })`.
  - `DateRangeField(props: { from: string | null; to: string | null; onChange: (range: { from: string | null; to: string | null }) => void; id?; 'aria-label'?; 'aria-describedby'?; placeholder?; min?; max?; variant?; className? })`.

- [ ] **Step 1: Installer la dépendance**

Run: `npm install @daypicker/react@10.0.2`
Expected: `package.json` liste `"@daypicker/react": "^10.0.2"` dans `dependencies`.

- [ ] **Step 2: Tests qui échouent pour les formats de date**

Dans `shared/dates.test.ts`, ajouter `formatDateMedium` et `formatDateWithWeekday` à la liste d'import depuis `./dates`, puis en fin de fichier :

```ts
describe('formats de date des champs', () => {
  it('affiche le jour de la semaine en français', () => {
    expect(formatDateWithWeekday('2026-10-01')).toBe('jeu. 1 oct. 2026');
  });

  it('affiche une date moyenne avec l’année', () => {
    expect(formatDateMedium('2026-10-01')).toBe('1 oct. 2026');
  });
});
```

Run: `npx vitest run shared/dates.test.ts`
Expected: FAIL, `formatDateWithWeekday is not a function` (ou erreur d'import).

- [ ] **Step 3: Implémenter les formats dans `shared/dates.ts`**

Après `const monthFormatter = ...`, ajouter :

```ts
const weekdayFormatter = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const mediumFormatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
```

Après `formatDateShort`, ajouter :

```ts
/** « jeu. 1 oct. 2026 », pour les champs de date. */
export function formatDateWithWeekday(iso: ISODate): string {
  return weekdayFormatter.format(toUTC(iso));
}

/** « 1 oct. 2026 ». */
export function formatDateMedium(iso: ISODate): string {
  return mediumFormatter.format(toUTC(iso));
}
```

Run: `npx vitest run shared/dates.test.ts`
Expected: PASS.

- [ ] **Step 4: Tests qui échouent pour `DateField`**

`client/src/components/ui/DateField.test.tsx` :

```tsx
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fromParts, parts, today } from '@shared/dates';
import { DateField, DateRangeField } from './DateField';

const longDay = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Nom accessible d'un jour du calendrier : « … 15 octobre 2026 … ». */
function dayName(iso: string): RegExp {
  const { year, month, day } = parts(iso);
  return new RegExp(longDay.format(new Date(Date.UTC(year, month - 1, day, 12))));
}

function SingleHarness({ initial, onChange, ...rest }: { initial: string | null; onChange: (v: string | null) => void; clearable?: boolean; placeholder?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <DateField
      aria-label="Date"
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange(v);
      }}
      {...rest}
    />
  );
}

describe('DateField', () => {
  it('affiche la date en français, ou le texte de remplacement', () => {
    const { rerender } = render(<DateField aria-label="Date" value="2026-10-01" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Date' })).toHaveTextContent('jeu. 1 oct. 2026');
    rerender(<DateField aria-label="Date" value={null} placeholder="Sans fin" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Date' })).toHaveTextContent('Sans fin');
  });

  it('choisit un jour dans le calendrier puis se ferme', async () => {
    const onChange = vi.fn();
    render(<SingleHarness initial="2026-10-01" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Date' }));
    await userEvent.click(screen.getByRole('button', { name: dayName('2026-10-15') }));
    expect(onChange).toHaveBeenLastCalledWith('2026-10-15');
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Date' })).toHaveTextContent('jeu. 15 oct. 2026');
  });

  it('propose Aujourd’hui et Effacer', async () => {
    const onChange = vi.fn();
    render(<SingleHarness initial="2026-10-01" onChange={onChange} clearable placeholder="Sans fin" />);
    await userEvent.click(screen.getByRole('button', { name: 'Date' }));
    await userEvent.click(screen.getByRole('button', { name: 'Aujourd’hui' }));
    expect(onChange).toHaveBeenLastCalledWith(today());
    await userEvent.click(screen.getByRole('button', { name: 'Date' }));
    await userEvent.click(screen.getByRole('button', { name: 'Effacer' }));
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole('button', { name: 'Date' })).toHaveTextContent('Sans fin');
  });

  it('se ferme sur Échap sans rien changer et rend le focus', async () => {
    const onChange = vi.fn();
    render(<SingleHarness initial="2026-10-01" onChange={onChange} />);
    const trigger = screen.getByRole('button', { name: 'Date' });
    await userEvent.click(trigger);
    expect(screen.getByRole('grid')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('DateRangeField', () => {
  it('choisit une période en deux clics', async () => {
    const onChange = vi.fn();
    function Harness() {
      const [range, setRange] = useState<{ from: string | null; to: string | null }>({ from: null, to: null });
      return (
        <DateRangeField
          aria-label="Période"
          from={range.from}
          to={range.to}
          onChange={(r) => {
            setRange(r);
            onChange(r);
          }}
        />
      );
    }
    render(<Harness />);
    const { year, month } = parts(today());
    const start = fromParts(year, month, 10);
    const end = fromParts(year, month, 12);
    await userEvent.click(screen.getByRole('button', { name: 'Période' }));
    const grid = screen.getByRole('grid');
    await userEvent.click(within(grid).getByRole('button', { name: dayName(start) }));
    await userEvent.click(within(grid).getByRole('button', { name: dayName(end) }));
    expect(onChange).toHaveBeenLastCalledWith({ from: start, to: end });
  });
});
```

Run: `npx vitest run client/src/components/ui/DateField.test.tsx`
Expected: FAIL, `Failed to resolve import "./DateField"`.

- [ ] **Step 5: `DateField.tsx`**

```tsx
import { DayPicker, type ClassNames, type DateRange } from '@daypicker/react';
import { fr } from '@daypicker/react/locale/fr';
import { ChevronDown } from 'lucide-react';
import { useId, useRef, useState, type CSSProperties, type ReactNode, type ToggleEvent } from 'react';
import { addDays, formatDateWithWeekday, parts, today, toISODate } from '@shared/dates';
import { formatDateCompact } from '@/lib/format';
import styles from './DateField.module.css';

type Variant = 'line' | 'pill';

type CommonProps = {
  id?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  placeholder?: string;
  min?: string;
  max?: string;
  variant?: Variant;
  className?: string;
};

export type DateFieldProps = CommonProps & {
  value: string | null;
  onChange: (value: string | null) => void;
  /** Propose « Effacer » : pour une date facultative. */
  clearable?: boolean;
  /** Raccourcis « Aujourd’hui » et « Hier ». */
  shortcuts?: boolean;
};

export type DateRangeFieldProps = CommonProps & {
  from: string | null;
  to: string | null;
  onChange: (range: { from: string | null; to: string | null }) => void;
};

const CALENDAR_CLASSES: Partial<ClassNames> = {
  root: styles.calendar,
  months: styles.months,
  month: styles.month,
  month_caption: styles.caption,
  caption_label: styles.captionLabel,
  nav: styles.nav,
  button_previous: styles.navButton,
  button_next: styles.navButton,
  chevron: styles.chevron,
  month_grid: styles.grid,
  weekdays: styles.weekdays,
  weekday: styles.weekday,
  week: styles.week,
  day: styles.day,
  day_button: styles.dayButton,
  today: styles.today,
  selected: styles.selected,
  outside: styles.outside,
  disabled: styles.disabled,
  hidden: styles.hidden,
  range_start: styles.rangeStart,
  range_middle: styles.rangeMiddle,
  range_end: styles.rangeEnd,
};

function toDate(iso: string): Date {
  const { year, month, day } = parts(iso);
  return new Date(year, month - 1, day);
}

function bounds(min?: string, max?: string) {
  return [...(min ? [{ before: toDate(min) }] : []), ...(max ? [{ after: toDate(max) }] : [])];
}

/** Ancre CSS propre à chaque champ : le calendrier se place sous son bouton. */
function anchor(name: string, property: 'anchorName' | 'positionAnchor'): CSSProperties {
  return { [property]: name } as unknown as CSSProperties;
}

type PopoverFieldProps = CommonProps & {
  filled: boolean;
  text: string;
  children: (close: () => void) => ReactNode;
};

/** Bouton qui ouvre un calendrier en popover natif, au-dessus du dialogue qui le contient. */
function PopoverField({ id, placeholder, variant = 'line', className, filled, text, children, ...aria }: PopoverFieldProps) {
  const reactId = useId();
  const popoverId = `date-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const popover = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const close = () => popover.current?.hidePopover();

  return (
    <>
      <button
        type="button"
        id={id}
        className={[styles.trigger, styles[variant], filled ? styles.filled : '', className ?? ''].join(' ')}
        popoverTarget={popoverId}
        aria-haspopup="dialog"
        aria-expanded={open}
        style={anchor(`--${popoverId}`, 'anchorName')}
        {...aria}
      >
        <span className={filled ? styles.value : styles.placeholder}>{filled ? text : placeholder}</span>
        <ChevronDown aria-hidden className={styles.caret} />
      </button>
      <div
        ref={popover}
        id={popoverId}
        popover="auto"
        role="dialog"
        aria-label="Calendrier"
        className={styles.popover}
        style={anchor(`--${popoverId}`, 'positionAnchor')}
        onToggle={(e: ToggleEvent<HTMLDivElement>) => setOpen(e.newState === 'open')}
      >
        {open ? children(close) : null}
      </div>
    </>
  );
}

/** Date en français (« jeu. 1 oct. 2026 ») avec calendrier ; valeur ISO `YYYY-MM-DD` ou null. */
export function DateField({ value, onChange, clearable = false, shortcuts = true, placeholder = 'Choisir une date', min, max, ...rest }: DateFieldProps) {
  const yesterday = addDays(today(), -1);
  const inBounds = (iso: string) => (!min || iso >= min) && (!max || iso <= max);
  return (
    <PopoverField {...rest} placeholder={placeholder} filled={value !== null} text={value ? formatDateWithWeekday(value) : ''}>
      {(close) => {
        const pick = (iso: string | null) => {
          onChange(iso);
          close();
        };
        return (
          <>
            <DayPicker
              mode="single"
              locale={fr}
              weekStartsOn={1}
              navLayout="around"
              showOutsideDays
              autoFocus
              selected={value ? toDate(value) : undefined}
              defaultMonth={value ? toDate(value) : new Date()}
              disabled={bounds(min, max)}
              onSelect={(d) => d && pick(toISODate(d))}
              classNames={CALENDAR_CLASSES}
            />
            {shortcuts || clearable ? (
              <div className={styles.shortcuts}>
                {shortcuts && inBounds(today()) ? (
                  <button type="button" className={styles.shortcut} onClick={() => pick(today())}>
                    Aujourd’hui
                  </button>
                ) : null}
                {shortcuts && inBounds(yesterday) ? (
                  <button type="button" className={styles.shortcut} onClick={() => pick(yesterday)}>
                    Hier
                  </button>
                ) : null}
                {clearable && value !== null ? (
                  <button type="button" className={[styles.shortcut, styles.clear].join(' ')} onClick={() => pick(null)}>
                    Effacer
                  </button>
                ) : null}
              </div>
            ) : null}
          </>
        );
      }}
    </PopoverField>
  );
}

function rangeText(from: string | null, to: string | null): string {
  if (from && to) return from === to ? `Le ${formatDateCompact(from)}` : `Du ${formatDateCompact(from)} au ${formatDateCompact(to)}`;
  if (from) return `Depuis le ${formatDateCompact(from)}`;
  return '';
}

/** Période en deux clics dans un même calendrier. */
export function DateRangeField({ from, to, onChange, placeholder = 'Choisir des dates', min, max, ...rest }: DateRangeFieldProps) {
  return (
    <PopoverField {...rest} placeholder={placeholder} filled={from !== null} text={rangeText(from, to)}>
      {(close) => (
        <DayPicker
          mode="range"
          locale={fr}
          weekStartsOn={1}
          navLayout="around"
          showOutsideDays
          autoFocus
          selected={from ? { from: toDate(from), to: to ? toDate(to) : undefined } : undefined}
          defaultMonth={from ? toDate(from) : new Date()}
          disabled={bounds(min, max)}
          onSelect={(range: DateRange | undefined) => {
            const next = { from: range?.from ? toISODate(range.from) : null, to: range?.to ? toISODate(range.to) : null };
            onChange(next);
            if (next.from && next.to && next.from !== next.to) close();
          }}
          classNames={CALENDAR_CLASSES}
        />
      )}
    </PopoverField>
  );
}
```

Si `typecheck` signale que `ToggleEvent` n'est pas exporté par `react` dans la version installée, utiliser `onToggle={(e) => setOpen((e.nativeEvent as globalThis.ToggleEvent).newState === 'open')}` et retirer l'import.

- [ ] **Step 6: `DateField.module.css`**

```css
/* Bouton : même trait que les champs, ou pastille dans les barres d'outils */
.trigger {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-2);
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--ink);
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
  transition:
    border-color var(--dur) var(--ease-out),
    box-shadow var(--dur) var(--ease-out),
    background var(--dur) var(--ease-out);
}

.trigger:focus-visible {
  outline: none;
}

.line {
  width: 100%;
  height: 38px;
  padding: 0;
  border-bottom: 1px solid var(--line, var(--rule-strong));
  border-radius: 0;
  font-size: 1rem;
}

.line:hover {
  border-bottom-color: var(--line-hover, var(--ink-mute));
}

.line:focus-visible,
.line[aria-expanded='true'] {
  border-bottom-color: var(--line-focus, var(--ink));
  box-shadow:
    inset 0 -1px 0 var(--line-focus, var(--ink)),
    0 2px 0 var(--line-accent, var(--marking));
}

.pill {
  height: 34px;
  padding: 0 var(--s-3) 0 var(--s-4);
  border-radius: var(--radius-pill);
  background: var(--paper-sunken);
  color: var(--ink-soft);
  font-size: var(--text-sm);
}

.pill:hover {
  color: var(--ink);
}

.pill.filled {
  background: var(--ink);
  color: var(--paper);
}

.pill:focus-visible {
  box-shadow:
    0 0 0 2px var(--paper),
    0 0 0 4px var(--marking);
}

.value {
  overflow: hidden;
  text-overflow: ellipsis;
}

.placeholder {
  color: var(--ink-mute);
}

.pill .placeholder {
  color: inherit;
}

.caret {
  flex: none;
  width: 14px;
  height: 14px;
  color: var(--ink-mute);
  transition: transform var(--dur) var(--ease-out);
}

.pill.filled .caret {
  color: var(--rule-strong);
}

.trigger[aria-expanded='true'] .caret {
  transform: rotate(180deg);
}

/* Calendrier en popover, placé sous son bouton (au-dessus s'il manque de place) */
.popover {
  inset: auto;
  top: anchor(bottom);
  left: anchor(left);
  margin: var(--s-2) 0;
  position-try-fallbacks: flip-block, flip-inline;
  width: 280px;
  padding: var(--s-3);
  border: 1px solid var(--rule);
  border-radius: var(--radius-lg);
  background: var(--paper-raised);
  color: var(--ink);
  box-shadow: var(--shadow-pop);
}

.calendar {
  font-size: var(--text-sm);
}

.month {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  row-gap: var(--s-2);
}

.caption {
  display: flex;
  justify-content: center;
}

.captionLabel {
  font-family: var(--font-display);
  font-weight: 600;
  text-transform: capitalize;
}

.nav {
  display: contents;
}

.navButton {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: var(--radius-pill);
  background: none;
  color: var(--ink-soft);
}

.navButton:hover {
  background: var(--paper-sunken);
  color: var(--ink);
}

.chevron {
  width: 14px;
  height: 14px;
  fill: currentColor;
}

.grid {
  grid-column: 1 / -1;
  width: 100%;
  border-collapse: collapse;
}

.weekday {
  height: 24px;
  font-size: var(--text-xs);
  font-weight: 400;
  color: var(--ink-mute);
  text-transform: uppercase;
}

.day {
  padding: 1px;
  text-align: center;
}

.dayButton {
  width: 34px;
  height: 34px;
  border: none;
  border-radius: var(--radius-pill);
  background: none;
  color: inherit;
  font: inherit;
  font-variant-numeric: tabular-nums;
}

.dayButton:hover {
  background: var(--paper-sunken);
}

.dayButton:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
}

.today .dayButton {
  box-shadow: inset 0 0 0 1px var(--rule-strong);
}

.outside {
  color: var(--rule-strong);
}

.disabled .dayButton {
  color: var(--rule-strong);
  cursor: not-allowed;
}

.disabled .dayButton:hover {
  background: none;
}

.hidden {
  visibility: hidden;
}

.rangeMiddle {
  background: var(--paper-sunken);
}

.rangeMiddle .dayButton {
  border-radius: 0;
}

.rangeStart {
  background: linear-gradient(90deg, transparent 50%, var(--paper-sunken) 50%);
}

.rangeEnd {
  background: linear-gradient(90deg, var(--paper-sunken) 50%, transparent 50%);
}

.rangeStart.rangeEnd {
  background: none;
}

.selected:not(.rangeMiddle) .dayButton {
  background: var(--ink);
  color: var(--paper);
  font-weight: 500;
}

.shortcuts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
  margin-top: var(--s-3);
  padding-top: var(--s-3);
  border-top: 1px solid var(--rule);
}

.shortcut {
  height: 28px;
  padding: 0 var(--s-3);
  border: 1px solid var(--rule);
  border-radius: var(--radius-pill);
  background: none;
  color: var(--ink-soft);
  font-size: var(--text-sm);
}

.shortcut:hover {
  border-color: var(--rule-strong);
  color: var(--ink);
}

.clear {
  margin-left: auto;
  border-color: transparent;
  color: var(--ink-mute);
}
```

- [ ] **Step 7: Export**

Dans `client/src/components/ui/index.ts`, après `export { Dialog } from './Dialog';` :

```ts
export { DateField, DateRangeField } from './DateField';
```

- [ ] **Step 8: Lancer les tests**

Run: `npx vitest run client/src/components/ui/DateField.test.tsx shared/dates.test.ts`
Expected: PASS (5 tests `DateField`/`DateRangeField`, 2 tests de format).

Si un nom de jour ne correspond pas, inspecter le nom réel avec `screen.debug(screen.getByRole('grid'))` et ajuster `dayName` (le libellé par défaut de DayPicker en français est « jeudi 15 octobre 2026 »).

- [ ] **Step 9: Suite complète, typecheck, lint, commit**

Run: `npm test && npm run typecheck && npm run lint`
Expected: tout passe.

```bash
git add package.json package-lock.json shared/dates.ts shared/dates.test.ts client/src/components/ui
git commit -m "feat(client): champ de date en français avec calendrier en popover"
```

---

### Task 3: `ChipPicker`

**Files:**
- Create: `client/src/components/ui/ChipPicker.tsx`, `client/src/components/ui/ChipPicker.module.css`
- Modify: `client/src/components/ui/index.ts`
- Test: `client/src/components/ui/ChipPicker.test.tsx`

**Interfaces:**
- Produces: `type ChipOption<T> = { value: T; label: string; color?: string }`.
- Produces: `ChipPicker<T extends string | number | null>(props: { options: ChipOption<T>[]; value: T; onChange: (value: T) => void; id?: string; 'aria-label'?: string; 'aria-labelledby'?: string; 'aria-describedby'?: string })`, rendu en `role="radiogroup"` avec des `role="radio"`.

- [ ] **Step 1: Test qui échoue**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ChipPicker } from './ChipPicker';

const options = [
  { value: null, label: 'À ranger' },
  { value: 10, label: 'Courses', color: '#4f8a5b' },
  { value: 11, label: 'Restos', color: '#c2703d' },
];

function Harness({ onChange }: { onChange: (v: number | null) => void }) {
  const [value, setValue] = useState<number | null>(10);
  return (
    <ChipPicker
      aria-label="Enveloppe"
      options={options}
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange(v);
      }}
    />
  );
}

describe('ChipPicker', () => {
  it('expose un groupe radio et coche l’option choisie', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    expect(screen.getByRole('radiogroup', { name: 'Enveloppe' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Courses' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('radio', { name: 'Restos' }));
    expect(onChange).toHaveBeenLastCalledWith(11);
    expect(screen.getByRole('radio', { name: 'Restos' })).toHaveAttribute('aria-checked', 'true');
  });

  it('n’a qu’un arrêt de tabulation et se pilote aux flèches', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    expect(screen.getAllByRole('radio').filter((r) => r.tabIndex === 0)).toHaveLength(1);
    await userEvent.tab();
    expect(screen.getByRole('radio', { name: 'Courses' })).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith(11);
    expect(screen.getByRole('radio', { name: 'Restos' })).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith(null);
    await userEvent.keyboard('{ArrowLeft}');
    expect(onChange).toHaveBeenLastCalledWith(11);
  });
});
```

Run: `npx vitest run client/src/components/ui/ChipPicker.test.tsx`
Expected: FAIL, `Failed to resolve import "./ChipPicker"`.

- [ ] **Step 2: `ChipPicker.tsx`**

```tsx
import { useRef, type KeyboardEvent } from 'react';
import { Dot } from './Badge';
import styles from './ChipPicker.module.css';

export type ChipOption<T> = { value: T; label: string; color?: string };

type ChipPickerProps<T extends string | number | null> = {
  options: ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
  id?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
};

/** Choix unique parmi quelques options visibles : groupe radio en pastilles, piloté aux flèches. */
export function ChipPicker<T extends string | number | null>({ options, value, onChange, id, ...aria }: ChipPickerProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = options.findIndex((o) => o.value === value);
  const tabbable = selected === -1 ? 0 : selected;

  function move(from: number, delta: number) {
    const next = (from + delta + options.length) % options.length;
    onChange(options[next]!.value);
    refs.current[next]?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      move(index, 1);
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      move(index, -1);
    }
  }

  return (
    <div id={id} role="radiogroup" className={styles.chips} {...aria}>
      {options.map((o, i) => (
        <button
          key={String(o.value)}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={i === tabbable ? 0 : -1}
          className={[styles.chip, o.value === value ? styles.active : ''].join(' ')}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => onKeyDown(e, i)}
        >
          {o.color ? <Dot color={o.color} size={8} /> : null}
          {o.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: `ChipPicker.module.css`**

```css
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
  padding-top: var(--s-1);
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 var(--s-3);
  border: 1px solid var(--rule);
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--ink-soft);
  font-size: var(--text-sm);
  white-space: nowrap;
  transition:
    border-color var(--dur) var(--ease-out),
    background var(--dur) var(--ease-out),
    color var(--dur) var(--ease-out),
    transform var(--dur) var(--ease-out);
}

.chip:hover {
  border-color: var(--rule-strong);
  color: var(--ink);
}

.chip:active {
  transform: scale(0.96);
}

.chip:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
  border-radius: var(--radius-pill);
}

.active,
.active:hover {
  border-color: var(--ink);
  background: var(--ink);
  color: var(--paper);
  font-weight: 500;
}
```

- [ ] **Step 4: Export, tests, commit**

Dans `index.ts`, après `export { Checkbox } from './Checkbox';` :

```ts
export { ChipPicker, type ChipOption } from './ChipPicker';
```

Run: `npx vitest run client/src/components/ui/ChipPicker.test.tsx && npm run typecheck && npm run lint`
Expected: PASS, aucune erreur.

```bash
git add client/src/components/ui
git commit -m "feat(client): sélecteur en pastilles accessible au clavier"
```

---

### Task 4: `AmountHero` et pastilles d'enveloppe dans la saisie rapide

**Files:**
- Create: `client/src/components/ui/AmountHero.tsx`, `client/src/components/ui/AmountHero.module.css`
- Modify: `client/src/components/ui/index.ts`
- Modify: `client/src/components/transactions/QuickEntry.tsx`, `client/src/components/transactions/QuickEntry.module.css`
- Modify: `client/src/components/transactions/QuickEntry.test.tsx`
- Test: `client/src/components/ui/AmountHero.test.tsx`

**Interfaces:**
- Consumes: `ChipPicker` (tâche 3).
- Produces: `AmountHero` (forwardRef `HTMLInputElement`), props `{ id: string; value: number | null; onChange: (cents: number | null) => void; sign?: '−' | '+' | ''; tone?: 'neutral' | 'income'; invalid?: boolean; describedBy?: string; label?: string; autoFocus?: boolean }`. La valeur est en centimes positifs ; le libellé accessible par défaut est « Montant ».

- [ ] **Step 1: Test qui échoue `AmountHero.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AmountHero } from './AmountHero';

function Harness({ initial = null, onChange }: { initial?: number | null; onChange: (v: number | null) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <AmountHero
        id="amount"
        value={value}
        onChange={(v) => {
          setValue(v);
          onChange(v);
        }}
      />
      <button type="button" onClick={() => setValue(null)}>
        Vider
      </button>
    </>
  );
}

describe('AmountHero', () => {
  it('convertit la saisie en centimes et la normalise en sortie de champ', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = screen.getByLabelText('Montant');
    await userEvent.type(input, '12,5');
    expect(onChange).toHaveBeenLastCalledWith(1250);
    await userEvent.tab();
    expect(input).toHaveValue('12,50');
  });

  it('affiche une valeur initiale et suit une remise à zéro', async () => {
    render(<Harness initial={1457} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Montant')).toHaveValue('14,57');
    await userEvent.click(screen.getByRole('button', { name: 'Vider' }));
    expect(screen.getByLabelText('Montant')).toHaveValue('');
  });

  it('ignore les caractères qui ne sont pas des chiffres', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.type(screen.getByLabelText('Montant'), 'a8b');
    expect(screen.getByLabelText('Montant')).toHaveValue('8');
    expect(onChange).toHaveBeenLastCalledWith(800);
  });
});
```

Run: `npx vitest run client/src/components/ui/AmountHero.test.tsx`
Expected: FAIL, import introuvable.

- [ ] **Step 2: `AmountHero.tsx`**

```tsx
import { forwardRef, useState } from 'react';
import { parseEuros } from '@shared/money';
import styles from './AmountHero.module.css';

type AmountHeroProps = {
  id: string;
  /** Centimes positifs, null si vide ou invalide. */
  value: number | null;
  onChange: (cents: number | null) => void;
  sign?: '−' | '+' | '';
  tone?: 'neutral' | 'income';
  invalid?: boolean;
  describedBy?: string;
  label?: string;
  autoFocus?: boolean;
};

function toText(cents: number | null): string {
  return cents === null ? '' : (cents / 100).toFixed(2).replace('.', ',');
}

/** Montant en grand, le héros d'un formulaire d'opération. */
export const AmountHero = forwardRef<HTMLInputElement, AmountHeroProps>(function AmountHero(
  { id, value, onChange, sign = '', tone = 'neutral', invalid = false, describedBy, label = 'Montant', autoFocus },
  ref,
) {
  const [text, setText] = useState(() => toText(value));
  const [lastValue, setLastValue] = useState(value);

  // Resynchronise le texte quand la valeur change de l'extérieur (remise à zéro, suggestion).
  if (value !== lastValue) {
    setLastValue(value);
    const parsed = parseEuros(text);
    if ((parsed === null ? null : Math.abs(parsed)) !== value) setText(toText(value));
  }

  return (
    <div className={[styles.amount, styles[tone], invalid ? styles.invalid : ''].join(' ')}>
      <label htmlFor={id} className="visually-hidden">
        {label}
      </label>
      {sign ? (
        <span className={styles.sign} aria-hidden>
          {sign}
        </span>
      ) : null}
      <input
        ref={ref}
        id={id}
        className={['num', styles.input].join(' ')}
        inputMode="decimal"
        autoComplete="off"
        placeholder="0"
        value={text}
        size={Math.max(1, text.length || 1)}
        onChange={(e) => {
          const next = e.target.value.replace(/[^\d,.\s]/g, '');
          setText(next);
          const cents = parseEuros(next);
          const result = cents === null ? null : Math.abs(cents);
          setLastValue(result);
          onChange(result);
        }}
        onBlur={() => {
          const cents = parseEuros(text);
          if (cents !== null) setText(toText(Math.abs(cents)));
        }}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        autoFocus={autoFocus}
      />
      <span className={styles.currency} aria-hidden>
        €
      </span>
    </div>
  );
});
```

- [ ] **Step 3: `AmountHero.module.css`** (repris de `QuickEntry.module.css`)

```css
/* Le chiffre est le héros */
.amount {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: var(--s-1);
  padding: var(--s-3) 0 0;
  font-family: var(--font-display);
  font-size: 4rem;
  font-weight: 500;
  line-height: 1;
  letter-spacing: -0.04em;
}

.income {
  color: var(--positive);
}

.sign,
.currency {
  color: var(--ink-mute);
  font-weight: 400;
  transition: color var(--dur) var(--ease-out);
}

.income .sign,
.income .currency {
  color: color-mix(in oklab, var(--positive) 60%, var(--ink-mute));
}

.currency {
  font-size: 0.55em;
  margin-left: var(--s-1);
}

.input {
  field-sizing: content;
  min-width: 1ch;
  max-width: 8ch;
  padding: 0;
  border: none;
  outline: none;
  background: none;
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  text-align: center;
  caret-color: var(--marking);
}

.input::placeholder {
  color: var(--rule-strong);
}

.input:focus-visible {
  outline: none;
}

.invalid {
  animation: shake 320ms var(--ease-out);
}

@keyframes shake {
  25% {
    transform: translateX(-6px);
  }
  50% {
    transform: translateX(5px);
  }
  75% {
    transform: translateX(-3px);
  }
}

@media (max-width: 767px) {
  .amount {
    font-size: 3.25rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .invalid {
    animation: none;
  }
}
```

Export dans `index.ts`, en tête de liste après `export { Amount } from './Amount';` :

```ts
export { AmountHero } from './AmountHero';
```

Run: `npx vitest run client/src/components/ui/AmountHero.test.tsx`
Expected: PASS.

- [ ] **Step 4: Adapter les tests de `QuickEntry` aux pastilles radio (ils doivent échouer)**

Dans `client/src/components/transactions/QuickEntry.test.tsx` :
- remplacer `expect(screen.getByRole('button', { name: 'Courses' })).toHaveAttribute('aria-pressed', 'true');` par `expect(screen.getByRole('radio', { name: 'Courses' })).toHaveAttribute('aria-checked', 'true');` ;
- remplacer `await screen.findByRole('button', { name: 'Restos' });` par `await screen.findByRole('radio', { name: 'Restos' });` ;
- remplacer `await userEvent.click(screen.getByRole('button', { name: 'Restos' }));` par `await userEvent.click(screen.getByRole('radio', { name: 'Restos' }));`.

Run: `npx vitest run client/src/components/transactions/QuickEntry.test.tsx`
Expected: FAIL, aucun `radio` nommé « Courses ».

- [ ] **Step 5: Brancher `AmountHero` et `ChipPicker` dans `QuickEntry.tsx`**

1. Imports : remplacer `import { Button, DateInput, Dot, Select } from '@/components/ui';` par `import { AmountHero, Button, ChipPicker, DateInput, Dot, Select } from '@/components/ui';`, retirer `type CSSProperties` de l'import `react`, et retirer `parseEuros` de l'import `@shared/money` (garder `formatEuros`).
2. État : remplacer `const [amountText, setAmountText] = useState('');` par `const [amount, setAmount] = useState<number | null>(null);`.
3. Dans le bloc de remise à zéro, remplacer `setAmountText('');` par `setAmount(null);`.
4. Supprimer la ligne `const amount = parseEuros(amountText);`.
5. Dans `pickSuggestion`, remplacer `if (amount === null) setAmountText((t.amount / 100).toFixed(2).replace('.', ','));` par `if (amount === null) setAmount(t.amount);`.
6. Remplacer tout le bloc `<div className={[styles.amount, ...` jusqu'à sa fermeture (label caché, signe, `<input id="quick-amount" ...>`, devise) par :

```tsx
      <AmountHero
        ref={amountRef}
        id="quick-amount"
        value={amount}
        onChange={(cents) => {
          setAmount(cents);
          setErrors((x) => ({ ...x, amount: '' }));
        }}
        sign={sign}
        tone={kind === 'income' ? 'income' : 'neutral'}
        invalid={Boolean(errors.amount)}
        describedBy={errors.amount ? 'quick-amount-error' : undefined}
        autoFocus
      />
```

et typer `sign` : `const sign: '−' | '+' | '' = kind === 'expense' ? '−' : kind === 'income' ? '+' : '';`.

7. Remplacer le `<fieldset className={styles.group}>` des enveloppes par :

```tsx
      {kind === 'expense' ? (
        <fieldset className={styles.group}>
          <legend id="quick-envelope-label" className={styles.legend}>
            Enveloppe
            {envelopeSource === 'rule' || envelopeSource === 'history' ? (
              <span className={styles.auto}>
                <Sparkles aria-hidden /> {envelopeSource === 'rule' ? 'proposée par tes règles' : 'comme la dernière fois'}
              </span>
            ) : null}
          </legend>
          <ChipPicker
            aria-labelledby="quick-envelope-label"
            value={envelopeId}
            onChange={chooseEnvelope}
            options={[{ value: null, label: 'À ranger plus tard' }, ...(envelopes.data ?? []).map((env) => ({ value: env.id, label: env.name, color: env.color }))]}
          />
        </fieldset>
      ) : null}
```

8. Le libellé du bouton d'envoi utilise déjà `amount` : `{amount ? \`Enregistrer ${SUBMIT_LABEL[kind]} de ${formatEuros(Math.abs(amount))}\` : 'Enregistrer'}` reste inchangé.

- [ ] **Step 6: Nettoyer `QuickEntry.module.css`**

Supprimer les règles `.amount`, `.amount.income`, `.sign`, `.currency` (et leurs variantes `.amount.income .sign`...), `.amountInput`, `.amountInput::placeholder`, `.amountInput:focus-visible`, `.amountError`, `@keyframes shake`, `.chips`, et dans le bloc `@media (max-width: 767px)` la règle `.amount { font-size: 3.25rem; }`.
Garder `.chip` et `.chipActive` (encore utilisés par « Aujourd’hui » et « Hier »), en remplaçant `.chipActive, .chipActive:hover` par :

```css
.chipActive,
.chipActive:hover {
  border-color: var(--ink);
  background: var(--ink);
  color: var(--paper);
  font-weight: 500;
}
```

et supprimer la propriété `--chip: var(--ink);` de `.chip`.

- [ ] **Step 7: Lancer les tests, typecheck, lint, commit**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS, dont les 3 tests de `QuickEntry` et les 3 de `AmountHero`.

```bash
git add client/src/components/ui client/src/components/transactions
git commit -m "refactor(client): montant héros et pastilles d'enveloppe partagés par la saisie rapide"
```

---

### Task 5: `Dialog` redessiné, `DialogFooter` et `ConfirmDialog`

**Files:**
- Modify: `client/src/components/ui/Dialog.tsx`, `client/src/components/ui/Dialog.module.css`
- Create: `client/src/components/ui/ConfirmDialog.tsx`, `client/src/components/ui/ConfirmDialog.module.css`
- Modify: `client/src/components/ui/Button.tsx`, `client/src/components/ui/Button.module.css` (variante `danger-quiet`)
- Modify: `client/src/components/ui/index.ts`
- Modify: `client/src/components/ui/MoneyInput.test.tsx` (le test du `Dialog` déménage)
- Test: `client/src/components/ui/Dialog.test.tsx`

**Interfaces:**
- Produces: `Dialog` (props inchangées, `description` accepte un `ReactNode`).
- Produces: `DialogFooter(props: { children: ReactNode; start?: ReactNode; info?: ReactNode })` : rendu dans le pied du `Dialog` englobant par portail ; hors dialogue, rendu sur place. `start` va à gauche (action destructive), `children` à droite (le dernier enfant est l'action principale), `info` occupe une ligne entière au-dessus.
- Produces: `ConfirmDialog(props: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; description?: ReactNode; children?: ReactNode; confirmLabel: string; tone?: 'danger' | 'primary'; loading?: boolean; error?: string | null })`.
- Produces: `Button` accepte `variant="danger-quiet"` (texte rouge sans bordure).

- [ ] **Step 1: Test qui échoue `Dialog.test.tsx`**

```tsx
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';
import { Dialog, DialogFooter } from './Dialog';

describe('Dialog', () => {
  it('est nommé par son titre et appelle onClose sur Échap', () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Test">
        <p>contenu</p>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Test', hidden: true });
    dialog.dispatchEvent(new Event('cancel', { bubbles: true, cancelable: true }));
    expect(onClose).toHaveBeenCalled();
  });

  it('téléporte les actions du formulaire dans le pied', async () => {
    render(
      <Dialog open onClose={vi.fn()} title="Titre">
        <form id="f">
          <DialogFooter start={<span>gauche</span>}>
            <button type="submit" form="f">
              Valider
            </button>
          </DialogFooter>
        </form>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Titre', hidden: true });
    const footer = dialog.querySelector('footer')!;
    const button = await within(footer).findByText('Valider');
    expect(within(footer).getByText('gauche')).toBeInTheDocument();
    expect(dialog.querySelector('form')!.contains(button)).toBe(false);
  });

  it('rend le pied sur place hors dialogue', () => {
    render(
      <DialogFooter>
        <button type="button">Seul</button>
      </DialogFooter>,
    );
    expect(screen.getByRole('button', { name: 'Seul' })).toBeInTheDocument();
  });
});

describe('ConfirmDialog', () => {
  it('confirme, annule et affiche une erreur', async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <ConfirmDialog open onClose={onClose} onConfirm={onConfirm} title="Supprimer ?" confirmLabel="Supprimer" error="Échec réseau">
        Loyer
      </ConfirmDialog>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Supprimer ?', hidden: true });
    expect(within(dialog).getByText('Loyer')).toBeInTheDocument();
    expect(within(dialog).getByRole('alert', { hidden: true })).toHaveTextContent('Échec réseau');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Supprimer', hidden: true }));
    expect(onConfirm).toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Annuler', hidden: true }));
    expect(onClose).toHaveBeenCalled();
  });
});
```

Dans `MoneyInput.test.tsx`, supprimer tout le `describe('Dialog', ...)` et l'import `Dialog` (le test vit désormais dans `Dialog.test.tsx`).

Run: `npx vitest run client/src/components/ui/Dialog.test.tsx`
Expected: FAIL, `DialogFooter` n'est pas exporté et `./ConfirmDialog` introuvable.

- [ ] **Step 2: Variante `danger-quiet` du bouton**

Dans `Button.tsx`, type de `variant` : `variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-quiet' | 'marking';`.
Dans `Button.module.css`, après le bloc `.danger` et son `:hover` :

```css
.danger-quiet {
  background: transparent;
  color: var(--negative);
}

.danger-quiet:hover:not(:disabled) {
  background: var(--negative-soft);
}
```

- [ ] **Step 3: `Dialog.tsx`**

```tsx
import { X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { prefersReducedMotion } from '@/lib/motion';
import styles from './Dialog.module.css';

/** Durée de l'animation de fermeture, alignée sur `.closing` dans le CSS. */
const CLOSE_MS = 160;

/** Pied du dialogue englobant : `undefined` hors dialogue, `null` tant qu'il n'est pas monté. */
const FooterContext = createContext<HTMLElement | null | undefined>(undefined);

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  /** Actions simples (confirmation). Un formulaire passe plutôt par `<DialogFooter>`. */
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
};

/** Boîte de dialogue modale native (`<dialog>`), fermée par Échap ou clic sur le fond, avec une sortie animée. */
export function Dialog({ open, onClose, title, description, children, footer, size = 'md' }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [footerEl, setFooterEl] = useState<HTMLElement | null>(null);
  const [edges, setEdges] = useState({ top: false, bottom: false });
  // Le contenu reste affiché pendant l'animation de sortie, puis le dialogue se ferme vraiment.
  const [rendered, setRendered] = useState(open);
  const [closing, setClosing] = useState(false);
  const [content, setContent] = useState({ title, description, children, footer });

  if (open && !rendered) setRendered(true);
  if (open && closing) setClosing(false);
  if (!open && rendered && !closing) setClosing(true);
  // Pendant la sortie, on garde le dernier contenu : le parent l'a souvent déjà vidé.
  if (open && (content.title !== title || content.description !== description || content.children !== children || content.footer !== footer)) {
    setContent({ title, description, children, footer });
  }

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      // Le focus va d'abord au champ marqué autofocus, sinon au premier champ, jamais au bouton Fermer.
      const target = el.querySelector<HTMLElement>('[autofocus], input, select, textarea');
      target?.focus();
    }
  }, [open, rendered]);

  useEffect(() => {
    if (!closing) return;
    const finish = () => {
      ref.current?.close();
      setClosing(false);
      setRendered(false);
    };
    if (prefersReducedMotion()) {
      finish();
      return;
    }
    const id = window.setTimeout(finish, CLOSE_MS);
    return () => window.clearTimeout(id);
  }, [closing]);

  // Filets sous l'en-tête et au-dessus du pied, seulement quand du contenu est caché de ce côté.
  const measure = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    const top = el.scrollTop > 0;
    const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
    setEdges((prev) => (prev.top === top && prev.bottom === bottom ? prev : { top, bottom }));
  }, []);

  useEffect(() => {
    const body = bodyRef.current;
    const inner = innerRef.current;
    if (!rendered || !body || !inner || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [rendered, measure]);

  const shown = open ? { title, description, children, footer } : content;

  return (
    <dialog
      ref={ref}
      className={[styles.dialog, styles[size], closing ? styles.closing : ''].join(' ')}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {rendered ? (
        <div className={styles.panel}>
          <header className={[styles.header, edges.top ? styles.edgeBelow : ''].join(' ')}>
            <div className={styles.heading}>
              <h2 id={titleId} className={styles.title}>
                {shown.title}
              </h2>
              {shown.description ? <p className={styles.description}>{shown.description}</p> : null}
            </div>
            <button type="button" className={styles.close} onClick={onClose} aria-label="Fermer">
              <X aria-hidden />
            </button>
          </header>
          <div ref={bodyRef} className={styles.body} onScroll={measure}>
            <div ref={innerRef}>
              <FooterContext.Provider value={footerEl}>{shown.children}</FooterContext.Provider>
            </div>
          </div>
          <footer ref={setFooterEl} className={[styles.footer, edges.bottom ? styles.edgeAbove : ''].join(' ')}>
            {shown.footer ? <div className={styles.end}>{shown.footer}</div> : null}
          </footer>
        </div>
      ) : null}
    </dialog>
  );
}

type DialogFooterProps = {
  /** Actions principales, à droite ; la dernière est l'action principale. */
  children: ReactNode;
  /** Action à part, à gauche (Supprimer). */
  start?: ReactNode;
  /** Ligne d'information pleine largeur au-dessus des boutons (récapitulatif). */
  info?: ReactNode;
};

/** Actions d'un formulaire, rendues dans le pied du dialogue qui le contient. */
export function DialogFooter({ children, start, info }: DialogFooterProps) {
  const target = useContext(FooterContext);
  const content = (
    <>
      {info ? <div className={styles.info}>{info}</div> : null}
      {start ? <div className={styles.start}>{start}</div> : null}
      <div className={styles.end}>{children}</div>
    </>
  );
  if (target === undefined) return <div className={styles.inlineFooter}>{content}</div>;
  return target ? createPortal(content, target) : null;
}
```

- [ ] **Step 4: `Dialog.module.css`**

Remplacer tout le fichier par :

```css
.dialog {
  border: none;
  padding: 0;
  background: transparent;
  max-width: calc(100vw - 2 * var(--s-4));
  max-height: calc(100dvh - 2 * var(--s-4));
  width: 100%;
  margin: auto;
}

.dialog::backdrop {
  background: rgb(20 32 28 / 0.45);
  backdrop-filter: blur(2px);
  animation: fade-in 200ms var(--ease-out);
}

.closing::backdrop {
  animation: fade-out 160ms var(--ease-out) forwards;
}

.closing .panel {
  animation: pop-out 160ms var(--ease-out) forwards;
}

.sm {
  width: 420px;
}

.md {
  width: 520px;
}

.lg {
  width: 760px;
}

.panel {
  display: flex;
  flex-direction: column;
  max-height: calc(100dvh - 2 * var(--s-4));
  background: var(--paper-raised);
  border: 1px solid var(--rule);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-pop);
  color: var(--ink);
  animation: pop 220ms var(--ease-out);
}

/* En-tête : titre en police d'affichage, bouton fermer discret */
.header {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--s-3);
  padding: var(--s-6) var(--s-6) var(--s-2);
  transition: box-shadow var(--dur) var(--ease-out);
}

.edgeBelow {
  box-shadow: 0 1px 0 var(--rule);
}

.heading {
  min-width: 0;
}

.title {
  font-family: var(--font-display);
  font-size: 1.3125rem;
  font-weight: 600;
  letter-spacing: -0.015em;
  line-height: 1.2;
}

.description {
  margin-top: var(--s-1);
  font-size: var(--text-sm);
  color: var(--ink-mute);
}

.close {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: var(--radius-pill);
  background: var(--paper-sunken);
  color: var(--ink-mute);
  transition:
    background var(--dur) var(--ease-out),
    color var(--dur) var(--ease-out);
}

.close:hover {
  background: var(--rule);
  color: var(--ink);
}

.close :global(svg) {
  width: 14px;
  height: 14px;
}

.body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: var(--s-4) var(--s-6);
}

.panel:has(> .footer:empty) .body {
  padding-bottom: var(--s-6);
}

/* Pied : action destructive à gauche, actions à droite, la principale en dernier */
.footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-3) var(--s-2);
  padding: var(--s-4) var(--s-6) var(--s-5);
  transition: box-shadow var(--dur) var(--ease-out);
}

.footer:empty {
  display: none;
}

.edgeAbove {
  box-shadow: 0 -1px 0 var(--rule);
}

.info {
  flex: 1 0 100%;
}

.start {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  margin-right: auto;
}

.end {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  margin-left: auto;
}

.inlineFooter {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-3) var(--s-2);
}

@keyframes pop {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.97);
  }
}

@keyframes pop-out {
  to {
    opacity: 0;
    transform: translateY(6px) scale(0.98);
  }
}

@keyframes fade-in {
  from {
    opacity: 0;
  }
}

@keyframes fade-out {
  to {
    opacity: 0;
  }
}

@media (max-width: 767px) {
  .dialog {
    margin: auto 0 0;
    max-width: 100vw;
    max-height: 92dvh;
  }

  .sm,
  .md,
  .lg {
    width: 100vw;
  }

  .panel {
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    max-height: 92dvh;
    animation-name: sheet-up;
  }

  .closing .panel {
    animation-name: sheet-down;
  }

  .header,
  .body,
  .footer {
    padding-left: var(--s-5);
    padding-right: var(--s-5);
  }

  .footer {
    padding-bottom: calc(var(--s-5) + env(safe-area-inset-bottom));
  }

  /* Action principale en pleine largeur, les autres sur une ligne en dessous */
  .footer .start,
  .footer .end {
    display: contents;
  }

  .footer .end > :last-child {
    order: -1;
    flex: 1 0 100%;
    height: 44px;
  }

  .footer .info {
    order: -2;
  }

  .footer .end > :first-child:not(:last-child) {
    margin-left: auto;
  }

  @keyframes sheet-up {
    from {
      transform: translateY(100%);
    }
  }

  @keyframes sheet-down {
    to {
      transform: translateY(100%);
    }
  }
}

@media (prefers-reduced-motion: reduce) {
  .panel,
  .dialog::backdrop {
    animation: none;
  }
}
```

- [ ] **Step 5: `ConfirmDialog.tsx` et `ConfirmDialog.module.css`**

```tsx
import type { ReactNode } from 'react';
import { Button } from './Button';
import { Dialog } from './Dialog';
import styles from './ConfirmDialog.module.css';

type ConfirmDialogProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: ReactNode;
  /** L'élément concerné (nom, montant). */
  children?: ReactNode;
  confirmLabel: string;
  tone?: 'danger' | 'primary';
  loading?: boolean;
  error?: string | null;
};

/** Confirmation d'une action : une question, une explication, l'élément concerné et deux boutons. */
export function ConfirmDialog({ open, onClose, onConfirm, title, description, children, confirmLabel, tone = 'danger', loading, error }: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button variant={tone} loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children ? <div className={styles.subject}>{children}</div> : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
```

```css
.subject {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--s-2);
  font-weight: 500;
}

.subject + .error {
  margin-top: var(--s-3);
}

.error {
  color: var(--negative);
  font-size: var(--text-sm);
}
```

- [ ] **Step 6: Exports**

Dans `index.ts`, remplacer `export { Dialog } from './Dialog';` par :

```ts
export { ConfirmDialog } from './ConfirmDialog';
export { Dialog, DialogFooter } from './Dialog';
```

- [ ] **Step 7: Tests, typecheck, lint, commit**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS (4 tests dans `Dialog.test.tsx`), aucune erreur.

```bash
git add client/src/components/ui
git commit -m "feat(client): dialogue au pied unifié, filets de défilement et confirmation partagée"
```

---

### Task 6: `QuickEntry` en modes création et modification, pied de dialogue

**Files:**
- Modify: `client/src/components/transactions/QuickEntry.tsx`, `client/src/components/transactions/QuickEntry.module.css`
- Test: `client/src/components/transactions/QuickEntry.test.tsx`

**Interfaces:**
- Consumes: `DialogFooter` (tâche 5), `DateField` (tâche 2), `Textarea` (tâche 1).
- Produces: props de `QuickEntry` :

```ts
type QuickEntryProps = {
  mode?: 'create' | 'edit';
  /** Opération modifiée en mode `edit` ; jamais une répartition (voir AllocationForm). */
  initial?: Transaction;
  submitting?: boolean;
  serverError?: string | null;
  onSubmit: (input: TransactionInput, again: boolean) => void;
  resetKey?: number;
  /** Action à gauche du pied (Supprimer). */
  footerStart?: ReactNode;
  /** Action avant le bouton principal (Confirmer sans modifier). */
  footerExtra?: ReactNode;
};
```

- [ ] **Step 1: Tests qui échouent pour le mode modification**

Dans `QuickEntry.test.tsx`, ajouter l'import `import type { Transaction } from '@shared/schemas';`, puis ajouter après la fonction `renderEntry` :

```tsx
const planned: Transaction = {
  id: 42,
  kind: 'expense',
  amount: 1457,
  label: 'MAIF',
  accountId: 1,
  toAccountId: null,
  envelopeId: 11,
  fromEnvelopeId: null,
  date: '2026-11-07',
  note: 'Assurance habitation',
  status: 'planned',
  recurringRuleId: 3,
  importId: null,
  fingerprint: null,
  createdAt: '',
};

function renderEdit(onSubmit = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <QuickEntry mode="edit" initial={planned} onSubmit={onSubmit} footerStart={<button type="button">Supprimer</button>} />
    </QueryClientProvider>,
  );
  return onSubmit;
}
```

et dans le `describe('QuickEntry', ...)` :

```tsx
  it('modifie une opération existante sans changer son type', async () => {
    const onSubmit = renderEdit();
    await screen.findByRole('option', { name: 'Courant' });
    expect(screen.getByLabelText('Montant')).toHaveValue('14,57');
    expect(screen.getByLabelText('Libellé')).toHaveValue('MAIF');
    expect(screen.getByLabelText('Note')).toHaveValue('Assurance habitation');
    expect(screen.getByRole('radio', { name: 'Restos' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByRole('radiogroup', { name: 'Type d’opération' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /en saisir une autre/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Supprimer' })).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText('Libellé'));
    await userEvent.type(screen.getByLabelText('Libellé'), 'MAIF habitation');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'expense', amount: 1457, label: 'MAIF habitation', envelopeId: 11, date: '2026-11-07', note: 'Assurance habitation' }),
      false,
    );
  });

  it('ne propose pas d’enveloppe d’après les règles en modification', async () => {
    renderEdit();
    await screen.findByRole('option', { name: 'Courant' });
    await userEvent.clear(screen.getByLabelText('Libellé'));
    await userEvent.type(screen.getByLabelText('Libellé'), 'Carrefour');
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.queryByText('proposée par tes règles')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Restos' })).toHaveAttribute('aria-checked', 'true');
  });
```

Run: `npx vitest run client/src/components/transactions/QuickEntry.test.tsx`
Expected: FAIL (la prop `mode` n'existe pas, le montant est vide).

- [ ] **Step 2: Réécrire l'en-tête et l'état de `QuickEntry.tsx`**

Imports :

```tsx
import { ArrowLeftRight, Check, Minus, Plus, Sparkles } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { addDays, today } from '@shared/dates';
import { formatEuros } from '@shared/money';
import { transactionInputSchema, type Transaction, type TransactionInput } from '@shared/schemas';
import { testSortingRule, useAccounts, useEnvelopes, useTransactions } from '@/api/hooks';
import { AmountHero, Button, ChipPicker, DateField, DialogFooter, Dot, Select, Textarea } from '@/components/ui';
import styles from './QuickEntry.module.css';
```

Remplacer `type QuickEntryProps` par le type de la section Interfaces ci-dessus, puis le début du composant jusqu'à la remise à zéro incluse par :

```tsx
/** Saisie d'une opération : le montant d'abord, puis le libellé qui propose l'enveloppe. Sert aussi à la modifier. */
export function QuickEntry({ mode = 'create', initial, submitting, serverError, onSubmit, resetKey = 0, footerStart, footerExtra }: QuickEntryProps) {
  const accounts = useAccounts();
  const envelopes = useEnvelopes();
  const amountRef = useRef<HTMLInputElement>(null);
  const formId = useId();
  const editing = mode === 'edit';

  const [kind, setKind] = useState<Kind>(initial && initial.kind !== 'allocation' ? initial.kind : 'expense');
  const [amount, setAmount] = useState<number | null>(initial?.amount ?? null);
  const [label, setLabel] = useState(initial?.label ?? '');
  const [date, setDate] = useState(initial?.date ?? today());
  const [accountId, setAccountId] = useState<number | null>(initial?.accountId ?? null);
  const [toAccountId, setToAccountId] = useState<number | null>(initial?.toAccountId ?? null);
  const [envelopeId, setEnvelopeId] = useState<number | null>(initial?.envelopeId ?? null);
  const [envelopeSource, setEnvelopeSource] = useState<EnvelopeSource>(initial ? 'user' : null);
  const [note, setNote] = useState(initial?.note ?? '');
  const [showNote, setShowNote] = useState(Boolean(initial?.note));
  const [focusNote, setFocusNote] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lastReset, setLastReset] = useState(resetKey);

  // Après « Enregistrer et en saisir une autre » : on garde type, date et compte, on vide le reste.
  if (resetKey !== lastReset) {
    setLastReset(resetKey);
    setAmount(null);
    setLabel('');
    setEnvelopeId(null);
    setEnvelopeSource(null);
    setNote('');
    setShowNote(false);
    setFocusNote(false);
    setErrors({});
  }
  useEffect(() => amountRef.current?.focus(), [resetKey]);

  const effectiveAccount = accountId ?? accounts.data?.[0]?.id ?? null;
  const yesterday = addDays(today(), -1);

  // Suggestions : opérations passées dont le libellé contient la saisie (création seulement).
  const query = useDebounced(editing ? '' : label.trim(), 200);
```

Le reste (`history`, `suggestions`) ne change pas.
Dans l'effet des règles de tri, remplacer la condition de sortie par :

```tsx
    if (editing || kind !== 'expense' || envelopeSource === 'user' || envelopeSource === 'history' || query.length < 2) return;
```

et ajouter `editing` à son tableau de dépendances : `}, [query, kind, envelopeSource, editing]);`.

- [ ] **Step 3: Réécrire le rendu de `QuickEntry.tsx`**

Remplacer tout ce qui suit la fonction `onKeyDown` (les déclarations `const sign = ...`, `const accountOptions = ...` et le `return (...)`, jusqu'à la fin du composant) par :

```tsx
  const sign: '−' | '+' | '' = kind === 'expense' ? '−' : kind === 'income' ? '+' : '';
  const otherDate = date !== today() && date !== yesterday;
  const accountOptions = (accounts.data ?? []).map((a) => (
    <option key={a.id} value={a.id}>
      {a.name}
    </option>
  ));
  const submitText = editing ? 'Enregistrer' : amount ? `Enregistrer ${SUBMIT_LABEL[kind]} de ${formatEuros(Math.abs(amount))}` : 'Enregistrer';

  return (
    <form
      id={formId}
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
      onKeyDown={onKeyDown}
      noValidate
    >
      {editing ? null : (
        <div className={styles.kinds} role="radiogroup" aria-label="Type d’opération">
          {KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              role="radio"
              aria-checked={kind === k.value}
              className={[styles.kind, kind === k.value ? styles.kindActive : '', styles[k.value]].join(' ')}
              onClick={() => {
                setKind(k.value);
                setErrors({});
              }}
            >
              <k.icon aria-hidden />
              {k.label}
            </button>
          ))}
        </div>
      )}

      <AmountHero
        ref={amountRef}
        id={`${formId}-amount`}
        value={amount}
        onChange={(cents) => {
          setAmount(cents);
          setErrors((x) => ({ ...x, amount: '' }));
        }}
        sign={sign}
        tone={kind === 'income' ? 'income' : 'neutral'}
        invalid={Boolean(errors.amount)}
        describedBy={errors.amount ? `${formId}-amount-error` : undefined}
        autoFocus
      />
      {errors.amount ? (
        <p id={`${formId}-amount-error`} className={styles.error} role="alert">
          {errors.amount}
        </p>
      ) : null}

      <div className={styles.labelBlock}>
        <label htmlFor={`${formId}-label`} className="visually-hidden">
          Libellé
        </label>
        <input
          id={`${formId}-label`}
          className={styles.labelInput}
          value={label}
          onChange={(e) => {
            setLabel(e.target.value);
            setErrors((x) => ({ ...x, label: '' }));
          }}
          placeholder={kind === 'income' ? 'D’où vient cet argent ?' : kind === 'transfer' ? 'Pourquoi ce virement ?' : 'Pour quoi ?'}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={errors.label ? true : undefined}
        />
        {errors.label ? <p className={styles.error}>{errors.label}</p> : null}
        {suggestions.length > 0 ? (
          <ul className={styles.suggestions} aria-label="Opérations passées">
            {suggestions.map((t) => {
              const env = t.envelopeId != null ? envelopes.data?.find((e) => e.id === t.envelopeId) : undefined;
              return (
                <li key={t.id}>
                  <button type="button" className={styles.suggestion} onClick={() => pickSuggestion(t)}>
                    <span className={styles.suggestionLabel}>{t.label}</span>
                    {env ? (
                      <span className={styles.suggestionMeta}>
                        <Dot color={env.color} size={8} /> {env.name}
                      </span>
                    ) : null}
                    <span className={['num', styles.suggestionMeta].join(' ')}>{formatEuros(t.amount)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      {kind === 'expense' ? (
        <fieldset className={styles.group}>
          <legend id={`${formId}-envelope`} className={styles.legend}>
            Enveloppe
            {envelopeSource === 'rule' || envelopeSource === 'history' ? (
              <span className={styles.auto}>
                <Sparkles aria-hidden /> {envelopeSource === 'rule' ? 'proposée par tes règles' : 'comme la dernière fois'}
              </span>
            ) : null}
          </legend>
          <ChipPicker
            aria-labelledby={`${formId}-envelope`}
            value={envelopeId}
            onChange={chooseEnvelope}
            options={[{ value: null, label: 'À ranger plus tard' }, ...(envelopes.data ?? []).map((env) => ({ value: env.id, label: env.name, color: env.color }))]}
          />
        </fieldset>
      ) : null}

      <div className={styles.meta}>
        <div className={styles.dates} role="group" aria-label="Date">
          <button type="button" className={[styles.chip, date === today() ? styles.chipActive : ''].join(' ')} onClick={() => setDate(today())} aria-pressed={date === today()}>
            Aujourd’hui
          </button>
          <button type="button" className={[styles.chip, date === yesterday ? styles.chipActive : ''].join(' ')} onClick={() => setDate(yesterday)} aria-pressed={date === yesterday}>
            Hier
          </button>
          <DateField
            variant="pill"
            aria-label="Autre date"
            value={otherDate ? date : null}
            placeholder="Autre date"
            shortcuts={false}
            max={editing ? undefined : today()}
            onChange={(v) => v && setDate(v)}
          />
        </div>

        <div className={styles.accounts}>
          <label className={styles.inline}>
            <span>{kind === 'income' ? 'Sur' : 'Depuis'}</span>
            <Select aria-label={kind === 'income' ? 'Compte crédité' : 'Compte débité'} value={effectiveAccount ?? ''} onChange={(e) => setAccountId(Number(e.target.value) || null)} className={styles.compactSelect}>
              {accountOptions}
            </Select>
          </label>
          {kind === 'transfer' ? (
            <label className={styles.inline}>
              <span>vers</span>
              <Select aria-label="Compte destination" value={toAccountId ?? ''} onChange={(e) => setToAccountId(Number(e.target.value) || null)} className={styles.compactSelect}>
                <option value="">Choisir</option>
                {accountOptions}
              </Select>
            </label>
          ) : null}
        </div>
        {errors.accountId || errors.toAccountId ? <p className={styles.error}>{errors.toAccountId ?? errors.accountId}</p> : null}
      </div>

      {showNote ? (
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Une note pour plus tard" aria-label="Note" autoFocus={focusNote} />
      ) : (
        <button
          type="button"
          className={styles.addNote}
          onClick={() => {
            setShowNote(true);
            setFocusNote(true);
          }}
        >
          + Ajouter une note
        </button>
      )}

      {serverError ? (
        <p className={styles.error} role="alert">
          {serverError}
        </p>
      ) : null}

      <DialogFooter
        start={
          editing ? (
            footerStart
          ) : (
            <button type="button" className={styles.again} onClick={() => submit(true)} disabled={submitting}>
              Enregistrer et en saisir une autre <kbd>⇧</kbd>
              <kbd>↵</kbd>
            </button>
          )
        }
      >
        {footerExtra}
        <Button type="submit" form={formId} variant="primary" loading={submitting} icon={<Check />} className={editing ? undefined : styles.submit}>
          {submitText}
        </Button>
      </DialogFooter>
    </form>
  );
```

Dans `onKeyDown`, ne déclencher « une autre » qu'en création :

```tsx
  function onKeyDown(e: KeyboardEvent<HTMLFormElement>) {
    if (e.key === 'Enter' && e.shiftKey && !editing) {
      e.preventDefault();
      submit(true);
    }
  }
```

Le libellé « Libellé » a désormais l'id `${formId}-label` : les tests le trouvent toujours via `getByLabelText('Libellé')`.

- [ ] **Step 4: Nettoyer `QuickEntry.module.css`**

- Supprimer `.dateInput`, `.dateActive`, `.note`, `.note:focus`, `.actions`.
- Remplacer `.compactSelect` par :

```css
.compactSelect {
  width: auto;
  height: 32px;
  font-size: var(--text-sm);
}
```

- Dans le bloc `@media (max-width: 767px)`, supprimer toute règle visant `.actions` ou `.submit` (le pied du dialogue gère la disposition mobile).

- [ ] **Step 5: Tests, typecheck, lint, commit**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS, dont les 5 tests de `QuickEntry`.

```bash
git add client/src/components/transactions
git commit -m "feat(client): la saisie rapide sert aussi à modifier une opération"
```

---

### Task 7: `AllocationForm`, modification d'opération et suppression de `TransactionForm`

**Files:**
- Create: `client/src/components/envelopes/AllocationForm.tsx`, `client/src/components/envelopes/AllocationForm.module.css`
- Modify: `client/src/components/envelopes/AllocateDialog.tsx`
- Modify: `client/src/components/transactions/TransactionEditDialog.tsx`
- Delete: `client/src/components/transactions/TransactionForm.tsx`, `TransactionForm.module.css`, `TransactionForm.test.tsx`, `TransactionEditDialog.module.css`
- Test: `client/src/components/envelopes/AllocationForm.test.tsx`

**Interfaces:**
- Consumes: `AmountHero`, `ChipPicker`, `DateField`, `DialogFooter`, `Field`, `Input`, `Textarea`, `ConfirmDialog`, `QuickEntry` (mode `edit`, `footerStart`, `footerExtra`).
- Produces: `AllocationForm(props: { initial?: Partial<Pick<Transaction, 'amount' | 'date' | 'label' | 'envelopeId' | 'fromEnvelopeId' | 'note'>>; submitLabel: string; submitting?: boolean; serverError?: string | null; onSubmit: (input: TransactionInput) => void; onCancel: () => void; footerStart?: ReactNode })`.

- [ ] **Step 1: Test qui échoue `AllocationForm.test.tsx`**

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AllocationForm } from './AllocationForm';

const envelopes = [
  { id: 10, name: 'Courses', color: '#4f8a5b', monthlyTarget: null, sortOrder: 0, archived: false, isSavings: false },
  { id: 11, name: 'Restos', color: '#c2703d', monthlyTarget: null, sortOrder: 1, archived: false, isSavings: false },
];

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => new Response(JSON.stringify(url.startsWith('/api/envelopes') ? envelopes : []), { status: 200 })),
  );
});

function renderForm(onSubmit = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <AllocationForm submitLabel="Ajouter" onSubmit={onSubmit} onCancel={vi.fn()} />
    </QueryClientProvider>,
  );
  return onSubmit;
}

describe('AllocationForm', () => {
  it('répartit depuis « Pas encore réparti » vers une enveloppe', async () => {
    const onSubmit = renderForm();
    const to = await screen.findByRole('radiogroup', { name: 'Vers' });
    await userEvent.type(screen.getByLabelText('Montant'), '50');
    await userEvent.click(within(to).getByRole('radio', { name: 'Courses' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ kind: 'allocation', amount: 5000, fromEnvelopeId: null, envelopeId: 10, accountId: null, label: 'Répartition' }));
  });

  it('exige une enveloppe de destination et un montant', async () => {
    const onSubmit = renderForm();
    await screen.findByRole('radiogroup', { name: 'Vers' });
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    expect(await screen.findByText('Indique un montant')).toBeInTheDocument();
    expect(screen.getByText('Enveloppe requise')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('refuse deux enveloppes identiques', async () => {
    const onSubmit = renderForm();
    const from = await screen.findByRole('radiogroup', { name: 'De' });
    await userEvent.type(screen.getByLabelText('Montant'), '20');
    await userEvent.click(within(from).getByRole('radio', { name: 'Restos' }));
    await userEvent.click(within(screen.getByRole('radiogroup', { name: 'Vers' })).getByRole('radio', { name: 'Restos' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    expect(await screen.findByText('Les deux enveloppes doivent être différentes')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
```

Run: `npx vitest run client/src/components/envelopes/AllocationForm.test.tsx`
Expected: FAIL, import introuvable.

- [ ] **Step 2: `AllocationForm.tsx`**

```tsx
import { useId, useState, type ReactNode } from 'react';
import { today } from '@shared/dates';
import { transactionInputSchema, type Transaction, type TransactionInput } from '@shared/schemas';
import { useEnvelopes } from '@/api/hooks';
import { AmountHero, Button, ChipPicker, DateField, DialogFooter, Field, Input, Textarea } from '@/components/ui';
import styles from './AllocationForm.module.css';

type AllocationFormProps = {
  initial?: Partial<Pick<Transaction, 'amount' | 'date' | 'label' | 'envelopeId' | 'fromEnvelopeId' | 'note'>>;
  submitLabel: string;
  submitting?: boolean;
  serverError?: string | null;
  onSubmit: (input: TransactionInput) => void;
  onCancel: () => void;
  footerStart?: ReactNode;
};

/** Répartition : de « Pas encore réparti » ou d'une enveloppe vers une autre. Aucun compte ne bouge. */
export function AllocationForm({ initial, submitLabel, submitting, serverError, onSubmit, onCancel, footerStart }: AllocationFormProps) {
  const envelopes = useEnvelopes();
  const formId = useId();
  const [amount, setAmount] = useState<number | null>(initial?.amount ?? null);
  const [fromEnvelopeId, setFromEnvelopeId] = useState<number | null>(initial?.fromEnvelopeId ?? null);
  const [envelopeId, setEnvelopeId] = useState<number | null>(initial?.envelopeId ?? null);
  const [date, setDate] = useState(initial?.date ?? today());
  const [label, setLabel] = useState(initial?.label ?? 'Répartition');
  const [note, setNote] = useState(initial?.note ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const clear = (key: string) => setErrors((e) => ({ ...e, [key]: '' }));

  function submit(e: { preventDefault(): void }) {
    e.preventDefault();
    const parsed = transactionInputSchema.safeParse({
      kind: 'allocation',
      date,
      amount: amount ?? 0,
      label,
      accountId: null,
      toAccountId: null,
      envelopeId,
      fromEnvelopeId,
      note: note.trim() || null,
    });
    const next: Record<string, string> = {};
    if (!parsed.success) for (const issue of parsed.error.issues) next[String(issue.path[0])] ??= issue.message;
    if (amount === null || amount <= 0) next.amount = 'Indique un montant';
    if (Object.keys(next).length > 0 || !parsed.success) {
      setErrors(next);
      return;
    }
    onSubmit(parsed.data);
  }

  const envelopeOptions = (envelopes.data ?? []).map((env) => ({ value: env.id, label: env.name, color: env.color }));

  return (
    <form id={formId} className={styles.form} onSubmit={submit} noValidate>
      <div>
        <AmountHero
          id={`${formId}-amount`}
          value={amount}
          onChange={(cents) => {
            setAmount(cents);
            clear('amount');
          }}
          invalid={Boolean(errors.amount)}
          describedBy={errors.amount ? `${formId}-amount-error` : undefined}
          autoFocus
        />
        {errors.amount ? (
          <p id={`${formId}-amount-error`} className={styles.amountError} role="alert">
            {errors.amount}
          </p>
        ) : null}
      </div>

      <Field label="De" error={errors.fromEnvelopeId}>
        {(id, describedBy, labelId) => (
          <ChipPicker
            id={id}
            aria-labelledby={labelId}
            aria-describedby={describedBy}
            value={fromEnvelopeId}
            onChange={(v) => {
              setFromEnvelopeId(v);
              clear('fromEnvelopeId');
            }}
            options={[{ value: null, label: 'Pas encore réparti' }, ...envelopeOptions]}
          />
        )}
      </Field>

      <Field label="Vers" error={errors.envelopeId}>
        {(id, describedBy, labelId) => (
          <ChipPicker
            id={id}
            aria-labelledby={labelId}
            aria-describedby={describedBy}
            value={envelopeId}
            onChange={(v) => {
              setEnvelopeId(v);
              clear('envelopeId');
              clear('fromEnvelopeId');
            }}
            options={envelopeOptions}
          />
        )}
      </Field>

      <div className={styles.grid}>
        <Field label="Date" error={errors.date}>
          {(id, describedBy) => <DateField id={id} aria-describedby={describedBy} value={date} onChange={(v) => v && setDate(v)} />}
        </Field>
        <Field label="Libellé" error={errors.label}>
          {(id, describedBy) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              value={label}
              onChange={(e) => {
                setLabel(e.target.value);
                clear('label');
              }}
            />
          )}
        </Field>
      </div>

      <Field label="Note">{(id, describedBy) => <Textarea id={id} aria-describedby={describedBy} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Facultatif" />}</Field>

      {serverError ? (
        <p className={styles.serverError} role="alert">
          {serverError}
        </p>
      ) : null}

      <DialogFooter start={footerStart}>
        <Button variant="ghost" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" form={formId} variant="primary" loading={submitting}>
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
```

- [ ] **Step 3: `AllocationForm.module.css`**

```css
.form {
  display: flex;
  flex-direction: column;
  gap: var(--s-5);
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--s-5);
}

.amountError {
  margin-top: var(--s-2);
  text-align: center;
  color: var(--negative);
  font-size: var(--text-sm);
}

.serverError {
  color: var(--negative);
  font-size: var(--text-sm);
}
```

Run: `npx vitest run client/src/components/envelopes/AllocationForm.test.tsx`
Expected: PASS.

- [ ] **Step 4: `AllocateDialog.tsx`**

Remplacer l'import `TransactionForm` par `import { AllocationForm } from './AllocationForm';` et le contenu du `Dialog` par :

```tsx
      {open ? (
        <AllocationForm
          initial={{ envelopeId: moving ? null : envelopeId, fromEnvelopeId, label: moving ? 'Déplacement' : 'Répartition' }}
          submitLabel={moving ? 'Déplacer' : 'Ajouter'}
          submitting={create.isPending}
          serverError={create.error ? errorMessage(create.error) : null}
          onSubmit={(input) => create.mutate(input)}
          onCancel={onClose}
        />
      ) : null}
```

- [ ] **Step 5: `TransactionEditDialog.tsx`**

Remplacer tout le fichier par :

```tsx
import { Check, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { Transaction } from '@shared/schemas';
import { errorMessage } from '@/api/client';
import { useConfirmTransaction, useDeleteTransaction, useUpdateTransaction } from '@/api/hooks';
import { AllocationForm } from '@/components/envelopes/AllocationForm';
import { Button, ConfirmDialog, Dialog, useToast } from '@/components/ui';
import { KIND_LABELS } from '@/lib/format';
import { QuickEntry } from './QuickEntry';

type TransactionEditDialogProps = { transaction: Transaction | null; onClose: () => void };

/** Édition, confirmation et suppression d'une opération existante. */
export function TransactionEditDialog({ transaction, onClose }: TransactionEditDialogProps) {
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const update = useUpdateTransaction({
    onSuccess: () => {
      toast.success('Opération modifiée');
      onClose();
    },
  });
  const confirm = useConfirmTransaction({
    onSuccess: () => {
      toast.success('Opération confirmée');
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useDeleteTransaction({
    onSuccess: () => {
      toast.success('Opération supprimée');
      setConfirmDelete(false);
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const t = transaction;
  const serverError = update.error ? errorMessage(update.error) : null;
  const deleteButton = (
    <Button variant="danger-quiet" icon={<Trash2 />} onClick={() => setConfirmDelete(true)}>
      Supprimer
    </Button>
  );

  return (
    <>
      <Dialog
        open={t !== null && !confirmDelete}
        onClose={onClose}
        title={t ? `Modifier : ${KIND_LABELS[t.kind].toLowerCase()}` : ''}
        description={t?.status === 'planned' ? 'Opération prévue par une règle récurrente, pas encore passée en banque.' : undefined}
        size={t?.kind === 'allocation' ? 'md' : 'lg'}
      >
        {t ? (
          t.kind === 'allocation' ? (
            <AllocationForm
              key={t.id}
              initial={t}
              submitLabel="Enregistrer"
              submitting={update.isPending}
              serverError={serverError}
              onSubmit={(input) => update.mutate({ id: t.id, ...input })}
              onCancel={onClose}
              footerStart={deleteButton}
            />
          ) : (
            <QuickEntry
              key={t.id}
              mode="edit"
              initial={t}
              submitting={update.isPending}
              serverError={serverError}
              onSubmit={(input) => update.mutate({ id: t.id, ...input })}
              footerStart={deleteButton}
              footerExtra={
                t.status === 'planned' ? (
                  <Button variant="ghost" icon={<Check />} loading={confirm.isPending} onClick={() => confirm.mutate(t.id)}>
                    Confirmer sans modifier
                  </Button>
                ) : null
              }
            />
          )
        ) : null}
      </Dialog>
      <ConfirmDialog
        open={t !== null && confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => t && remove.mutate(t.id)}
        title="Supprimer cette opération ?"
        description="Les soldes du compte et de l'enveloppe sont recalculés. Cette action est définitive."
        confirmLabel="Supprimer"
        loading={remove.isPending}
      >
        {t?.label}
      </ConfirmDialog>
    </>
  );
}
```

- [ ] **Step 6: Supprimer l'ancien formulaire**

Run: `git rm client/src/components/transactions/TransactionForm.tsx client/src/components/transactions/TransactionForm.module.css client/src/components/transactions/TransactionForm.test.tsx client/src/components/transactions/TransactionEditDialog.module.css`
Puis vérifier qu'il ne reste aucune référence : `grep -rn "TransactionForm" client/src` doit ne rien renvoyer.

- [ ] **Step 7: Tests, typecheck, lint, commit**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS, aucune erreur.

```bash
git add -A client/src/components/envelopes client/src/components/transactions
git commit -m "refactor(client): un seul formulaire d'opération, répartitions en pastilles"
```

---

### Task 8: Charges fixes

**Files:**
- Modify: `client/src/components/recurring/RecurringRuleForm.tsx`, `client/src/components/recurring/RecurringRuleForm.module.css`
- Modify: `client/src/components/budget/FixedCharges.tsx`
- Test: `client/src/components/recurring/RecurringRuleForm.test.tsx`

**Interfaces:**
- Consumes: `AmountHero`, `ChipPicker`, `DateField`, `DialogFooter`, `FormSection`, `Field`, `Input`, `Select`, `Segmented`, `ConfirmDialog`, `formatDateMedium`, `describeFrequency`.
- Produces: `RecurringRuleForm` garde ses props (`initial`, `submitting`, `serverError`, `onSubmit`, `onCancel`).

- [ ] **Step 1: Test qui échoue `RecurringRuleForm.test.tsx`**

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecurringRule } from '@shared/schemas';
import { RecurringRuleForm } from './RecurringRuleForm';

const accounts = [{ id: 1, name: 'Courant', initialBalance: 0, onBudget: true, bankAccountNumber: null, archived: false, createdAt: '' }];
const envelopes = [
  { id: 10, name: 'Logement', color: '#4f8a5b', monthlyTarget: null, sortOrder: 0, archived: false, isSavings: false },
  { id: 11, name: 'Restos', color: '#c2703d', monthlyTarget: null, sortOrder: 1, archived: false, isSavings: false },
];
const rule: RecurringRule = {
  id: 5,
  name: 'Loyer',
  kind: 'expense',
  amount: 98600,
  label: 'Loyer Max',
  accountId: 1,
  toAccountId: null,
  envelopeId: 10,
  fromEnvelopeId: null,
  frequency: 'monthly',
  interval: 1,
  dayOfMonth: 1,
  startDate: '2026-10-01',
  endDate: null,
  lastGeneratedDate: null,
  active: true,
};

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const body = url.startsWith('/api/accounts') ? accounts : url.startsWith('/api/envelopes') ? envelopes : [];
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  );
});

function renderForm(onSubmit = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <RecurringRuleForm initial={rule} onSubmit={onSubmit} onCancel={vi.fn()} />
    </QueryClientProvider>,
  );
  return onSubmit;
}

describe('RecurringRuleForm', () => {
  it('résume la fréquence et affiche une fin facultative', async () => {
    renderForm();
    expect(await screen.findByText('Tous les mois le 1er, à partir du 1 oct. 2026')).toBeInTheDocument();
    expect(screen.getByLabelText('Montant')).toHaveValue('986,00');
    expect(screen.getByRole('button', { name: 'Jusqu’au' })).toHaveTextContent('Sans fin');
    expect(screen.getByRole('group', { name: 'Quand' })).toBeInTheDocument();
  });

  it('change d’enveloppe en pastilles et enregistre', async () => {
    const onSubmit = renderForm();
    await screen.findByRole('option', { name: 'Courant' });
    await userEvent.click(screen.getByRole('radio', { name: 'Restos' }));
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: 'Loyer', amount: 98600, envelopeId: 11, accountId: 1, dayOfMonth: 1, endDate: null }));
  });
});
```

Run: `npx vitest run client/src/components/recurring/RecurringRuleForm.test.tsx`
Expected: FAIL (pas de résumé, pas de `radio`).

- [ ] **Step 2: Réécrire le rendu de `RecurringRuleForm.tsx`**

Imports :

```tsx
import { useId, useState } from 'react';
import { formatDateMedium, today } from '@shared/dates';
import { recurringRuleInputSchema, type Frequency, type RecurringRule, type RecurringRuleInput, type TransactionKind } from '@shared/schemas';
import { useAccounts, useEnvelopes } from '@/api/hooks';
import { AmountHero, Button, ChipPicker, DateField, DialogFooter, Field, FormSection, Input, Segmented, Select } from '@/components/ui';
import { FREQUENCY_LABELS, KIND_LABELS } from '@/lib/format';
import { describeFrequency } from './frequency';
import styles from './RecurringRuleForm.module.css';
```

Dans `Values`, typer `endDate: string | null;` et dans `initialValues` mettre `endDate: initial?.endDate ?? null,`.
Dans `toInput`, remplacer `endDate: v.endDate || null,` par `endDate: v.endDate,`.

Dans le composant, après `const [errors, ...]`, ajouter `const formId = useId();`.
Remplacer tout depuis `const accountOptions = ...` jusqu'à la fin du composant par :

```tsx
  const accountOptions = (accounts.data ?? []).map((a) => (
    <option key={a.id} value={a.id}>
      {a.name}
    </option>
  ));
  const monthly = values.frequency === 'monthly' || values.frequency === 'yearly';
  const unitLabel = { daily: 'jours', weekly: 'semaines', monthly: 'mois', yearly: 'ans' }[values.frequency];
  const summary = [
    describeFrequency({ frequency: values.frequency, interval: Number(values.interval) || 1, dayOfMonth: monthly ? Number(values.dayOfMonth) || null : null, startDate: values.startDate }),
    `à partir du ${formatDateMedium(values.startDate)}`,
    values.endDate ? `jusqu’au ${formatDateMedium(values.endDate)}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <form id={formId} className={styles.form} onSubmit={submit} noValidate>
      <div className={styles.top}>
        <Segmented label="Type d'opération" value={values.kind} onChange={(k) => set('kind', k)} options={KIND_OPTIONS} />
        <AmountHero
          id={`${formId}-amount`}
          value={values.amount}
          onChange={(c) => set('amount', c)}
          sign={values.kind === 'expense' ? '−' : values.kind === 'income' ? '+' : ''}
          tone={values.kind === 'income' ? 'income' : 'neutral'}
          invalid={Boolean(errors.amount)}
          describedBy={errors.amount ? `${formId}-amount-error` : undefined}
        />
        {errors.amount ? (
          <p id={`${formId}-amount-error`} className={styles.amountError} role="alert">
            {errors.amount}
          </p>
        ) : null}
      </div>

      <div className={styles.grid}>
        <Field label="Nom" error={errors.name}>
          {(id, by) => <Input id={id} aria-describedby={by} value={values.name} onChange={(e) => set('name', e.target.value)} placeholder="Loyer" autoFocus />}
        </Field>
        <Field label="Libellé des opérations" hint="Par défaut, le nom de la règle" error={errors.label}>
          {(id, by) => <Input id={id} aria-describedby={by} value={values.label} onChange={(e) => set('label', e.target.value)} placeholder={values.name || 'Loyer'} />}
        </Field>
      </div>

      <div className={styles.grid}>
        <Field label={values.kind === 'transfer' ? 'Depuis le compte' : 'Compte'} error={errors.accountId}>
          {(id, by) => (
            <Select id={id} aria-describedby={by} value={effective.accountId ?? ''} onChange={(e) => set('accountId', e.target.value ? Number(e.target.value) : null)}>
              <option value="">Choisir</option>
              {accountOptions}
            </Select>
          )}
        </Field>
        {values.kind === 'transfer' ? (
          <Field label="Vers le compte" error={errors.toAccountId}>
            {(id, by) => (
              <Select id={id} aria-describedby={by} value={values.toAccountId ?? ''} onChange={(e) => set('toAccountId', e.target.value ? Number(e.target.value) : null)}>
                <option value="">Choisir</option>
                {accountOptions}
              </Select>
            )}
          </Field>
        ) : null}
      </div>

      {values.kind === 'expense' ? (
        <Field label="Enveloppe" error={errors.envelopeId}>
          {(id, by, labelId) => (
            <ChipPicker
              id={id}
              aria-labelledby={labelId}
              aria-describedby={by}
              value={values.envelopeId}
              onChange={(v) => set('envelopeId', v)}
              options={[{ value: null, label: 'À ranger' }, ...(envelopes.data ?? []).map((env) => ({ value: env.id, label: env.name, color: env.color }))]}
            />
          )}
        </Field>
      ) : null}

      <FormSection title="Quand">
        <div className={styles.grid}>
          <Field label="Répéter" error={errors.frequency}>
            {(id, by) => (
              <Select id={id} aria-describedby={by} value={values.frequency} onChange={(e) => set('frequency', e.target.value as Frequency)}>
                {FREQUENCY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={`Tous les N ${unitLabel}`} error={errors.interval}>
            {(id, by) => <Input id={id} aria-describedby={by} type="number" min={1} max={365} value={values.interval} onChange={(e) => set('interval', e.target.value)} />}
          </Field>
          {monthly ? (
            <Field label="Jour du mois" hint="31 tombe le dernier jour des mois courts" error={errors.dayOfMonth}>
              {(id, by) => <Input id={id} aria-describedby={by} type="number" min={1} max={31} value={values.dayOfMonth} onChange={(e) => set('dayOfMonth', e.target.value)} />}
            </Field>
          ) : null}
        </div>
        <div className={styles.grid}>
          <Field label="À partir du" error={errors.startDate}>
            {(id, by) => <DateField id={id} aria-describedby={by} value={values.startDate} onChange={(v) => v && set('startDate', v)} />}
          </Field>
          <Field label="Jusqu’au" error={errors.endDate}>
            {(id, by) => <DateField id={id} aria-describedby={by} value={values.endDate} onChange={(v) => set('endDate', v)} placeholder="Sans fin" clearable min={values.startDate} />}
          </Field>
        </div>
        <p className={styles.summary} aria-live="polite">
          {summary}
        </p>
      </FormSection>

      {serverError ? (
        <p className={styles.serverError} role="alert">
          {serverError}
        </p>
      ) : null}

      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" form={formId} variant="primary" loading={submitting}>
          {initial ? 'Enregistrer' : 'Ajouter'}
        </Button>
      </DialogFooter>
    </form>
  );
}
```

Supprimer la constante `envelopeOptions` (remplacée par les options du `ChipPicker`).

- [ ] **Step 3: `RecurringRuleForm.module.css`**

Remplacer tout le fichier par :

```css
.form {
  display: flex;
  flex-direction: column;
  gap: var(--s-6);
}

.top {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--s-2);
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--s-5);
}

.amountError {
  color: var(--negative);
  font-size: var(--text-sm);
}

.summary {
  font-size: var(--text-sm);
  color: var(--ink-soft);
}

.serverError {
  color: var(--negative);
  font-size: var(--text-sm);
}
```

- [ ] **Step 4: `FixedCharges.tsx`**

- Import : remplacer `Dialog` par `ConfirmDialog, Dialog` dans l'import `@/components/ui` (garder `Button` s'il sert encore ailleurs dans le fichier, sinon le retirer).
- Le `Dialog` de création et modification passe en `size="md"`.
- Remplacer le `Dialog` de suppression par :

```tsx
      <ConfirmDialog
        open={dialog?.mode === 'delete'}
        onClose={() => setDialog(null)}
        onConfirm={() => dialog?.mode === 'delete' && remove.mutate(dialog.rule.id)}
        title="Supprimer cette ligne ?"
        description="Les opérations déjà passées restent. Plus aucune occurrence ne sera attendue."
        confirmLabel="Supprimer"
        loading={remove.isPending}
        error={remove.error ? errorMessage(remove.error) : null}
      >
        {dialog?.mode === 'delete' ? (
          <span>
            <strong>{dialog.rule.name}</strong>, {describeFrequency(dialog.rule).toLowerCase()}.
          </span>
        ) : null}
      </ConfirmDialog>
```

- Supprimer de `FixedCharges.module.css` la règle `.error` si elle n'est plus utilisée (`grep -n "styles.error" client/src/components/budget/FixedCharges.tsx`).

- [ ] **Step 5: Tests, typecheck, lint, commit**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS, aucune erreur.

```bash
git add client/src/components/recurring client/src/components/budget
git commit -m "feat(client): charges fixes avec montant héros, section Quand et résumé lisible"
```

---

### Task 9: Enveloppe, compte, règle de tri, archivages

**Files:**
- Modify: `client/src/components/envelopes/EnvelopeFormDialog.tsx`, `EnvelopeFormDialog.module.css`
- Modify: `client/src/pages/Budget.tsx`, `client/src/pages/Budget.module.css`
- Modify: `client/src/components/sorting/SortingRuleDialog.tsx`, `SortingRuleDialog.module.css`
- Modify: `client/src/pages/settings/Accounts.tsx`, `client/src/pages/settings/Accounts.module.css`
- Test: `client/src/components/sorting/SortingRuleDialog.test.tsx`

**Interfaces:**
- Consumes: `Checkbox`, `ChipPicker`, `ConfirmDialog`, `DialogFooter`, `Field`, `Input`, `MoneyInput`.

- [ ] **Step 1: Test qui échoue `SortingRuleDialog.test.tsx`**

```tsx
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SortingRuleDialog } from './SortingRuleDialog';

const envelopes = [
  { id: 10, name: 'Courses', color: '#4f8a5b', monthlyTarget: null, sortOrder: 0, archived: false, isSavings: false },
  { id: 11, name: 'Restos', color: '#c2703d', monthlyTarget: null, sortOrder: 1, archived: false, isSavings: false },
];

describe('SortingRuleDialog', () => {
  it('range dans une enveloppe choisie en pastilles', async () => {
    const onSubmit = vi.fn();
    render(<SortingRuleDialog open onClose={vi.fn()} envelopes={envelopes} onSubmit={onSubmit} />);
    const dialog = screen.getByRole('dialog', { name: 'Nouvelle règle de tri', hidden: true });
    await userEvent.type(within(dialog).getByLabelText('Le libellé contient'), 'carrefour');
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Restos', hidden: true }));
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Créer la règle', hidden: true }));
    expect(onSubmit).toHaveBeenCalledWith({ pattern: 'carrefour', envelopeId: 11 });
  });
});
```

Run: `npx vitest run client/src/components/sorting/SortingRuleDialog.test.tsx`
Expected: FAIL, aucun `radio` « Restos ».

- [ ] **Step 2: `SortingRuleDialog.tsx`**

Imports : `import { useId, useState } from 'react';` et `import { Button, ChipPicker, Dialog, DialogFooter, Field, Input } from '@/components/ui';`.
Dans `RuleForm`, ajouter `const formId = useId();`, puis remplacer le `return (...)` par :

```tsx
  return (
    <form id={formId} className={styles.form} onSubmit={submit} noValidate>
      <Field label="Le libellé contient" error={errors.pattern} hint="Sans tenir compte de la casse ni des accents">
        {(id, describedBy) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            value={pattern}
            autoFocus
            placeholder="carrefour"
            className="mono"
            onChange={(e) => {
              setPattern(e.target.value);
              setErrors((er) => ({ ...er, pattern: undefined }));
            }}
          />
        )}
      </Field>
      <Field label="Ranger dans" error={errors.envelopeId}>
        {(id, describedBy, labelId) => (
          <ChipPicker
            id={id}
            aria-labelledby={labelId}
            aria-describedby={describedBy}
            value={envelopeId}
            onChange={(v) => {
              setEnvelopeId(v);
              setErrors((er) => ({ ...er, envelopeId: undefined }));
            }}
            options={envelopes.map((env) => ({ value: env.id, label: env.name, color: env.color }))}
          />
        )}
      </Field>
      {serverError ? (
        <p className={styles.serverError} role="alert">
          {serverError}
        </p>
      ) : null}
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" form={formId} variant="primary" loading={submitting}>
          {initial ? 'Enregistrer' : 'Créer la règle'}
        </Button>
      </DialogFooter>
    </form>
  );
```

Le `Dialog` passe en `size="md"` (11 enveloppes en pastilles).
Dans `SortingRuleDialog.module.css`, supprimer `.actions` et passer `.form` à `gap: var(--s-5);`.

Run: `npx vitest run client/src/components/sorting/SortingRuleDialog.test.tsx`
Expected: PASS.

- [ ] **Step 3: `EnvelopeFormDialog.tsx`**

Imports : `import { useId, useState } from 'react';` et `import { Button, Checkbox, Dialog, DialogFooter, Field, Input, MoneyInput, useToast } from '@/components/ui';`.
Ajouter `const formId = useId();` après `const toast = useToast();`.
Remplacer le `<form ...>` complet par :

```tsx
      <form id={formId} className={styles.form} onSubmit={submit} noValidate>
        <Field label="Nom" error={errors.name}>
          {(id, describedBy) => <Input id={id} aria-describedby={describedBy} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Courses" autoFocus />}
        </Field>
        <Field label="Couleur" error={errors.color}>
          {(id, _describedBy, labelId) => (
            <div className={styles.colors} role="group" aria-labelledby={labelId}>
              {ENVELOPE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={[styles.swatch, form.color === c ? styles.swatchActive : ''].join(' ')}
                  style={{ background: c }}
                  onClick={() => set('color', c)}
                  aria-label={`Couleur ${c}`}
                  aria-pressed={form.color === c}
                />
              ))}
              <label className={[styles.custom, ENVELOPE_COLORS.includes(form.color) ? '' : styles.swatchActive].join(' ')} title="Couleur personnalisée">
                <input id={id} type="color" value={form.color} onChange={(e) => set('color', e.target.value)} aria-label="Couleur personnalisée" />
                <span style={{ background: form.color }} />
              </label>
            </div>
          )}
        </Field>
        <Field label="Budget mensuel" hint="Ce que tu prévois d’y mettre chaque mois. « Répartir » le propose automatiquement et la prévision en tient compte." error={errors.monthlyTarget}>
          {(id, describedBy) => <MoneyInput id={id} aria-describedby={describedBy} value={form.monthlyTarget} onChange={(c) => set('monthlyTarget', c)} placeholder="Facultatif" />}
        </Field>
        <Checkbox
          label="Enveloppe d’épargne"
          hint="Ce qui en sort (versement vers un courtier, un PEA) compte comme mis de côté, pas comme une dépense."
          checked={form.isSavings}
          onChange={(e) => set('isSavings', e.target.checked)}
        />
        {serverError ? (
          <p className={styles.error} role="alert">
            {errorMessage(serverError)}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={create.isPending || update.isPending}>
            {envelope ? 'Enregistrer' : 'Créer l’enveloppe'}
          </Button>
        </DialogFooter>
      </form>
```

Dans `EnvelopeFormDialog.module.css` :
- `.form` passe à `gap: var(--s-5);` ;
- supprimer `.actions`, `.check`, `.check input`, `.checkHint` ;
- remplacer `.swatchActive` par :

```css
.swatchActive {
  box-shadow:
    0 0 0 2px var(--paper-raised),
    0 0 0 4px var(--ink);
}
```

- dans `.swatch`, remplacer `border: 2px solid transparent;` par `border: none;`.

- [ ] **Step 4: Archivage d'enveloppe dans `Budget.tsx`**

Ajouter `ConfirmDialog` à l'import `@/components/ui` et remplacer le `Dialog` « Archiver cette enveloppe ? » par :

```tsx
      <ConfirmDialog
        open={archiving !== null}
        onClose={() => setArchiving(null)}
        onConfirm={() => archiving && archive.mutate({ id: archiving.id, archived: true })}
        title="Archiver cette enveloppe ?"
        description="Elle disparaît du budget et son solde revient dans « Pas encore réparti ». Les dépenses déjà rangées dedans sont conservées."
        confirmLabel="Archiver"
        loading={archive.isPending}
      >
        {archiving ? (
          <>
            <Dot color={archiving.color} /> {archiving.name}
            {archiving.balance !== 0 ? (
              <span className={styles.hint}>
                Solde actuel : <Amount cents={archiving.balance} size="sm" />
              </span>
            ) : null}
          </>
        ) : null}
      </ConfirmDialog>
```

Garder tel quel le reste du bloc d'origine s'il contient d'autres éléments après le solde (les recopier dans le `ConfirmDialog`).
Supprimer `.dialogName` de `Budget.module.css` s'il n'est plus utilisé (`grep -n "dialogName" client/src/pages/Budget.tsx`).
Retirer `Button` de l'import s'il n'est plus utilisé dans `Budget.tsx`.

- [ ] **Step 5: Comptes dans `Accounts.tsx`**

Imports : `import { useId, useState } from 'react';` et `import { Amount, Badge, Button, Checkbox, ConfirmDialog, Dialog, DialogFooter, EmptyState, Field, Input, MoneyInput, SkeletonRows, useToast } from '@/components/ui';`.
Dans `AccountDialog`, ajouter `const formId = useId();` et remplacer le `<form>` par :

```tsx
      <form id={formId} className={styles.form} onSubmit={submit} noValidate>
        <Field label="Nom" error={errors.name}>
          {(id, describedBy) => <Input id={id} aria-describedby={describedBy} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Compte courant" autoFocus />}
        </Field>
        <Field label="Solde initial" hint="Le solde au moment où tu commences à suivre ce compte." error={errors.initialBalance}>
          {(id, describedBy) => <MoneyInput id={id} aria-describedby={describedBy} value={form.initialBalance} onChange={(c) => set('initialBalance', c)} allowNegative />}
        </Field>
        <Checkbox
          label="Compte d’épargne"
          hint="Livret, assurance vie : son argent reste hors du budget, et ce que tu y verses compte comme mis de côté."
          checked={!form.onBudget}
          onChange={(e) => set('onBudget', !e.target.checked)}
        />
        <Field label="Numéro de compte bancaire" hint="Facultatif. Rempli automatiquement au premier import." error={errors.bankAccountNumber}>
          {(id, describedBy) => <Input id={id} aria-describedby={describedBy} value={form.bankAccountNumber} onChange={(e) => set('bankAccountNumber', e.target.value)} className="mono" spellCheck={false} />}
        </Field>
        {serverError ? (
          <p className={styles.error} role="alert">
            {errorMessage(serverError)}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={pending}>
            {account ? 'Enregistrer' : 'Créer le compte'}
          </Button>
        </DialogFooter>
      </form>
```

Remplacer le `return` de `ArchiveDialog` par :

```tsx
  return (
    <ConfirmDialog
      open={account !== null}
      onClose={onClose}
      onConfirm={() => account && update.mutate({ id: account.id, archived: archiving })}
      title={archiving ? 'Archiver ce compte ?' : 'Réactiver ce compte ?'}
      description={archiving ? 'Le compte disparaît des listes et du total. Ses opérations sont conservées.' : 'Le compte réapparaît dans les listes et le total.'}
      confirmLabel={archiving ? 'Archiver' : 'Réactiver'}
      tone={archiving ? 'danger' : 'primary'}
      loading={update.isPending}
      error={update.error ? errorMessage(update.error) : null}
    >
      {account?.name}
    </ConfirmDialog>
  );
```

Dans `Accounts.module.css`, supprimer `.check`, `.check input`, `.checkHint`, `.actions` (le bloc du formulaire) et `.dialogName` s'ils ne sont plus référencés (`grep -n "styles\.\(check\|checkHint\|actions\|dialogName\)" client/src/pages/settings/Accounts.tsx`), et passer `.form` à `gap: var(--s-5);`.
Retirer `Dialog` de l'import s'il ne sert plus qu'à `AccountDialog` (il y sert encore : le garder).

- [ ] **Step 6: Tests, typecheck, lint, commit**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS, aucune erreur.

```bash
git add client/src
git commit -m "feat(client): enveloppe, compte et règle de tri au nouveau format, confirmations unifiées"
```

---

### Task 10: Répartir l'argent du mois

**Files:**
- Modify: `client/src/components/budget/FundDialog.tsx`, `client/src/components/budget/FundDialog.module.css`
- Test: `client/src/components/budget/FundDialog.test.tsx`

**Interfaces:**
- Consumes: `DialogFooter` (prop `info`).

- [ ] **Step 1: Test qui échoue `FundDialog.test.tsx`**

Lire d'abord la signature exacte de `FundDialogProps` et le type des enveloppes reçues (`grep -n "type FundDialogProps" -A8 client/src/components/budget/FundDialog.tsx`) ; le test ci-dessous suppose `envelopes: EnvelopeWithBalance[]` avec `toFundThisMonth` et `monthlyTarget`. Adapter les champs du fixture au type réel si `typecheck` le demande.

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui';
import { FundDialog } from './FundDialog';

const envelopes = [
  { id: 10, name: 'Courses', color: '#4f8a5b', monthlyTarget: 15000, sortOrder: 0, archived: false, isSavings: false, balance: 0, toFundThisMonth: 15000 },
  { id: 11, name: 'Restos', color: '#c2703d', monthlyTarget: null, sortOrder: 1, archived: false, isSavings: false, balance: 0, toFundThisMonth: 0 },
] as never[];

describe('FundDialog', () => {
  it('garde le récapitulatif et le bouton dans le pied du dialogue', async () => {
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <FundDialog open onClose={vi.fn()} envelopes={envelopes} toAllocate={20000} />
        </ToastProvider>
      </QueryClientProvider>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Répartir l’argent du mois', hidden: true });
    const footer = dialog.querySelector('footer')!;
    expect(await within(footer).findByText('À répartir')).toBeInTheDocument();
    expect(within(footer).getByRole('button', { name: /Répartir 150,00/, hidden: true })).toBeInTheDocument();
    expect(within(footer).getByText('Restera non réparti')).toBeInTheDocument();
  });
});
```

Run: `npx vitest run client/src/components/budget/FundDialog.test.tsx`
Expected: FAIL, le récapitulatif n'est pas dans le `footer`.

- [ ] **Step 2: `FundDialog.tsx`**

Imports : ajouter `useId` à l'import `react` et `DialogFooter` à l'import `@/components/ui`.
Dans `FundForm`, ajouter `const formId = useId();`, mettre `id={formId}` sur le `<form>`, et remplacer tout le bloc `<div className={styles.footer}> ... </div>` par :

```tsx
      <DialogFooter
        info={
          <div className={styles.info}>
            <div className={styles.summary}>
              <div>
                <span className={styles.summaryLabel}>À répartir</span>
                <Amount cents={total} tone="neutral" size="lg" />
              </div>
              <div className={styles.summaryRight}>
                <span className={styles.summaryLabel}>{left >= 0 ? 'Restera non réparti' : 'Dépasse ce qui est disponible de'}</span>
                <Amount cents={Math.abs(left)} tone="neutral" className={left < 0 ? styles.negative : ''} />
              </div>
            </div>
            {left < 0 ? (
              <p className={styles.warning} role="status">
                Tu répartis plus que l’argent disponible sur tes comptes. Les enveloppes seront remplies, mais « Pas encore réparti » passera en négatif.
              </p>
            ) : null}
            {fund.error ? (
              <p className={styles.error} role="alert">
                {errorMessage(fund.error)}
              </p>
            ) : null}
          </div>
        }
      >
        <Button variant="ghost" onClick={onClose}>
          Annuler
        </Button>
        <Button type="submit" form={formId} variant="primary" loading={fund.isPending} disabled={items.length === 0}>
          {items.length > 0 ? `Répartir ${formatEuros(total)}` : 'Répartir'}
        </Button>
      </DialogFooter>
```

- [ ] **Step 3: `FundDialog.module.css`**

- Supprimer `.footer` et `.actions`.
- Ajouter :

```css
.info {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
  padding-bottom: var(--s-1);
}
```

- `.input` devient `width: 128px;` (le `text-align` est déjà géré par `MoneyInput`).

- [ ] **Step 4: Tests, typecheck, lint, commit**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS.

```bash
git add client/src/components/budget
git commit -m "feat(client): récapitulatif de répartition toujours visible dans le pied du dialogue"
```

---

### Task 11: Pastilles de barre d'outils

**Files:**
- Create: `client/src/components/ui/Pills.tsx`, `client/src/components/ui/Pills.module.css`
- Modify: `client/src/components/ui/index.ts`
- Test: `client/src/components/ui/Pills.test.tsx`

**Interfaces:**
- Produces:
  - `SearchPill` : forwardRef `HTMLInputElement`, props `Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>` (rend un `type="search"`).
  - `FilterPill(props: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'> & { value: string; onChange: (value: string) => void; resetValue?: string })` : active (encre + croix) quand `resetValue` est défini et différent de `value`.
  - `InlinePill(props: { 'aria-label': string; value: number | null; onChange: (value: number | null) => void; options: { value: number; label: string; color?: string }[]; placeholder: string; tone?: 'suggested'; disabled?: boolean })`.

- [ ] **Step 1: Test qui échoue `Pills.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { FilterPill, InlinePill, SearchPill } from './Pills';

describe('SearchPill', () => {
  it('est un champ de recherche nommé', () => {
    render(<SearchPill aria-label="Rechercher" placeholder="Rechercher un libellé (/)" />);
    expect(screen.getByRole('searchbox', { name: 'Rechercher' })).toBeInTheDocument();
  });
});

describe('FilterPill', () => {
  function Harness({ onChange }: { onChange: (v: string) => void }) {
    const [value, setValue] = useState('');
    return (
      <FilterPill
        aria-label="Compte"
        value={value}
        resetValue=""
        onChange={(v) => {
          setValue(v);
          onChange(v);
        }}
      >
        <option value="">Tous les comptes</option>
        <option value="1">Courant</option>
      </FilterPill>
    );
  }

  it('propose une croix seulement quand le filtre est actif', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    expect(screen.queryByRole('button', { name: 'Effacer le filtre Compte' })).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Compte'), '1');
    expect(onChange).toHaveBeenLastCalledWith('1');
    await userEvent.click(screen.getByRole('button', { name: 'Effacer le filtre Compte' }));
    expect(onChange).toHaveBeenLastCalledWith('');
    expect(screen.getByLabelText('Compte')).toHaveValue('');
  });
});

describe('InlinePill', () => {
  const options = [
    { value: 10, label: 'Courses', color: '#4f8a5b' },
    { value: 11, label: 'Restos', color: '#c2703d' },
  ];

  it('affiche le texte d’attente puis l’enveloppe choisie', async () => {
    const onChange = vi.fn();
    function Harness() {
      const [value, setValue] = useState<number | null>(null);
      return (
        <InlinePill
          aria-label="Enveloppe pour UBER"
          value={value}
          placeholder="+ Enveloppe"
          options={options}
          onChange={(v) => {
            setValue(v);
            onChange(v);
          }}
        />
      );
    }
    const { container } = render(<Harness />);
    expect(container).toHaveTextContent('+ Enveloppe');
    await userEvent.selectOptions(screen.getByLabelText('Enveloppe pour UBER'), '11');
    expect(onChange).toHaveBeenLastCalledWith(11);
    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent('Restos');
  });
});
```

Run: `npx vitest run client/src/components/ui/Pills.test.tsx`
Expected: FAIL, import introuvable.

- [ ] **Step 2: `Pills.tsx`**

```tsx
import { ChevronDown, Search, X } from 'lucide-react';
import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes } from 'react';
import { Dot } from './Badge';
import styles from './Pills.module.css';

/** Recherche en pastille, pour les barres d'outils. */
export const SearchPill = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>>(function SearchPill({ className, ...rest }, ref) {
  return (
    <span className={[styles.pill, styles.search, className ?? ''].join(' ')}>
      <Search aria-hidden className={styles.icon} />
      <input ref={ref} type="search" className={styles.searchInput} {...rest} />
    </span>
  );
});

type FilterPillProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'> & {
  value: string;
  onChange: (value: string) => void;
  /** Valeur neutre (« Tous ») : ailleurs, la pastille passe en encre et propose une croix. */
  resetValue?: string;
};

/** Filtre en pastille : un select natif habillé. */
export function FilterPill({ value, onChange, resetValue, className, children, ...rest }: FilterPillProps) {
  const active = resetValue !== undefined && value !== resetValue;
  const name = rest['aria-label'];
  return (
    <span className={[styles.pill, styles.filter, active ? styles.active : '', className ?? ''].join(' ')}>
      <select className={styles.select} value={value} onChange={(e) => onChange(e.target.value)} {...rest}>
        {children}
      </select>
      {active ? (
        <button type="button" className={styles.clear} onClick={() => onChange(resetValue)} aria-label={name ? `Effacer le filtre ${name}` : 'Effacer le filtre'}>
          <X aria-hidden />
        </button>
      ) : (
        <ChevronDown aria-hidden className={styles.caret} />
      )}
    </span>
  );
}

type InlinePillOption = { value: number; label: string; color?: string };

type InlinePillProps = {
  'aria-label': string;
  value: number | null;
  onChange: (value: number | null) => void;
  options: InlinePillOption[];
  placeholder: string;
  /** Valeur proposée (règle, Claude) en attente de validation. */
  tone?: 'suggested';
  disabled?: boolean;
};

/** Choix d'enveloppe dans une ligne de liste : pointillés tant que rien n'est choisi, puce pleine ensuite. */
export function InlinePill({ value, onChange, options, placeholder, tone, disabled, 'aria-label': ariaLabel }: InlinePillProps) {
  const current = options.find((o) => o.value === value);
  return (
    <div className={[styles.inline, current ? styles.filled : '', tone === 'suggested' ? styles.suggested : '', disabled ? styles.disabled : ''].join(' ')}>
      <span className={styles.face} aria-hidden="true">
        {current ? (
          <>
            {current.color ? <Dot color={current.color} size={8} /> : null}
            <span className={styles.faceLabel}>{current.label}</span>
          </>
        ) : (
          <span className={styles.faceLabel}>{placeholder}</span>
        )}
        <ChevronDown className={styles.caret} />
      </span>
      <select aria-label={ariaLabel} className={styles.overlay} value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
```

- [ ] **Step 3: `Pills.module.css`**

```css
.pill {
  position: relative;
  display: inline-flex;
  align-items: center;
  height: 34px;
  border-radius: var(--radius-pill);
  background: var(--paper-sunken);
  color: var(--ink-soft);
  font-size: var(--text-sm);
  transition:
    background var(--dur) var(--ease-out),
    color var(--dur) var(--ease-out);
}

.pill:focus-within {
  box-shadow:
    0 0 0 2px var(--paper),
    0 0 0 4px var(--marking);
}

.icon {
  position: absolute;
  left: var(--s-3);
  width: 15px;
  height: 15px;
  color: var(--ink-mute);
  pointer-events: none;
}

.search {
  flex: 1 1 260px;
}

.searchInput {
  width: 100%;
  height: 100%;
  padding: 0 var(--s-4) 0 var(--s-8);
  border: none;
  border-radius: inherit;
  background: none;
  color: var(--ink);
}

.searchInput::placeholder {
  color: var(--ink-mute);
}

.searchInput:focus,
.searchInput:focus-visible {
  outline: none;
}

.select {
  height: 100%;
  max-width: 240px;
  padding: 0 var(--s-8) 0 var(--s-4);
  border: none;
  border-radius: inherit;
  background: none;
  color: inherit;
  font: inherit;
  text-overflow: ellipsis;
  appearance: none;
  cursor: pointer;
}

.select:focus,
.select:focus-visible {
  outline: none;
}

.select option,
.overlay option {
  color: var(--ink);
  background: var(--paper-raised);
}

.caret {
  position: absolute;
  right: var(--s-3);
  width: 14px;
  height: 14px;
  color: var(--ink-mute);
  pointer-events: none;
}

.filter:hover {
  color: var(--ink);
}

.active {
  background: var(--ink);
  color: var(--paper);
}

.active:hover {
  color: var(--paper);
}

.clear {
  position: absolute;
  right: var(--s-2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: var(--radius-pill);
  background: none;
  color: var(--rule-strong);
}

.clear:hover {
  background: color-mix(in oklab, var(--paper) 18%, transparent);
  color: var(--paper);
}

.clear :global(svg) {
  width: 13px;
  height: 13px;
}

/* Select en ligne : la face est décorative, le select natif transparent la recouvre */
.inline {
  position: relative;
  display: inline-flex;
  max-width: 100%;
}

.face {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  height: 28px;
  padding: 0 var(--s-6) 0 var(--s-3);
  border: 1px dashed var(--rule-strong);
  border-radius: var(--radius-pill);
  color: var(--ink-mute);
  font-size: var(--text-sm);
  white-space: nowrap;
  transition:
    border-color var(--dur) var(--ease-out),
    color var(--dur) var(--ease-out),
    background var(--dur) var(--ease-out);
}

.faceLabel {
  overflow: hidden;
  text-overflow: ellipsis;
}

.face .caret {
  right: var(--s-2);
  width: 12px;
  height: 12px;
}

.inline:hover .face {
  border-color: var(--ink-mute);
  color: var(--ink);
}

.filled .face {
  border-style: solid;
  border-color: var(--rule);
  color: var(--ink);
}

.suggested .face {
  border-style: solid;
  border-color: var(--marking);
  background: var(--marking-soft);
  color: var(--ink);
}

.inline:focus-within .face {
  box-shadow:
    0 0 0 2px var(--paper),
    0 0 0 4px var(--marking);
}

.disabled {
  opacity: 0.5;
}

.overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  opacity: 0;
  cursor: pointer;
}

.overlay:disabled {
  cursor: not-allowed;
}
```

- [ ] **Step 4: Export, tests, commit**

Dans `index.ts`, après `export { MoneyInput } from './MoneyInput';` :

```ts
export { FilterPill, InlinePill, SearchPill } from './Pills';
```

Run: `npx vitest run client/src/components/ui/Pills.test.tsx && npm run typecheck && npm run lint`
Expected: PASS, aucune erreur.

```bash
git add client/src/components/ui
git commit -m "feat(client): pastilles de recherche, de filtre et de choix en ligne"
```

---

### Task 12: Barres de filtres et listes en pastilles, fin de `DateInput`

**Files:**
- Modify: `client/src/components/transactions/TransactionFilters.tsx`, `TransactionFilters.module.css`
- Modify: `client/src/pages/Analyse.tsx`, `client/src/pages/Analyse.module.css`
- Modify: `client/src/components/analyse/Upcoming.tsx`, `client/src/components/analyse/Upcoming.module.css`
- Modify: `client/src/components/transactions/UnsortedList.tsx`, `client/src/components/transactions/UnsortedList.module.css`
- Modify: `client/src/components/import/ImportPreview.tsx`, `client/src/components/import/ImportPreview.module.css`
- Modify: `client/src/components/ui/Input.tsx`, `client/src/components/ui/index.ts` (suppression de `DateInput`)

**Interfaces:**
- Consumes: `SearchPill`, `FilterPill`, `InlinePill`, `DateRangeField`.

- [ ] **Step 1: `TransactionFilters.tsx`**

Imports : `import { X } from 'lucide-react';` et `import { Button, DateRangeField, FilterPill, SearchPill, Segmented } from '@/components/ui';` (le `Search` de lucide n'est plus utilisé ici).
Remplacer le `return (...)` du composant par :

```tsx
  return (
    <div className={styles.filters}>
      <div className={styles.line}>
        <SearchPill placeholder="Rechercher un libellé (/)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher" />
        <Segmented
          label="Période"
          value={value.period}
          onChange={(period) => onChange({ ...value, period })}
          options={[
            { value: 'month', label: 'Ce mois' },
            { value: 'last-month', label: 'Mois dernier' },
            { value: '30d', label: '30 jours' },
            { value: 'all', label: 'Tout' },
            { value: 'custom', label: 'Dates' },
          ]}
        />
      </div>

      <div className={styles.line}>
        <FilterPill aria-label="Compte" value={value.account ? String(value.account) : ''} resetValue="" onChange={(v) => onChange({ ...value, account: v ? Number(v) : undefined })}>
          <option value="">Tous les comptes</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </FilterPill>
        <FilterPill aria-label="Enveloppe" value={value.envelope ? String(value.envelope) : ''} resetValue="" onChange={(v) => onChange({ ...value, envelope: v ? Number(v) : undefined })}>
          <option value="">Toutes les enveloppes</option>
          {envelopes.map((env) => (
            <option key={env.id} value={env.id}>
              {env.name}
            </option>
          ))}
        </FilterPill>
        {value.period === 'custom' ? (
          <DateRangeField
            variant="pill"
            aria-label="Période personnalisée"
            from={value.from ?? null}
            to={value.to ?? null}
            onChange={({ from, to }) => onChange({ ...value, from: from ?? undefined, to: to ?? undefined })}
          />
        ) : null}
        <Segmented
          label="Statut"
          value={value.status ?? 'all'}
          onChange={(s) => onChange({ ...value, status: s === 'all' ? undefined : s })}
          options={[
            { value: 'all', label: 'Toutes' },
            { value: 'confirmed', label: 'Passées' },
            { value: 'planned', label: 'Prévues' },
          ]}
        />
        {!isDefault ? (
          <Button variant="ghost" icon={<X />} onClick={() => onChange(DEFAULT_FILTERS)}>
            Réinitialiser
          </Button>
        ) : null}
      </div>
    </div>
  );
```

Le raccourci « / » de `QuickAdd` cherche `input[type="search"]` : `SearchPill` en rend un, rien à changer.
Dans `TransactionFilters.module.css`, ne garder que `.filters` et `.line`, et ajouter pour le mobile :

```css
@media (max-width: 767px) {
  .line > :global(*) {
    flex: 1 1 auto;
  }
}
```

- [ ] **Step 2: `Analyse.tsx`**

Remplacer `DateInput` par `DateRangeField` dans l'import `@/components/ui` et le bloc `customRange` par :

```tsx
        {preset === 'custom' ? (
          <DateRangeField
            variant="pill"
            aria-label="Période personnalisée"
            from={custom.from}
            to={custom.to}
            onChange={({ from, to }) => setCustom((c) => ({ ...c, from: from ?? c.from, to: to ?? from ?? c.to }))}
          />
        ) : (
```

Supprimer `.customRange` et `.customRange input` de `Analyse.module.css`.
Vérifier qu'aucun autre `DateInput` ne reste dans `Analyse.tsx` (`grep -n DateInput client/src/pages/Analyse.tsx`) ; s'il y en a (autre vue avec « Du »/« Au »), appliquer le même remplacement.

- [ ] **Step 3: `Upcoming.tsx`**

Remplacer `Select` par `FilterPill` dans l'import et le select de série par :

```tsx
                <FilterPill value={series ?? ''} onChange={(v) => setSeries(v as Series)} aria-label="Compte ou enveloppe à tracer">
```

(fermer avec `</FilterPill>`, les `optgroup` restent identiques).
Supprimer `.select` de `Upcoming.module.css` et la classe `className={styles.select}`.

- [ ] **Step 4: `UnsortedList.tsx`**

Remplacer `Select` par `InlinePill` dans l'import `@/components/ui` (garder les autres), et le `<Select ...>...</Select>` par :

```tsx
                    <InlinePill
                      aria-label={`Enveloppe pour ${t.label}`}
                      value={suggestedId}
                      placeholder="+ Enveloppe"
                      tone={suggestedId !== null ? 'suggested' : undefined}
                      options={(envelopes.data ?? []).map((env) => ({ value: env.id, label: env.name, color: env.color }))}
                      onChange={(v) => v !== null && assign(t, v)}
                      disabled={update.isPending && update.variables?.id === t.id}
                    />
```

Supprimer `.suggested` de `UnsortedList.module.css`.

- [ ] **Step 5: `ImportPreview.tsx`**

Remplacer `Select` par `InlinePill` dans l'import et le `<Select ...>...</Select>` par :

```tsx
      <InlinePill
        aria-label={`Enveloppe pour ${row.label}`}
        value={row.envelopeId}
        placeholder="À ranger"
        options={envelopes.map((env) => ({ value: env.id, label: env.name, color: env.color }))}
        onChange={(v) => update(row.index, { envelopeId: v })}
      />
```

Supprimer `.select` de `ImportPreview.module.css`.

- [ ] **Step 6: Supprimer `DateInput`**

Run: `grep -rn "DateInput" client/src`
Expected: seulement `client/src/components/ui/Input.tsx` et `client/src/components/ui/index.ts`.

Supprimer la déclaration `export const DateInput = ...` de `Input.tsx` et remplacer dans `index.ts` la ligne d'export par `export { Input, Select, Textarea } from './Input';`.

- [ ] **Step 7: Tests, typecheck, lint, commit**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS ; `ImportPreview.test.tsx` passe sans modification (`selectOptions` sur le select natif recouvrant la pastille).

```bash
git add client/src
git commit -m "feat(client): filtres et listes en pastilles, périodes au calendrier français"
```

---

### Task 13: Finitions et vérification de bout en bout

**Files:**
- Modify: `client/vite.config.ts` (port d'API configurable pour un second serveur de dev)
- Modify au besoin: `client/src/components/transactions/RuleBanner.module.css`, `client/src/components/import/BankSyncPanel.module.css`, `client/src/pages/settings/Settings.module.css`, `client/src/pages/Import.module.css`, et tout style révélé par la recette

- [ ] **Step 1: Port d'API configurable**

Dans `client/vite.config.ts`, remplacer `proxy: { '/api': 'http://localhost:3000' },` par :

```ts
    proxy: { '/api': `http://localhost:${process.env.API_PORT ?? 3000}` },
```

- [ ] **Step 2: Copie de la base réelle, sans y toucher**

Run :

```bash
mkdir -p tmp && node -e "require('better-sqlite3')('/home/basile/projects/runway/data/runway.db', { readonly: true }).backup('tmp/runway-e2e.db').then(() => console.log('copie ok'))"
```

Expected: `copie ok`, fichier `tmp/runway-e2e.db` présent.

- [ ] **Step 3: Lancer le serveur et le client de la branche**

Run (en arrière-plan) : `RUNWAY_DB=tmp/runway-e2e.db PORT=3100 npx tsx server/src/index.ts`
Run (en arrière-plan) : `API_PORT=3100 npx vite --config client/vite.config.ts --port 5180 --strictPort`
Expected: l'application répond sur `http://localhost:5180`.

- [ ] **Step 4: Recette dans le navigateur (Chrome DevTools MCP)**

Pour chaque écran, à 1440×900 puis 390×844, en clair puis en sombre (`emulate` avec `prefers-color-scheme`), prendre une capture et corriger tout défaut visuel avant de passer au suivant :

1. Saisie rapide (touche `n`) : montant, libellé, pastilles d'enveloppe, « Autre date » ouvre le calendrier français sous la pastille, note, pied avec « Enregistrer et en saisir une autre » à gauche ; sur mobile, bouton principal pleine largeur.
2. Opérations : barre de recherche en pastille, filtres compte et enveloppe (actif = encre + croix), « Dates » ouvre la plage en pastille, modification d'une opération prévue (MAIF) : « Supprimer » rouge à gauche, « Confirmer sans modifier », « Enregistrer » ; confirmation de suppression (annuler, ne rien supprimer).
3. « À ranger » : pastilles en pointillés, suggestion de Claude en jaune, choix d'une enveloppe (sur la copie de la base).
4. Budget : nouvelle enveloppe, modifier une enveloppe (pastilles de couleur, case épargne), ajouter de l'argent et déplacer (« De »/« Vers » en pastilles), « Répartir » (récapitulatif fixe dans le pied pendant le défilement, filet au-dessus du pied seulement s'il reste du contenu caché), archiver (annuler).
5. Charges fixes : modifier « Loyer » (montant héros, section QUAND, résumé, « Jusqu’au » = « Sans fin », calendrier qui s'ouvre au-dessus du champ s'il manque de place en bas).
6. Analyse : période « Dates » ; « À venir » : pastille de série.
7. Réglages : Général, Comptes (nouveau compte, IBAN en mono, archiver/annuler), Banque (clé PEM mono), Règles de tri (nouvelle règle en pastilles, testeur).
8. Import : sélection du compte (selects soulignés), aperçu avec pastilles d'enveloppe.
9. Clavier seul sur un dialogue : Tab parcourt champs et pastilles (un seul arrêt par groupe), flèches dans les pastilles, Entrée dans le calendrier, Échap ferme d'abord le calendrier puis le dialogue.

Pour chaque défaut trouvé : corriger le CSS ou le composant concerné, relancer `npm test`, reprendre la capture.
Points connus à vérifier en priorité : hauteur et police de `.pattern` dans `RuleBanner.module.css` (passer `height: 30px` à `height: 32px` si le trait touche le texte), selects de `BankSyncPanel` (largeur `auto` dans une ligne), `.short` dans `Settings.module.css`.

- [ ] **Step 5: Vérifications finales**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: tout passe, build sans avertissement nouveau.

- [ ] **Step 6: Arrêter les serveurs, nettoyer, commit**

Arrêter les deux processus lancés au step 3, supprimer `tmp/runway-e2e.db*`.

```bash
git add client
git commit -m "fix(client): finitions de la recette des dialogues et des champs"
```

(Si la recette n'a demandé aucune correction, committer seulement `client/vite.config.ts` avec le message `chore(client): port d'API configurable pour un second serveur de dev`.)
