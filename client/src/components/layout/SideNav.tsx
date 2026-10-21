import { Plus, Sparkles } from 'lucide-react';
import { useRef } from 'react';
import { NavLink, useLocation } from 'react-router';
import { useOverview } from '@/api/hooks';
import { useAsk } from '@/components/ask/ask-context';
import { BrandMark, Button, CountBadge, Kbd } from '@/components/ui';
import { budgetNeedsAttention } from '@/lib/budget';
import { useActiveIndicator } from '@/lib/motion';
import { LiftoffArrow } from './LiftoffArrow';
import { NAV, SETTINGS_NAV, type NavItem } from './nav';
import { panelTrigger, useQuickAdd } from './quick-add-context';
import styles from './SideNav.module.css';

export function SideNav() {
  const overview = useOverview();
  const openQuickAdd = useQuickAdd();
  const ask = useAsk();
  const unsorted = overview.data?.unsortedCount ?? 0;
  const budgetDot = overview.data ? budgetNeedsAttention(overview.data) : false;
  const navRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  const indicator = useActiveIndicator(navRef, 'a[aria-current="page"]:not([data-brand])', pathname);

  const link = (item: NavItem) => (
    <NavLink to={item.to} end={item.to === '/'} className={({ isActive }) => [styles.link, isActive ? styles.active : ''].join(' ')}>
      {item.liftoff ? <LiftoffArrow className={styles.icon} /> : <item.icon className={styles.icon} aria-hidden strokeWidth={1.75} />}
      <span className={styles.label}>{item.label}</span>
      {item.badge === 'unsorted' ? <CountBadge count={unsorted} label={`${unsorted} à ranger`} /> : null}
      {item.badge === 'toAllocate' && budgetDot ? (
        <span className={styles.dot}>
          <span className="visually-hidden">Argent à répartir</span>
        </span>
      ) : null}
    </NavLink>
  );

  return (
    <nav ref={navRef} className={styles.nav} aria-label="Navigation principale">
      {indicator ? <span className={styles.indicator} style={{ transform: `translateY(${indicator.top}px)`, height: indicator.height }} aria-hidden /> : null}
      <NavLink to="/" end className={styles.brand} aria-label="Runway, accueil" data-brand>
        <BrandMark />
        <span className={styles.brandName}>Runway</span>
      </NavLink>

      {/* Demander prend la forme d'un champ : on y pose une question, ce n'est pas une action de plus à côté de la saisie. */}
      <button
        type="button"
        className={[styles.askField, ask.open ? styles.askFieldOpen : ''].join(' ')}
        aria-expanded={ask.open}
        aria-keyshortcuts="k"
        onClick={ask.toggle}
        {...panelTrigger}
      >
        <Sparkles className={styles.askIcon} aria-hidden strokeWidth={2} />
        <span className={styles.askPlaceholder}>Demander…</span>
        <Kbd>K</Kbd>
      </button>

      <Button variant="secondary" icon={<Plus aria-hidden strokeWidth={2} />} className={styles.navAction} aria-keyshortcuts="n" onClick={openQuickAdd} {...panelTrigger}>
        Nouvelle opération
        <Kbd>N</Kbd>
      </Button>

      <ul className={styles.list}>
        {NAV.map((item) => (
          <li key={item.to}>{link(item)}</li>
        ))}
      </ul>

      <div className={styles.footer}>{link(SETTINGS_NAV)}</div>
    </nav>
  );
}
