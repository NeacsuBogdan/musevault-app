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
  {
    label: 'Analytics',
    href: '#analytics',
    icon: 'analytics',
  },
  desktopNavigation[4],
  desktopNavigation[5],
].filter((item): item is DashboardNavigationEntry => item !== undefined);

export const rediscoverPreviews: readonly RediscoverPreview[] = [
  {
    title: 'Forgotten Songs',
    description: 'Will surface older favorites after the Rediscover engine is implemented.',
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
    description: 'Will highlight overlooked tracks after library analysis is implemented.',
    icon: 'music',
    accent: 'pink',
  },
];
