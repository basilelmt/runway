import { Ascii } from 'ascii.rest/react';
import * as earthrise from 'ascii.rest/pieces/earthrise';
import type { ReactNode } from 'react';
import styles from './ToTheMoon.module.css';

/** Bandeau « To the moon » : la Terre qui se lève sur l'horizon lunaire, en ascii art animé (ascii.rest). */
export function ToTheMoon({ children }: { children?: ReactNode }) {
  return (
    <section className={styles.banner} aria-label="To the moon">
      <Ascii piece={earthrise} className={styles.art} label="La Terre qui se lève sur l’horizon de la Lune, en ascii art" />
      <div className={styles.overlay}>
        <p className={styles.eyebrow}>To the moon</p>
        {children}
      </div>
    </section>
  );
}
