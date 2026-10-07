import { X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { prefersReducedMotion } from '@/lib/motion';
import { Button } from './Button';
import styles from './Dialog.module.css';

/** Durée de l'animation de fermeture, alignée sur `.closing` dans le CSS. */
const CLOSE_MS = 160;

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
};

/** Boîte de dialogue modale native (`<dialog>`), fermée par Échap ou clic sur le fond, avec une sortie animée. */
export function Dialog({ open, onClose, title, description, children, footer, size = 'md' }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
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

  const shown = open ? { title, description, children, footer } : content;

  return (
    <dialog
      ref={ref}
      className={[styles.dialog, styles[size], closing ? styles.closing : ''].join(' ')}
      aria-labelledby="dialog-title"
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
          <header className={styles.header}>
            <div>
              <h2 id="dialog-title" className={styles.title}>
                {shown.title}
              </h2>
              {shown.description ? <p className={styles.description}>{shown.description}</p> : null}
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Fermer" icon={<X />} />
          </header>
          <div className={styles.body}>{shown.children}</div>
          {shown.footer ? <footer className={styles.footer}>{shown.footer}</footer> : null}
        </div>
      ) : null}
    </dialog>
  );
}
