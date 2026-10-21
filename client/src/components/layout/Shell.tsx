import { Settings, Sparkles } from 'lucide-react';
import { NavLink, Outlet, useMatch, useMatches } from 'react-router';
import { useMerchantNamingSync } from '@/api/hooks';
import { useAsk } from '@/components/ask/ask-context';
import { AskProvider } from '@/components/ask/AskProvider';
import { useAutoBankSync } from '@/components/import/useAutoBankSync';
import { BrandMark, Button, ButtonLink } from '@/components/ui';
import { askUi } from '@/components/ask/ask-target';
import { BottomNav } from './BottomNav';
import { QuickAddProvider } from './QuickAdd';
import { panelTrigger } from './quick-add-context';
import { SideNav } from './SideNav';
import styles from './Shell.module.css';

export function Shell() {
  useAutoBankSync();
  // Le suivi du nommage des marchands par Claude vit ici pour continuer même hors des Réglages.
  useMerchantNamingSync();
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
  const settingsActive = Boolean(useMatch('/reglages/*'));
  // Clé sur l'écran affiché (pas sur l'URL) : le fondu rejoue quand on change d'écran, pas quand
  // seuls les filtres ou un onglet des Réglages changent.
  const screen = useMatches()[1]?.id;
  return (
    <div className={styles.shell} data-ask-open={ask.open || undefined}>
      <SideNav />
      <header className={styles.topBar} {...askUi}>
        <NavLink to="/" className={styles.brand} aria-label="Runway, accueil">
          <BrandMark size={20} />
          Runway
        </NavLink>
        <div className={styles.topActions}>
          <Button
            variant="ghost"
            icon={<Sparkles aria-hidden strokeWidth={1.75} />}
            className={ask.open ? styles.topActionOpen : undefined}
            aria-label="Demander"
            aria-expanded={ask.open}
            onClick={ask.toggle}
            {...panelTrigger}
          />
          <ButtonLink
            to="/reglages"
            variant="ghost"
            icon={<Settings aria-hidden strokeWidth={1.75} />}
            aria-label="Réglages"
            aria-current={settingsActive ? 'page' : undefined}
            className={settingsActive ? styles.topActionOpen : undefined}
          />
        </div>
      </header>
      <main className={styles.main} id="main">
        <div key={screen} className={styles.content}>
          <Outlet />
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
