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
