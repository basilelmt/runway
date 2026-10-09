import styles from './CountBadge.module.css';

/** Compteur jaune : rebondit à chaque changement de valeur. `label` remplace le chiffre pour les lecteurs d'écran. */
export function CountBadge({ count, label }: { count: number; label?: string }) {
  if (count <= 0) return null;
  return (
    <span key={count} className={styles.count}>
      {label ? (
        <>
          <span aria-hidden>{count}</span>
          <span className="visually-hidden">{label}</span>
        </>
      ) : (
        count
      )}
    </span>
  );
}
