import styles from './ProgressBar.module.css';

type ProgressBarProps = {
  /** 0 à 1 ; au-delà de 1 la barre est pleine et marquée dépassée. */
  ratio: number;
  color?: string;
  label: string;
  tone?: 'auto' | 'negative';
  size?: 'sm' | 'md';
  /** Repère vertical (0 à 1), par exemple la part du mois écoulée. */
  marker?: number;
  markerLabel?: string;
};

export function ProgressBar({ ratio, color, label, tone = 'auto', size = 'sm', marker, markerLabel }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(1, ratio));
  const over = ratio > 1 || tone === 'negative';
  return (
    <div className={[styles.track, styles[size]].join(' ')} role="progressbar" aria-label={label} aria-valuenow={Math.round(clamped * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className={styles.clip}>
        <div className={[styles.fill, over ? styles.over : ''].join(' ')} style={{ width: `${clamped * 100}%`, background: over ? undefined : color }} />
      </div>
      {marker !== undefined ? <span className={styles.marker} style={{ left: `${Math.max(0, Math.min(1, marker)) * 100}%` }} title={markerLabel} aria-hidden /> : null}
    </div>
  );
}
