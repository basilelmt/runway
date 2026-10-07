import styles from './LiftoffArrow.module.css';

/**
 * L'icône « tendance à la hausse » de Lucide, redessinée en deux morceaux : la ligne brisée reste fixe,
 * le dernier segment qui monte (avec sa pointe) s'allonge au survol de l'entrée et sort de son cadre.
 */
export function LiftoffArrow({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={[styles.arrow, className ?? ''].join(' ')}
      aria-hidden
    >
      <path d="M13.5 15.5l-5-5L2 17" />
      <g className={styles.tip}>
        <path d="M13.5 15.5L22 7" vectorEffect="non-scaling-stroke" />
        <path d="M16 7h6v6" vectorEffect="non-scaling-stroke" />
      </g>
    </svg>
  );
}
