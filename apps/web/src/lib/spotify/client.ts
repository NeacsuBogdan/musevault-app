import 'server-only';

import type { ZodType } from 'zod';

import type { SavedTracksPage, SpotifyProfile } from '@/types/spotify';

import { SpotifyApiError, spotifyApiErrorFromResponse } from './errors';
import { normalizeSpotifyProfile, normalizeSpotifySavedTracks } from './normalize';
import { spotifyProfileResponseSchema, spotifySavedTracksResponseSchema } from './schemas';

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
    throw new SpotifyApiError('unavailable', null);
  }

  if (!response.ok) {
    throw spotifyApiErrorFromResponse(response);
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new SpotifyApiError('invalid_response', response.status);
  }

  const result = schema.safeParse(payload);

  if (!result.success) {
    throw new SpotifyApiError('invalid_response', response.status);
  }

  return result.data;
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
