export interface SpotifyProfile {
  accountId: string;
  displayName: string;
  imageUrl: string | null;
}

export interface SavedTrack {
  id: string;
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
