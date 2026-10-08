import styles from './BrandMark.module.css';

/** Le logo : une piste sombre et ses deux bandes jaunes. */
export function BrandMark({ size = 24 }: { size?: number }) {
  return <span className={styles.mark} style={{ width: size, height: size }} aria-hidden />;
}
