import { Settings, Sparkles } from 'lucide-react';
import { NavLink, Outlet } from 'react-router';
import { useAsk } from '@/components/ask/ask-context';
import { AskProvider } from '@/components/ask/AskProvider';
import { useAutoBankSync } from '@/components/import/useAutoBankSync';
import { BottomNav } from './BottomNav';
import { QuickAddProvider } from './QuickAdd';
import { SideNav } from './SideNav';
import styles from './Shell.module.css';

export function Shell() {
  useAutoBankSync();
  return (
    <AskProvider>
      <QuickAddProvider>
        <Layout />
      </QuickAddProvider>
    </AskProvider>
  );
}

function Layout() {
  const ask = useAsk();
  return (
    <div className={styles.shell} data-ask-open={ask.open || undefined}>
      <SideNav />
      <header className={styles.topBar}>
        <NavLink to="/" className={styles.brand} aria-label="Runway, accueil">
          <span className={styles.brandMark} aria-hidden />
          Runway
        </NavLink>
        <div className={styles.topActions}>
          <button type="button" className={[styles.settings, ask.open ? styles.settingsActive : ''].join(' ')} aria-label="Demander" aria-expanded={ask.open} onClick={ask.toggle}>
            <Sparkles aria-hidden strokeWidth={1.75} />
          </button>
          <NavLink to="/reglages" className={({ isActive }) => [styles.settings, isActive ? styles.settingsActive : ''].join(' ')} aria-label="Réglages">
            <Settings aria-hidden strokeWidth={1.75} />
          </NavLink>
        </div>
      </header>
      <main className={styles.main} id="main">
        <div className={styles.content}>
          <Outlet />
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
