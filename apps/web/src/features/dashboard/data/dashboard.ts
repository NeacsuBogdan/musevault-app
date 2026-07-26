import type {
  DashboardNavigationItem,
  DashboardProfile,
  DashboardStatistic,
  EvolutionSnapshot,
  GeneratedPlaylist,
  LibraryHealth,
  LibrarySyncStatus,
  MoodSlice,
  RediscoverCollection,
} from '../types';

export const desktopNavigation: readonly DashboardNavigationItem[] = [
  {
    label: 'Overview',
    href: '/dashboard',
    icon: 'overview',
    isActive: true,
  },
  {
    label: 'Discover',
    href: '#rediscover',
    icon: 'discover',
  },
  {
    label: 'Playlists',
    href: '#generated-playlists',
    icon: 'playlists',
  },
  {
    label: 'Analytics',
    href: '#analytics',
    icon: 'analytics',
  },
  {
    label: 'Time Machine',
    href: '#rediscover',
    icon: 'history',
  },
  {
    label: 'Wrapped',
    href: '#evolution',
    icon: 'wrapped',
  },
  {
    label: 'Settings',
    href: '#library-health',
    icon: 'settings',
  },
];

export const mobileNavigation: readonly DashboardNavigationItem[] = [
  desktopNavigation[0],
  desktopNavigation[1],
  desktopNavigation[2],
  desktopNavigation[3],
  desktopNavigation[6],
].filter((item): item is DashboardNavigationItem => item !== undefined);

export const dashboardProfile: DashboardProfile = {
  firstName: 'Alex',
  displayName: 'Alex Morgan',
  handle: '@alexlistens',
  initials: 'AM',
};

export const librarySyncStatus: LibrarySyncStatus = {
  label: 'Library synced',
  detail: '1,284 tracks indexed',
  lastSynced: 'Updated 4 min ago',
};

export const dashboardStatistics: readonly DashboardStatistic[] = [
  {
    label: 'Liked Songs',
    value: '1,284',
    change: '+64 this month',
    icon: 'heart',
    accent: 'green',
  },
  {
    label: 'Playlists',
    value: '18',
    change: '3 curated by you',
    icon: 'playlists',
    accent: 'purple',
  },
  {
    label: 'Hours Listened',
    value: '347h',
    change: '+12% this season',
    icon: 'clock',
    accent: 'blue',
  },
  {
    label: 'Artists',
    value: '412',
    change: '28 new discoveries',
    icon: 'artists',
    accent: 'pink',
  },
];

export const evolutionSnapshot: EvolutionSnapshot = {
  rangeLabel: 'Last 6 months',
  summary: 'Your listening has become more energetic while acoustic listening has remained steady.',
  axisLabels: ['Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'],
  series: [
    {
      label: 'Energy',
      accent: 'green',
      values: [44, 52, 49, 65, 72, 81],
    },
    {
      label: 'Discovery',
      accent: 'purple',
      values: [28, 43, 56, 48, 67, 73],
    },
    {
      label: 'Acoustic',
      accent: 'blue',
      values: [62, 58, 64, 55, 59, 61],
    },
  ],
};

export const moodDistribution: readonly MoodSlice[] = [
  { label: 'Energetic', value: 34, accent: 'green' },
  { label: 'Reflective', value: 28, accent: 'purple' },
  { label: 'Calm', value: 22, accent: 'blue' },
  { label: 'Joyful', value: 16, accent: 'yellow' },
];

export const rediscoverCollections: readonly RediscoverCollection[] = [
  {
    title: 'Forgotten Songs',
    description: 'Old favorites you have not played in over a year.',
    trackCount: 32,
    icon: 'history',
    accent: 'purple',
  },
  {
    title: 'Hidden Gems',
    description: 'Deep favorites waiting outside your usual rotation.',
    trackCount: 24,
    icon: 'gem',
    accent: 'green',
  },
  {
    title: 'Time Machine',
    description: 'Return to the sound that defined your summer of 2022.',
    trackCount: 40,
    icon: 'clock',
    accent: 'blue',
  },
  {
    title: 'Deep Cuts',
    description: 'Less-played tracks from the artists you know best.',
    trackCount: 28,
    icon: 'music',
    accent: 'pink',
  },
];

export const generatedPlaylists: readonly GeneratedPlaylist[] = [
  {
    title: 'Sunday Static',
    description: 'Soft focus for a slower morning',
    trackCount: 24,
    duration: '1h 32m',
    accent: 'purple',
    icon: 'sparkles',
  },
  {
    title: 'Neon Momentum',
    description: 'Bright energy for the week ahead',
    trackCount: 32,
    duration: '2h 05m',
    accent: 'green',
    icon: 'discover',
  },
  {
    title: 'After Hours',
    description: 'Late-night electronic textures',
    trackCount: 18,
    duration: '1h 14m',
    accent: 'blue',
    icon: 'wrapped',
  },
];

export const libraryHealth: LibraryHealth = {
  score: 86,
  summary: 'Your library is varied and well maintained.',
  metrics: [
    {
      label: 'Metadata coverage',
      value: 'Excellent',
      status: 'good',
    },
    {
      label: 'Duplicate tracks',
      value: '3 found',
      status: 'attention',
    },
    {
      label: 'Recent discoveries',
      value: '28 this month',
      status: 'good',
    },
  ],
};
