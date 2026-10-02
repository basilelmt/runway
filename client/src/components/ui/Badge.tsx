import type { ReactNode } from 'react';
import styles from './Badge.module.css';

type BadgeProps = {
  tone?: 'neutral' | 'positive' | 'negative' | 'warning' | 'marking' | 'info';
  children: ReactNode;
  className?: string;
};

export function Badge({ tone = 'neutral', children, className }: BadgeProps) {
  return <span className={[styles.badge, styles[tone], className ?? ''].join(' ')}>{children}</span>;
}

/** Pastille colorée d'une enveloppe. */
export function Dot({ color, size = 10 }: { color: string; size?: number }) {
  return <span className={styles.dot} style={{ background: color, width: size, height: size }} aria-hidden />;
}
