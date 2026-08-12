export interface SpotifyProfile {
  accountId: string;
  displayName: string;
  imageUrl: string | null;
}

export interface SavedTrack {
  id: string;
  albumId: string;
  spotifyUrl: string;
  name: string;
  artistIds: string[];
  artistNames: string[];
  albumName: string;
  albumImageUrl: string | null;
  durationMs: number;
  explicit: boolean;
  savedAt: string;
}

export type SpotifyCatalogTrack = Omit<SavedTrack, 'savedAt'>;

export interface RecordedSpotifyPlay {
  track: SpotifyCatalogTrack;
  playedAt: string;
  context: { type: string; uri: string; spotifyUrl: string | null } | null;
}

export interface RecentlyPlayedPage {
  items: RecordedSpotifyPlay[];
  cursors: { after: number | null; before: number | null };
  hasNext: boolean;
}

export type SpotifyTopTimeRange = 'short_term' | 'medium_term' | 'long_term';
export interface SpotifyAffinityArtist {
  id: string;
  name: string;
}

export interface SavedTracksPage {
  items: SavedTrack[];
  total: number;
  limit: number;
  offset: number;
}

export type SavedTracksErrorCode =
  | 'invalid_request'
  | 'unauthenticated'
  | 'spotify_authorization_expired'
  | 'spotify_forbidden'
  | 'spotify_rate_limited'
  | 'spotify_unavailable'
  | 'internal_error';

export interface SavedTracksErrorResponse {
  error: {
    code: SavedTracksErrorCode;
    message: string;
    retryAfter?: number;
  };
}
