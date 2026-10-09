import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import styles from './TodoItem.module.css';

type TodoItemProps = { to: string; icon: ReactNode; tone?: 'marking' | 'negative'; children: ReactNode };

/** Une tâche de « À faire » : barre jaune, ou rouge si c'est une alerte. */
export function TodoItem({ to, icon, tone = 'marking', children }: TodoItemProps) {
  return (
    <Link to={to} className={[styles.todo, styles[tone]].join(' ')}>
      <span className={styles.icon} aria-hidden>
        {icon}
      </span>
      <span className={styles.text}>{children}</span>
      <ChevronRight className={styles.chevron} aria-hidden />
    </Link>
  );
}
