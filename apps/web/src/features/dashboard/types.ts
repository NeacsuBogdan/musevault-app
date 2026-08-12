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
  | 'wrapped';

export interface DashboardProfile {
  displayName: string;
  firstName: string;
  initials: string;
  imageUrl: string | null;
}

export interface DashboardStatistic {
  label: string;
  value: string;
  helper: string;
  icon: DashboardIconName;
  accent: AccentTone;
}

export interface DashboardRecentTrack {
  id: string;
  name: string;
  artistNames: readonly string[];
  albumName: string;
  albumImageUrl: string | null;
  spotifyUrl: string | null;
  savedAt: string;
}

export interface DashboardAnalyticsModel {
  topArtists: ReadonlyArray<{ id: string; name: string; savedTrackCount: number }>;
  topAlbums: ReadonlyArray<{
    id: string;
    name: string;
    imageUrl: string | null;
    savedTrackCount: number;
  }>;
  savedTimeline: ReadonlyArray<{
    year: number;
    savedTrackCount: number;
    cumulativeTrackCount: number;
  }>;
  explicitTrackCount: number;
  nonExplicitTrackCount: number;
  explicitPercentage: number;
  nonExplicitPercentage: number;
  durationBuckets: ReadonlyArray<{
    key: string;
    label: string;
    trackCount: number;
    percentage: number;
  }>;
  firstSavedAt: string | null;
  latestSavedAt: string | null;
}

export interface DashboardViewModel {
  analytics: DashboardAnalyticsModel;
  profile: DashboardProfile;
  statistics: readonly DashboardStatistic[];
  recentlySaved: readonly DashboardRecentTrack[];
  savedTrackCount: number;
  lastSuccessfulSyncAt: string | null;
  latestFullSyncAt: string;
}

export type DashboardDataState =
  | {
      status: 'success';
      viewModel: DashboardViewModel;
    }
  | { status: 'sync_required' }
  | { status: 'sync_in_progress' }
  | {
      status: 'unexpected_failure';
    };
