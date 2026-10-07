import { useId } from 'react';
import styles from './LiftoffArrow.module.css';

/**
 * L'icône « tendance à la hausse » de Lucide, redessinée pour s'envoler au survol de l'entrée. La ligne est une forme
 * pleine (et non un trait) pour pouvoir s'épaissir en continu du pied à la pointe sans à-coups aux virages ; au repos
 * elle reproduit le trait de 1,75 de Lucide. Un dégradé la fait passer de l'encre au vert vers la pointe.
 * Les tracés de survol sont dans le CSS (propriété `d`), avec les mêmes commandes qu'au repos pour pouvoir interpoler.
 */
export function LiftoffArrow({ className }: { className?: string }) {
  // Les identifiants de React contiennent des caractères (« : », « « ») mal tolérés dans `url(#…)`.
  const gradient = `liftoff-${useId().replace(/[^\w-]/g, '')}`;
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
      <defs>
        <linearGradient id={gradient} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" className={styles.from} />
          <stop offset="0.3" className={styles.middle} />
          <stop offset="0.75" className={styles.to} data-tip />
        </linearGradient>
      </defs>
      <path
        className={styles.line}
        fill={`url(#${gradient})`}
        stroke="none"
        d="M2.619 17.619L8.5 11.737L12.881 16.119A0.875 0.875 0 0 0 14.119 16.119L22.619 7.619A0.875 0.875 0 0 0 21.381 6.381L13.5 14.263L9.119 9.881A0.875 0.875 0 0 0 7.881 9.881L1.381 16.381A0.875 0.875 0 0 0 2.619 17.619Z"
      />
      <path className={styles.head} d="M16 7L22 7L22 13" data-tip />
    </svg>
  );
}
