import { NavLink } from 'react-router';
import { useOverview } from '@/api/hooks';
import { NAV } from './nav';
import styles from './SideNav.module.css';

export function SideNav() {
  const overview = useOverview();
  const unsorted = overview.data?.unsortedCount ?? 0;
  return (
    <nav className={styles.nav} aria-label="Navigation principale">
      <NavLink to="/" className={styles.brand}>
        <span className={styles.brandMark} aria-hidden />
        <span className={styles.brandName}>Runway</span>
      </NavLink>
      <ul className={styles.list}>
        {NAV.map((item) => (
          <li key={item.to}>
            <NavLink to={item.to} end={item.to === '/'} className={({ isActive }) => [styles.link, isActive ? styles.active : ''].join(' ')}>
              <item.icon className={styles.icon} aria-hidden />
              <span className={styles.label}>{item.label}</span>
              {item.badge === 'unsorted' && unsorted > 0 ? <span className={styles.count}>{unsorted}</span> : null}
            </NavLink>
          </li>
        ))}
      </ul>
      <p className={styles.hint}>
        <kbd>n</kbd> nouvelle opération
      </p>
    </nav>
  );
}
