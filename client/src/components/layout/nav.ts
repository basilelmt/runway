import {
  ArrowLeftRight,
  BarChart3,
  Download,
  Inbox,
  Landmark,
  LayoutDashboard,
  ListFilter,
  Plane,
  Repeat,
  Settings,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';

export type NavItem = { to: string; label: string; short?: string; icon: LucideIcon; badge?: 'unsorted' };

export const NAV: NavItem[] = [
  { to: '/', label: 'Tableau de bord', short: 'Accueil', icon: LayoutDashboard },
  { to: '/operations', label: 'Opérations', icon: ArrowLeftRight },
  { to: '/a-trier', label: 'À trier', icon: Inbox, badge: 'unsorted' },
  { to: '/enveloppes', label: 'Enveloppes', icon: WalletCards },
  { to: '/comptes', label: 'Comptes', icon: Landmark },
  { to: '/recurrences', label: 'Récurrences', icon: Repeat },
  { to: '/prevision', label: 'Prévision', icon: Plane },
  { to: '/rapports', label: 'Rapports', icon: BarChart3 },
  { to: '/import', label: 'Import', icon: Download },
  { to: '/regles', label: 'Règles de tri', icon: ListFilter },
  { to: '/parametres', label: 'Paramètres', icon: Settings },
];

/** Sur mobile, 4 destinations directes et un menu "Plus". */
export const MOBILE_PRIMARY = ['/', '/operations', '/enveloppes', '/prevision'];
