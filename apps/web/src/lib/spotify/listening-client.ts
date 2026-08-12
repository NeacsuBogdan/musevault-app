import 'server-only';

import type { SpotifySession } from '@/lib/auth/session';
import type {
  RecentlyPlayedPage,
  SpotifyAffinityArtist,
  SpotifyCatalogTrack,
  SpotifyTopTimeRange,
} from '@/types/spotify';
import { getSpotifyRecentlyPlayed, getSpotifyTopArtists, getSpotifyTopTracks } from './client';
import { SpotifyApiError } from './errors';
import { ensureFreshSpotifySession, SpotifyTokenRefreshError } from './tokens';

type ListeningSpotifyOperation =
  | 'recently_played'
  | `top_tracks_${SpotifyTopTimeRange}`
  | `top_artists_${SpotifyTopTimeRange}`;

function safeStatus(status: number | null): string {
  return status === null ? 'none' : String(status);
}

function logSpotifyFailure(operation: ListeningSpotifyOperation, error: unknown): void {
  if (error instanceof SpotifyApiError) {
    console.error(
      `spotify_listening_failure operation=${operation} category=${error.category} kind=${error.kind} status=${safeStatus(error.status)}`,
    );
    if (operation === 'recently_played' && error.category === 'schema') {
      for (const issue of error.schemaIssues) {
        console.error(
          `spotify_listening_schema_issue operation=recently_played path=${issue.path} code=${issue.code}`,
        );
      }
    }
    return;
  }
  console.error(
    `spotify_listening_failure operation=${operation} category=unknown kind=unavailable status=none`,
  );
}

function logTokenRefreshFailure(error: unknown): void {
  const status = error instanceof SpotifyTokenRefreshError ? error.status : null;
  const kind =
    error instanceof SpotifyTokenRefreshError && error.status === 429
      ? 'rate_limited'
      : error instanceof SpotifyTokenRefreshError && error.kind === 'permanent'
        ? 'unauthorized'
        : 'unavailable';
  console.error(
    `spotify_listening_failure operation=token_refresh category=refresh kind=${kind} status=${safeStatus(status)}`,
  );
}

async function withRefresh<T>(
  session: SpotifySession,
  operationName: ListeningSpotifyOperation,
  operation: (token: string) => Promise<T>,
): Promise<T> {
  let active: SpotifySession;
  try {
    active = await ensureFreshSpotifySession(session);
  } catch (error) {
    logTokenRefreshFailure(error);
    throw error;
  }
  try {
    return await operation(active.accessToken);
  } catch (error) {
    if (!(error instanceof SpotifyApiError) || error.kind !== 'unauthorized') {
      logSpotifyFailure(operationName, error);
      throw error;
    }
    try {
      active = await ensureFreshSpotifySession(active, { force: true });
    } catch (refreshError) {
      logTokenRefreshFailure(refreshError);
      throw refreshError;
    }
    try {
      return await operation(active.accessToken);
    } catch (retryError) {
      logSpotifyFailure(operationName, retryError);
      throw retryError;
    }
  }
}

export function loadRecentlyPlayed(
  session: SpotifySession,
  options: { limit: number; after?: number; before?: number },
): Promise<RecentlyPlayedPage> {
  return withRefresh(session, 'recently_played', (token) =>
    getSpotifyRecentlyPlayed(token, options),
  );
}
export function loadTopTracks(
  session: SpotifySession,
  range: SpotifyTopTimeRange,
): Promise<SpotifyCatalogTrack[]> {
  return withRefresh(session, `top_tracks_${range}`, (token) => getSpotifyTopTracks(token, range));
}
export function loadTopArtists(
  session: SpotifySession,
  range: SpotifyTopTimeRange,
): Promise<SpotifyAffinityArtist[]> {
  return withRefresh(session, `top_artists_${range}`, (token) =>
    getSpotifyTopArtists(token, range),
  );
}
