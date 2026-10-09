import styles from './Spinner.module.css';

/** Indicateur de chargement, dans la couleur du texte. */
export function Spinner({ size = 14 }: { size?: number }) {
  return <span data-spinner className={styles.spinner} style={{ width: size, height: size }} aria-hidden />;
}
