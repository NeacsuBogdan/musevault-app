import type { AccentTone, DashboardIconName } from '../types';

export interface DashboardNavigationEntry {
  label: string;
  icon: DashboardIconName;
  href?: string;
  isActive?: boolean;
  status?: 'Preview' | 'Later';
}

export interface RediscoverPreview {
  title: string;
  description: string;
  icon: DashboardIconName;
  accent: AccentTone;
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
    label: 'Playlists',
    icon: 'playlists',
    status: 'Later',
  },
  {
    label: 'Analytics',
    href: '#analytics',
    icon: 'analytics',
    status: 'Preview',
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
  {
    label: 'Analytics',
    href: '#analytics',
    icon: 'analytics',
    status: 'Preview',
  },
  {
    label: 'Rediscover',
    href: '#rediscover',
    icon: 'gem',
    status: 'Preview',
  },
  desktopNavigation[6],
].filter((item): item is DashboardNavigationEntry => item !== undefined);

export const rediscoverPreviews: readonly RediscoverPreview[] = [
  {
    title: 'Forgotten Songs',
    description: 'Will surface older favorites after MuseVault can sync your full library.',
    icon: 'history',
    accent: 'purple',
  },
  {
    title: 'Hidden Gems',
    description: 'Will find less-visible favorites once recommendation signals are available.',
    icon: 'gem',
    accent: 'green',
  },
  {
    title: 'Time Machine',
    description: 'Will revisit earlier chapters of your library after listening history is added.',
    icon: 'clock',
    accent: 'blue',
  },
  {
    title: 'Deep Cuts',
    description:
      'Will highlight overlooked tracks after MuseVault can analyze your full collection.',
    icon: 'music',
    accent: 'pink',
  },
];
