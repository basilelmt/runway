import { Outlet } from 'react-router';
import { useAutoBankSync } from '@/components/import/useAutoBankSync';
import { BottomNav } from './BottomNav';
import { QuickAdd } from './QuickAdd';
import { SideNav } from './SideNav';
import styles from './Shell.module.css';

export function Shell() {
  useAutoBankSync();
  return (
    <div className={styles.shell}>
      <SideNav />
      <main className={styles.main} id="main">
        <div className={styles.content}>
          <Outlet />
        </div>
      </main>
      <BottomNav />
      <QuickAdd />
    </div>
  );
}
