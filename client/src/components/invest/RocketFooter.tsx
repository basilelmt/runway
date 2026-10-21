import { Ascii } from 'ascii.rest/react';
import * as rocket from 'ascii.rest/pieces/rocket';
import styles from './RocketFooter.module.css';

/** Pied de page de l'écran Investir : une fusée qui décolle de son pas de tir, puis s'y repose (ascii.rest). */
export function RocketFooter() {
  return (
    <footer className={styles.footer}>
      <Ascii piece={rocket} className={styles.art} label="Une fusée qui décolle de nuit, en ascii art" />
    </footer>
  );
}
