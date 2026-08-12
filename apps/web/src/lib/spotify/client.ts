import 'server-only';

import type { ZodType } from 'zod';

import type {
  RecentlyPlayedPage,
  SavedTracksPage,
  SpotifyAffinityArtist,
  SpotifyCatalogTrack,
  SpotifyProfile,
  SpotifyTopTimeRange,
} from '@/types/spotify';

import {
  sanitizeSpotifySchemaIssues,
  SpotifyApiError,
  spotifyApiErrorFromResponse,
} from './errors';
import {
  normalizeSpotifyCatalogTrack,
  normalizeSpotifyProfile,
  normalizeSpotifyRecentlyPlayed,
  normalizeSpotifySavedTracks,
} from './normalize';
import {
  spotifyProfileResponseSchema,
  spotifyRecentlyPlayedResponseSchema,
  spotifySavedTracksResponseSchema,
  spotifyTopArtistsResponseSchema,
  spotifyTopTracksResponseSchema,
} from './schemas';

const SPOTIFY_API_BASE_URL = 'https://api.spotify.com/v1';

async function getSpotifyJson<T>(
  path: string,
  accessToken: string,
  schema: ZodType<T>,
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${SPOTIFY_API_BASE_URL}${path}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
      redirect: 'error',
    });
  } catch {
    throw new SpotifyApiError('unavailable', null, null, 'network');
  }

  if (!response.ok) {
    throw spotifyApiErrorFromResponse(response);
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new SpotifyApiError('invalid_response', response.status, null, 'json');
  }

  const result = schema.safeParse(payload);

  if (!result.success) {
    throw new SpotifyApiError(
      'invalid_response',
      response.status,
      null,
      'schema',
      sanitizeSpotifySchemaIssues(result.error.issues),
    );
  }

  return result.data;
}

export async function getSpotifyRecentlyPlayed(
  accessToken: string,
  options: { limit: number; after?: number; before?: number },
): Promise<RecentlyPlayedPage> {
  const params = new URLSearchParams({ limit: String(options.limit) });
  if (options.after !== undefined) params.set('after', String(options.after));
  if (options.before !== undefined) params.set('before', String(options.before));
  return normalizeSpotifyRecentlyPlayed(
    await getSpotifyJson(
      `/me/player/recently-played?${params}`,
      accessToken,
      spotifyRecentlyPlayedResponseSchema,
    ),
  );
}

export async function getSpotifyTopTracks(
  accessToken: string,
  timeRange: SpotifyTopTimeRange,
): Promise<SpotifyCatalogTrack[]> {
  const response = await getSpotifyJson(
    `/me/top/tracks?limit=20&time_range=${timeRange}`,
    accessToken,
    spotifyTopTracksResponseSchema,
  );
  return response.items.map(normalizeSpotifyCatalogTrack);
}

export async function getSpotifyTopArtists(
  accessToken: string,
  timeRange: SpotifyTopTimeRange,
): Promise<SpotifyAffinityArtist[]> {
  const response = await getSpotifyJson(
    `/me/top/artists?limit=20&time_range=${timeRange}`,
    accessToken,
    spotifyTopArtistsResponseSchema,
  );
  return response.items.map(({ id, name }) => ({ id, name }));
}

export async function getSpotifyProfile(accessToken: string): Promise<SpotifyProfile> {
  const profile = await getSpotifyJson('/me', accessToken, spotifyProfileResponseSchema);

  return normalizeSpotifyProfile(profile);
}

export async function getSpotifySavedTracks(
  accessToken: string,
  options: { limit: number; offset: number },
): Promise<SavedTracksPage> {
  const searchParams = new URLSearchParams({
    limit: String(options.limit),
    offset: String(options.offset),
  });
  const response = await getSpotifyJson(
    `/me/tracks?${searchParams.toString()}`,
    accessToken,
    spotifySavedTracksResponseSchema,
  );

  return normalizeSpotifySavedTracks(response);
}
