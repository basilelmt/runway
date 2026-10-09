import type { ReactNode } from 'react';
import styles from './EmptyState.module.css';

type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: 'neutral' | 'negative';
};

/** Un écran vide est une invitation à agir : titre, une phrase, une action. */
export function EmptyState({ icon, title, description, action, tone = 'neutral' }: EmptyStateProps) {
  return (
    <div className={[styles.empty, tone === 'negative' ? styles.negative : ''].join(' ')}>
      {icon ? <div className={styles.icon}>{icon}</div> : null}
      <h3 className={styles.title}>{title}</h3>
      {description ? <p className={styles.description}>{description}</p> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
