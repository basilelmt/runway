import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from './Button';
import styles from './Dialog.module.css';

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
};

/** Boîte de dialogue modale native (`<dialog>`), fermée par Échap ou clic sur le fond. */
export function Dialog({ open, onClose, title, description, children, footer, size = 'md' }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      // Le focus va d'abord au champ marqué autofocus, sinon au premier champ, jamais au bouton Fermer.
      const target = el.querySelector<HTMLElement>('[autofocus], input, select, textarea');
      target?.focus();
    }
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={[styles.dialog, styles[size]].join(' ')}
      aria-labelledby="dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open ? (
        <div className={styles.panel}>
          <header className={styles.header}>
            <div>
              <h2 id="dialog-title" className={styles.title}>
                {title}
              </h2>
              {description ? <p className={styles.description}>{description}</p> : null}
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Fermer" icon={<X />} />
          </header>
          <div className={styles.body}>{children}</div>
          {footer ? <footer className={styles.footer}>{footer}</footer> : null}
        </div>
      ) : null}
    </dialog>
  );
}
