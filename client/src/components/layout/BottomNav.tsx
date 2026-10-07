import { NavLink } from 'react-router';
import { useOverview } from '@/api/hooks';
import { budgetNeedsAttention } from '@/lib/budget';
import { NAV } from './nav';
import styles from './BottomNav.module.css';

export function BottomNav() {
  const overview = useOverview();
  const unsorted = overview.data?.unsortedCount ?? 0;
  const budgetDot = overview.data ? budgetNeedsAttention(overview.data) : false;

  return (
    <nav className={styles.nav} aria-label="Navigation mobile">
      {NAV.map((item) => {
        const dot = (item.badge === 'unsorted' && unsorted > 0) || (item.badge === 'toAllocate' && budgetDot);
        return (
          <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => [styles.link, isActive ? styles.active : ''].join(' ')}>
            <item.icon aria-hidden strokeWidth={1.75} />
            <span>{item.label}</span>
            {dot ? <span className={styles.dot} aria-label={item.badge === 'unsorted' ? `${unsorted} à ranger` : 'Argent à répartir'} /> : null}
          </NavLink>
        );
      })}
    </nav>
  );
}
