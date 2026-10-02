import { Outlet } from 'react-router';
import { BottomNav } from './BottomNav';
import { QuickAdd } from './QuickAdd';
import { SideNav } from './SideNav';
import styles from './Shell.module.css';

export function Shell() {
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
