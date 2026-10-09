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
  /** Action discrète sur la ligne du titre, avant le bouton de fermeture (ex. « Renommer »). */
  headerAction?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
};

/** Boîte de dialogue modale native (`<dialog>`), fermée par Échap ou clic sur le fond, avec une sortie animée. */
export function Dialog({ open, onClose, title, description, children, footer, headerAction, size = 'md' }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  // Un clic qui commence dans le panneau (sélection de texte glissée) ne ferme pas le dialogue.
  const pressedOnBackdrop = useRef(false);
  const [footerEl, setFooterEl] = useState<HTMLElement | null>(null);
  const [edges, setEdges] = useState({ top: false, bottom: false });
  // Le contenu reste affiché pendant l'animation de sortie, puis le dialogue se ferme vraiment.
  const [rendered, setRendered] = useState(open);
  const [closing, setClosing] = useState(false);
  const [content, setContent] = useState({ title, description, children, footer, headerAction, size });

  if (open && !rendered) setRendered(true);
  if (open && closing) setClosing(false);
  if (!open && rendered && !closing) setClosing(true);
  // Pendant la sortie, on garde le dernier contenu : le parent l'a souvent déjà vidé.
  if (
    open &&
    (content.title !== title ||
      content.description !== description ||
      content.children !== children ||
      content.footer !== footer ||
      content.headerAction !== headerAction ||
      content.size !== size)
  ) {
    setContent({ title, description, children, footer, headerAction, size });
  }

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      // Le focus va d'abord au champ marqué `data-autofocus`, sinon au premier champ, jamais au bouton Fermer.
      const target = el.querySelector<HTMLElement>('[data-autofocus], input, select, textarea');
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

  const shown = open ? { title, description, children, footer, headerAction, size } : content;

  return (
    <dialog
      ref={ref}
      className={[styles.dialog, styles[shown.size], closing ? styles.closing : ''].join(' ')}
      aria-labelledby={titleId}
      aria-describedby={shown.description ? descriptionId : undefined}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onPointerDown={(e) => {
        pressedOnBackdrop.current = e.target === ref.current;
      }}
      onClick={(e) => {
        if (e.target === ref.current && pressedOnBackdrop.current) onClose();
      }}
    >
      {rendered ? (
        <div className={styles.panel}>
          <header className={[styles.header, edges.top ? styles.edgeBelow : ''].join(' ')}>
            <div className={styles.heading}>
              <div className={styles.titleRow}>
                <h2 id={titleId} className={styles.title}>
                  {shown.title}
                </h2>
                {shown.headerAction}
              </div>
              {shown.description ? <p id={descriptionId} className={styles.description}>
                  {shown.description}
                </p> : null}
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
