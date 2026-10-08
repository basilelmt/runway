import styles from './CountBadge.module.css';

/** Compteur jaune : rebondit à chaque changement de valeur. */
export function CountBadge({ count, label }: { count: number; label?: string }) {
  if (count <= 0) return null;
  return (
    <span key={count} className={styles.count} aria-label={label}>
      {count}
    </span>
  );
}
