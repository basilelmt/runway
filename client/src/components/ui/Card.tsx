import type { HTMLAttributes, ReactNode } from 'react';
import styles from './Card.module.css';

type CardProps = HTMLAttributes<HTMLDivElement> & {
  padding?: 'none' | 'sm' | 'md';
  tone?: 'raised' | 'flat' | 'negative' | 'marking';
  children: ReactNode;
};

export function Card({ padding = 'md', tone = 'raised', className, children, ...rest }: CardProps) {
  return (
    <div className={[styles.card, styles[`p-${padding}`], styles[tone], className ?? ''].join(' ')} {...rest}>
      {children}
    </div>
  );
}
