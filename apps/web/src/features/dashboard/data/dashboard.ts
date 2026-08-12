import type { DashboardIconName } from '../types';

export interface DashboardNavigationEntry {
  label: string;
  icon: DashboardIconName;
  href?: string;
  isActive?: boolean;
  status?: 'Preview' | 'Later';
}

export const desktopNavigation: readonly DashboardNavigationEntry[] = [
  {
    label: 'Overview',
    href: '/dashboard',
    icon: 'overview',
    isActive: true,
  },
  {
    label: 'Library',
    href: '/library',
    icon: 'discover',
  },
  {
    label: 'Rediscover',
    href: '/rediscover',
    icon: 'gem',
  },
  {
    label: 'Playlists',
    icon: 'playlists',
    status: 'Later',
  },
  {
    label: 'Analytics',
    href: '#analytics',
    icon: 'analytics',
  },
  {
    label: 'Listening Insights',
    href: '/listening',
    icon: 'history',
  },
  {
    label: 'Audio Profile',
    href: '/audio-profile',
    icon: 'music',
  },
  {
    label: 'Time Machine',
    icon: 'history',
    status: 'Later',
  },
  {
    label: 'Wrapped',
    icon: 'wrapped',
    status: 'Later',
  },
  {
    label: 'Settings',
    icon: 'settings',
    status: 'Later',
  },
];

export const mobileNavigation: readonly DashboardNavigationEntry[] = [
  desktopNavigation[0],
  desktopNavigation[1],
  desktopNavigation[2],
  desktopNavigation[5],
  desktopNavigation[6],
].filter((item): item is DashboardNavigationEntry => item !== undefined);
