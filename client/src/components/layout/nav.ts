import { ArrowLeftRight, ChartNoAxesColumn, House, Settings, TrendingUp, WalletCards, type LucideIcon } from 'lucide-react';

export type NavItem = { to: string; label: string; icon: LucideIcon; badge?: 'unsorted' | 'toAllocate' };

/** Les cinq destinations principales, dans l'ordre d'usage. */
export const NAV: NavItem[] = [
  { to: '/', label: 'Accueil', icon: House },
  { to: '/budget', label: 'Budget', icon: WalletCards, badge: 'toAllocate' },
  { to: '/operations', label: 'Opérations', icon: ArrowLeftRight, badge: 'unsorted' },
  { to: '/analyse', label: 'Analyse', icon: ChartNoAxesColumn },
  { to: '/investir', label: 'Investir', icon: TrendingUp },
];

export const SETTINGS_NAV: NavItem = { to: '/reglages', label: 'Réglages', icon: Settings };
