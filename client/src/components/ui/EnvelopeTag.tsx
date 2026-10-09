import styles from './EnvelopeTag.module.css';

/** L'enveloppe d'une ligne : pastille grise et point de couleur. */
export function EnvelopeTag({ name, color }: { name: string; color: string }) {
  return (
    <span className={styles.tag}>
      <span className={styles.dot} style={{ background: color }} aria-hidden />
      {name}
    </span>
  );
}
