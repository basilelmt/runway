import type { ReactNode } from 'react';
import styles from './StatGroup.module.css';

type StatGroupProps = {
  direction?: 'row' | 'column';
  /** En colonne : filet à gauche du groupe, pour le séparer du chiffre clé. */
  divided?: boolean;
  children: ReactNode;
};

export function StatGroup({ direction = 'row', divided = false, children }: StatGroupProps) {
  return <dl className={[styles.group, styles[direction], divided ? styles.divided : ''].join(' ')}>{children}</dl>;
}

/** Valeur non monétaire d'une stat (un nombre d'opérations...) au format d'un `Amount size="lg"`. */
export const statNumber = styles.number;

/** Un libellé et sa valeur, en général un `Amount size="lg"`. */
export function Stat({ label, children, emphasis = false }: { label: ReactNode; children: ReactNode; emphasis?: boolean }) {
  return (
    <div className={[styles.stat, emphasis ? styles.emphasis : ''].join(' ')} data-emphasis={emphasis || undefined}>
      <dt className={styles.label}>{label}</dt>
      <dd className={styles.value}>{children}</dd>
    </div>
  );
}
