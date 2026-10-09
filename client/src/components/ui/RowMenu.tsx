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
