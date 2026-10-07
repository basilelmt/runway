import { ArrowLeftRight, ChartNoAxesColumn, House, Settings, WalletCards, type LucideIcon } from 'lucide-react';

export type NavItem = { to: string; label: string; icon: LucideIcon; badge?: 'unsorted' | 'toAllocate' };

/** Les quatre destinations principales, dans l'ordre d'usage. */
export const NAV: NavItem[] = [
  { to: '/', label: 'Accueil', icon: House },
  { to: '/budget', label: 'Budget', icon: WalletCards, badge: 'toAllocate' },
  { to: '/operations', label: 'Opérations', icon: ArrowLeftRight, badge: 'unsorted' },
  { to: '/analyse', label: 'Analyse', icon: ChartNoAxesColumn },
];

export const SETTINGS_NAV: NavItem = { to: '/reglages', label: 'Réglages', icon: Settings };
