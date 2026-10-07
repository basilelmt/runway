import { Outlet } from 'react-router';
import { PageHeader } from '@/components/layout/PageHeader';
import { Tabs } from '@/components/ui';
import styles from './SettingsLayout.module.css';

const SECTIONS = [
  { value: 'general', label: 'Général', to: '/reglages' },
  { value: 'comptes', label: 'Comptes', to: '/reglages/comptes' },
  { value: 'banque', label: 'Banque et import', to: '/reglages/banque' },
  { value: 'regles', label: 'Règles de tri', to: '/reglages/regles' },
];

export function SettingsLayout() {
  return (
    <div className="page">
      <PageHeader title="Réglages" />
      <div className={styles.body}>
        <Tabs label="Sections des réglages" items={SECTIONS} />
        <Outlet />
      </div>
    </div>
  );
}
