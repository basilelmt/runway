import styles from './ProgressBar.module.css';

type ProgressBarProps = {
  /** 0 à 1 ; au-delà de 1 la barre est pleine et marquée dépassée. */
  ratio: number;
  color?: string;
  label: string;
  tone?: 'auto' | 'negative';
};

export function ProgressBar({ ratio, color, label, tone = 'auto' }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(1, ratio));
  const over = ratio > 1 || tone === 'negative';
  return (
    <div className={styles.track} role="progressbar" aria-label={label} aria-valuenow={Math.round(clamped * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className={[styles.fill, over ? styles.over : ''].join(' ')} style={{ width: `${clamped * 100}%`, background: over ? undefined : color }} />
    </div>
  );
}
