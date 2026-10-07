import { Plus } from 'lucide-react';
import { useRef } from 'react';
import { NavLink, useLocation } from 'react-router';
import { useOverview } from '@/api/hooks';
import { budgetNeedsAttention } from '@/lib/budget';
import { useActiveIndicator } from '@/lib/motion';
import { LiftoffArrow } from './LiftoffArrow';
import { NAV, SETTINGS_NAV, type NavItem } from './nav';
import { useQuickAdd } from './quick-add-context';
import styles from './SideNav.module.css';

export function SideNav() {
  const overview = useOverview();
  const openQuickAdd = useQuickAdd();
  const unsorted = overview.data?.unsortedCount ?? 0;
  const budgetDot = overview.data ? budgetNeedsAttention(overview.data) : false;
  const navRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  const indicator = useActiveIndicator(navRef, 'a[aria-current="page"]:not([data-brand])', pathname);

  const link = (item: NavItem) => (
    <NavLink to={item.to} end={item.to === '/'} className={({ isActive }) => [styles.link, isActive ? styles.active : ''].join(' ')}>
      {item.liftoff ? <LiftoffArrow className={styles.icon} /> : <item.icon className={styles.icon} aria-hidden strokeWidth={1.75} />}
      <span className={styles.label}>{item.label}</span>
      {item.badge === 'unsorted' && unsorted > 0 ? (
        <span key={unsorted} className={['num', styles.count].join(' ')} aria-label={`${unsorted} à ranger`}>
          {unsorted}
        </span>
      ) : null}
      {item.badge === 'toAllocate' && budgetDot ? <span className={styles.dot} aria-label="Argent à répartir" /> : null}
    </NavLink>
  );

  return (
    <nav ref={navRef} className={styles.nav} aria-label="Navigation principale">
      {indicator ? <span className={styles.indicator} style={{ transform: `translateY(${indicator.top}px)`, height: indicator.height }} aria-hidden /> : null}
      <NavLink to="/" end className={styles.brand} aria-label="Runway, accueil" data-brand>
        <span className={styles.brandMark} aria-hidden />
        <span className={styles.brandName}>Runway</span>
      </NavLink>

      <button type="button" className={styles.newButton} onClick={openQuickAdd}>
        <Plus aria-hidden strokeWidth={2} />
        <span>Nouvelle opération</span>
        <kbd>N</kbd>
      </button>

      <ul className={styles.list}>
        {NAV.map((item) => (
          <li key={item.to}>{link(item)}</li>
        ))}
      </ul>

      <div className={styles.footer}>{link(SETTINGS_NAV)}</div>
    </nav>
  );
}
