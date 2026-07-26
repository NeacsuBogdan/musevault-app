export type AccentTone = 'green' | 'purple' | 'blue' | 'pink' | 'yellow';

export type DashboardIconName =
  | 'analytics'
  | 'artists'
  | 'clock'
  | 'discover'
  | 'gem'
  | 'heart'
  | 'history'
  | 'music'
  | 'overview'
  | 'playlists'
  | 'settings'
  | 'sparkles'
  | 'wrapped';

export interface DashboardNavigationItem {
  label: string;
  href: string;
  icon: DashboardIconName;
  isActive?: boolean;
}

export interface DashboardProfile {
  firstName: string;
  displayName: string;
  handle: string;
  initials: string;
}

export interface LibrarySyncStatus {
  label: string;
  detail: string;
  lastSynced: string;
}

export interface DashboardStatistic {
  label: string;
  value: string;
  change: string;
  icon: DashboardIconName;
  accent: AccentTone;
}

export interface EvolutionSeries {
  label: string;
  accent: AccentTone;
  values: readonly number[];
}

export interface EvolutionSnapshot {
  rangeLabel: string;
  summary: string;
  axisLabels: readonly string[];
  series: readonly EvolutionSeries[];
}

export interface MoodSlice {
  label: string;
  value: number;
  accent: AccentTone;
}

export interface RediscoverCollection {
  title: string;
  description: string;
  trackCount: number;
  icon: DashboardIconName;
  accent: AccentTone;
}

export interface GeneratedPlaylist {
  title: string;
  description: string;
  trackCount: number;
  duration: string;
  accent: AccentTone;
  icon: DashboardIconName;
}

export interface LibraryHealthMetric {
  label: string;
  value: string;
  status: 'good' | 'attention';
}

export interface LibraryHealth {
  score: number;
  summary: string;
  metrics: readonly LibraryHealthMetric[];
}
