import { createBrowserRouter, Navigate, useLocation } from 'react-router';
import { Shell } from '@/components/layout/Shell';
import { BudgetPage } from '@/pages/Budget';
import { HomePage } from '@/pages/Home';
import { NotFoundPage } from '@/pages/NotFound';
import { OperationsPage } from '@/pages/Operations';

/** Ancienne adresse : redirige en conservant les filtres éventuels de l'URL d'origine. */
function Moved({ to }: { to: string }) {
  const { search } = useLocation();
  const [path, query = ''] = to.split('?');
  const params = new URLSearchParams(search);
  for (const [k, v] of new URLSearchParams(query)) params.set(k, v);
  const qs = params.toString();
  return <Navigate to={`${path}${qs ? `?${qs}` : ''}`} replace />;
}

export const router = createBrowserRouter([
  {
    path: '/',
    Component: Shell,
    children: [
      { index: true, Component: HomePage },
      { path: 'budget', Component: BudgetPage },
      { path: 'operations', Component: OperationsPage },
      // Écrans chargés à la demande : l'analyse embarque les graphiques, l'import et les réglages servent rarement.
      { path: 'operations/importer', lazy: () => import('@/pages/Import').then((m) => ({ Component: m.ImportPage })) },
      { path: 'analyse', lazy: () => import('@/pages/Analyse').then((m) => ({ Component: m.AnalysePage })) },
      {
        path: 'reglages',
        lazy: () => import('@/pages/settings/SettingsLayout').then((m) => ({ Component: m.SettingsLayout })),
        children: [
          { index: true, lazy: () => import('@/pages/settings/General').then((m) => ({ Component: m.GeneralSettings })) },
          { path: 'comptes', lazy: () => import('@/pages/settings/Accounts').then((m) => ({ Component: m.AccountsSettings })) },
          { path: 'banque', lazy: () => import('@/pages/settings/Bank').then((m) => ({ Component: m.BankSettings })) },
          { path: 'regles', lazy: () => import('@/pages/settings/SortingRules').then((m) => ({ Component: m.SortingRulesSettings })) },
        ],
      },
      { path: 'a-trier', element: <Moved to="/operations?vue=a-ranger" /> },
      { path: 'enveloppes', element: <Moved to="/budget" /> },
      { path: 'recurrences', element: <Moved to="/budget" /> },
      { path: 'prevision', element: <Moved to="/analyse?vue=a-venir" /> },
      { path: 'rapports', element: <Moved to="/analyse" /> },
      { path: 'import', element: <Moved to="/operations/importer" /> },
      { path: 'regles', element: <Moved to="/reglages/regles" /> },
      { path: 'comptes', element: <Moved to="/reglages/comptes" /> },
      { path: 'parametres', element: <Moved to="/reglages" /> },
      { path: '*', Component: NotFoundPage },
    ],
  },
]);
