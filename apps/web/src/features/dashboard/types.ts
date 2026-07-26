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

export interface DashboardViewModel {
  profile: DashboardProfile;
  statistics: readonly DashboardStatistic[];
  recentlySaved: readonly DashboardRecentTrack[];
  loadedTrackCount: number;
}

export type DashboardDataState =
  | {
      status: 'success';
      viewModel: DashboardViewModel;
    }
  | {
      status: 'authorization_expired';
    }
  | {
      status: 'rate_limited';
      retryAfter: number | null;
    }
  | {
      status: 'temporarily_unavailable';
    }
  | {
      status: 'unexpected_failure';
    };
