import { createBrowserRouter } from 'react-router';
import { Shell } from '@/components/layout/Shell';
import { AccountsPage } from '@/pages/Accounts';
import { DashboardPage } from '@/pages/Dashboard';
import { EnvelopesPage } from '@/pages/Envelopes';
import { ForecastPage } from '@/pages/Forecast';
import { ImportPage } from '@/pages/Import';
import { NotFoundPage } from '@/pages/NotFound';
import { RecurringPage } from '@/pages/Recurring';
import { ReportsPage } from '@/pages/Reports';
import { SettingsPage } from '@/pages/Settings';
import { SortingRulesPage } from '@/pages/SortingRules';
import { TransactionsPage } from '@/pages/Transactions';
import { UnsortedPage } from '@/pages/Unsorted';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: Shell,
    children: [
      { index: true, Component: DashboardPage },
      { path: 'operations', Component: TransactionsPage },
      { path: 'a-trier', Component: UnsortedPage },
      { path: 'enveloppes', Component: EnvelopesPage },
      { path: 'comptes', Component: AccountsPage },
      { path: 'recurrences', Component: RecurringPage },
      { path: 'prevision', Component: ForecastPage },
      { path: 'rapports', Component: ReportsPage },
      { path: 'import', Component: ImportPage },
      { path: 'regles', Component: SortingRulesPage },
      { path: 'parametres', Component: SettingsPage },
      { path: '*', Component: NotFoundPage },
    ],
  },
]);
