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
