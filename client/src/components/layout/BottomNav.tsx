import { Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router';
import { useOverview } from '@/api/hooks';
import { MOBILE_PRIMARY, NAV } from './nav';
import styles from './BottomNav.module.css';

export function BottomNav() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const overview = useOverview();
  const unsorted = overview.data?.unsortedCount ?? 0;

  useEffect(() => setOpen(false), [location.pathname]);

  const primary = NAV.filter((n) => MOBILE_PRIMARY.includes(n.to));
  const secondary = NAV.filter((n) => !MOBILE_PRIMARY.includes(n.to));
  const moreActive = secondary.some((n) => location.pathname.startsWith(n.to));

  return (
    <>
      {open ? (
        <div className={styles.sheetBackdrop} onClick={() => setOpen(false)}>
          <div className={styles.sheet} role="dialog" aria-label="Plus de pages" onClick={(e) => e.stopPropagation()}>
            {secondary.map((item) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => [styles.sheetLink, isActive ? styles.active : ''].join(' ')}>
                <item.icon aria-hidden />
                <span>{item.label}</span>
                {item.badge === 'unsorted' && unsorted > 0 ? <span className={styles.count}>{unsorted}</span> : null}
              </NavLink>
            ))}
          </div>
        </div>
      ) : null}
      <nav className={styles.nav} aria-label="Navigation mobile">
        {primary.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => [styles.link, isActive ? styles.active : ''].join(' ')}>
            <item.icon aria-hidden />
            <span>{item.label.split(' ')[0]}</span>
          </NavLink>
        ))}
        <button type="button" className={[styles.link, moreActive || open ? styles.active : ''].join(' ')} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? <X aria-hidden /> : <Menu aria-hidden />}
          <span>Plus</span>
          {unsorted > 0 && !open ? <span className={styles.dot} aria-label={`${unsorted} à trier`} /> : null}
        </button>
      </nav>
    </>
  );
}
