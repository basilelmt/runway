import { Settings } from 'lucide-react';
import { NavLink, Outlet } from 'react-router';
import { useAutoBankSync } from '@/components/import/useAutoBankSync';
import { BottomNav } from './BottomNav';
import { QuickAddProvider } from './QuickAdd';
import { SideNav } from './SideNav';
import styles from './Shell.module.css';

export function Shell() {
  useAutoBankSync();
  return (
    <QuickAddProvider>
      <div className={styles.shell}>
        <SideNav />
        <header className={styles.topBar}>
          <NavLink to="/" className={styles.brand} aria-label="Runway, accueil">
            <span className={styles.brandMark} aria-hidden />
            Runway
          </NavLink>
          <NavLink to="/reglages" className={({ isActive }) => [styles.settings, isActive ? styles.settingsActive : ''].join(' ')} aria-label="Réglages">
            <Settings aria-hidden strokeWidth={1.75} />
          </NavLink>
        </header>
        <main className={styles.main} id="main">
          <div className={styles.content}>
            <Outlet />
          </div>
        </main>
        <BottomNav />
      </div>
    </QuickAddProvider>
  );
}
