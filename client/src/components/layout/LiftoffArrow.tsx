import styles from './LiftoffArrow.module.css';

/**
 * L'icône « tendance à la hausse » de Lucide, découpée en segments. Au survol de l'entrée, la ligne se déforme
 * progressivement : le pied bouge à peine, chaque segment s'allonge et s'épaissit un peu plus que le précédent,
 * et la pointe sort largement du cadre en vert. Les tracés de survol sont dans le CSS (propriété `d`).
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
      <path className={styles.s1} d="M2 17L8.5 10.5" />
      <path className={styles.s2} d="M8.5 10.5L13.5 15.5" />
      <path className={styles.s3} d="M13.5 15.5L22 7" data-tip />
      <path className={styles.head} d="M16 7H22V13" data-tip />
    </svg>
  );
}
