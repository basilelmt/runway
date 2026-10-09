import type { ReactNode } from 'react';
import styles from './KeyFigure.module.css';

type KeyFigureProps = {
  label: string;
  figure: ReactNode;
  /** À côté du chiffre, plus petit : « sur 2 401,00 € prévus ». */
  context?: ReactNode;
  /** Phrase sous le chiffre et ses barres. */
  caption?: ReactNode;
  /** Barres et détails entre le chiffre et la légende. */
  children?: ReactNode;
  /** À droite : stats en colonne ou action. */
  aside?: ReactNode;
  /** `night` : le fond sombre d'Investir. */
  variant?: 'plain' | 'night';
  /** `compact` : chiffre en taille lg (réponses de Demander). */
  size?: 'md' | 'compact';
  /** Couche décorative derrière le contenu, en variante `night`. */
  decoration?: ReactNode;
  /** Mise en page propre à l'écran (hauteur laissée à la décoration). */
  className?: string;
};

/** Le chiffre clé d'un écran : un seul par écran, sans cadre sauf la nuit d'Investir. */
export function KeyFigure({ label, figure, context, caption, children, aside, variant = 'plain', size = 'md', decoration, className }: KeyFigureProps) {
  return (
    <section aria-label={label} className={[styles.figure, styles[variant], styles[size], className ?? ''].join(' ')}>
      {decoration ? (
        <div className={styles.decoration} aria-hidden="true">
          {decoration}
        </div>
      ) : null}
      <div className={styles.main}>
        <p className={styles.label} aria-hidden="true">
          {label}
        </p>
        <div className={styles.line}>
          {figure}
          {context ? <span className={styles.context}>{context}</span> : null}
        </div>
        {children ? <div className={styles.details}>{children}</div> : null}
        {caption ? <p className={styles.caption}>{caption}</p> : null}
      </div>
      {aside ? <div className={styles.aside}>{aside}</div> : null}
    </section>
  );
}

/** Chiffre non monétaire (pourcentage) au format d'un montant xl. */
export const keyFigureValue = styles.value;
