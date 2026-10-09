import type { ReactNode } from 'react';
import styles from './FieldError.module.css';

/** Erreur d'un formulaire ou d'un dialogue, lue dès qu'elle apparaît. */
/** `id` : pour l'`aria-describedby` du champ concerné. */
export function FieldError({ id, children }: { id?: string; children?: ReactNode }) {
  if (children === null || children === undefined || children === false || children === '') return null;
  return (
    <p id={id} className={styles.error} role="alert">
      {children}
    </p>
  );
}
