import styles from './PulseDot.module.css';

/** Travail en cours (Claude cherche, réfléchit). */
export function PulseDot({ label }: { label?: string }) {
  return label ? <span role="status" aria-label={label} className={styles.dot} /> : <span className={styles.dot} aria-hidden />;
}
