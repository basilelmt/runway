import type { AskRef } from '@shared/schemas';
import { NAV, SETTINGS_NAV } from '@/components/layout/nav';

export type AskRefKind = AskRef['kind'];

/** Attribut des zones qui restent cliquables pendant la visée : le panneau, la navigation. */
export const ASK_UI = 'data-ask-ui';
export const askUi = { [ASK_UI]: '' };

export const MAX_REFS = 8;

export type AskTargetAttrs = {
  'data-ask-kind': AskRefKind;
  'data-ask-id'?: string;
  'data-ask-label': string;
};

/** Attributs qui rendent un élément visable : à poser sur l'élément même d'une ligne ou d'une carte. */
export function askTarget(kind: AskRefKind, id: number | null, label: string): AskTargetAttrs {
  return {
    'data-ask-kind': kind,
    'data-ask-id': id === null ? undefined : String(id),
    'data-ask-label': label,
  };
}

const MAX_SNAPSHOT = 1500;

/** Bloc visable le plus profond qui contient `node`, hors des zones de Demander. */
export function findTarget(node: EventTarget | null): HTMLElement | null {
  if (!(node instanceof Element)) return null;
  if (node.closest(`[${ASK_UI}]`)) return null;
  return node.closest<HTMLElement>('[data-ask-kind]');
}

/** Texte visible du bloc, lignes nettoyées, tronqué pour rester une pièce de contexte. */
export function snapshotOf(el: HTMLElement): string {
  // `innerText` suit le rendu (retours à la ligne entre les blocs) ; jsdom ne l'implémente pas.
  const raw = el.innerText ?? el.textContent ?? '';
  const text = raw
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
  return text.length > MAX_SNAPSHOT ? `${text.slice(0, MAX_SNAPSHOT - 1)}…` : text;
}

/** Référence envoyée à Claude pour un bloc balisé par `<AskTarget>`. */
export function readTarget(el: HTMLElement): AskRef {
  const id = Number(el.dataset.askId);
  return {
    kind: el.dataset.askKind as AskRefKind,
    id: Number.isInteger(id) && id > 0 ? id : null,
    label: el.dataset.askLabel ?? '',
    snapshot: snapshotOf(el),
  };
}

export const sameRef = (a: AskRef, b: AskRef) => a.kind === b.kind && a.id === b.id && a.label === b.label;

/** Bloc encore affiché pour une pastille, pour l'entourer au survol. */
export function elementOf(ref: AskRef): HTMLElement | null {
  const id = ref.id === null ? '' : `[data-ask-id="${ref.id}"]`;
  return document.querySelector<HTMLElement>(`[data-ask-kind="${ref.kind}"]${id}[data-ask-label="${CSS.escape(ref.label)}"]`);
}

/** Libellé de l'écran principal qui affiche `pathname`, null ailleurs. */
export function pageLabel(pathname: string): string | null {
  const item = [...NAV, SETTINGS_NAV].find((n) => (n.to === '/' ? pathname === '/' : pathname === n.to || pathname.startsWith(`${n.to}/`)));
  return item?.label ?? null;
}
