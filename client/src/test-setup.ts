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
