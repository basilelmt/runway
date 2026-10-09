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
