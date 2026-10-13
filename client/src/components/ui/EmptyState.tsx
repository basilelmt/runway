import type { ReactNode } from 'react';
import styles from './EmptyState.module.css';

type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: 'neutral' | 'negative';
  /** `inline` : une ligne entre deux filets, pour un état vide qui est l'état normal (« Rien à faire »). */
  layout?: 'block' | 'inline';
};

/** Un écran vide est une invitation à agir : titre, une phrase, une action. */
export function EmptyState({ icon, title, description, action, tone = 'neutral', layout = 'block' }: EmptyStateProps) {
  return (
    <div className={[styles.empty, layout === 'inline' ? styles.inline : '', tone === 'negative' ? styles.negative : ''].join(' ')}>
      {icon ? <div className={styles.icon}>{icon}</div> : null}
      {layout === 'inline' ? (
        <p className={styles.line}>
          <strong className={styles.lineTitle}>{title}</strong>
          {description ? <span className={styles.description}>{description}</span> : null}
        </p>
      ) : (
        <>
          <h3 className={styles.title}>{title}</h3>
          {description ? <p className={styles.description}>{description}</p> : null}
        </>
      )}
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
