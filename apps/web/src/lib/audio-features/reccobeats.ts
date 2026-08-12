import 'server-only';

import { z } from 'zod';
import {
  AUDIO_FEATURE_BATCH_LIMIT,
  AUDIO_FEATURE_PROVIDER,
  type AudioFeatureProvider,
  AudioFeatureProviderError,
  type ProviderAudioFeatures,
} from './provider';

const BASE_URL = 'https://api.reccobeats.com';
const bounded = z.number().finite().min(0).max(1);
const resolvedTrackSchema = z.object({
  id: z.string().min(1),
  href: z.string().url(),
});
const featureSchema = z.object({
  id: z.string().min(1),
  acousticness: bounded,
  danceability: bounded,
  energy: bounded,
  instrumentalness: bounded,
  liveness: bounded,
  loudness: z.number().finite(),
  speechiness: bounded,
  tempo: z.number().finite().nonnegative(),
  valence: bounded,
});
const trackEnvelopeSchema = z.union([
  z.array(resolvedTrackSchema),
  z.object({ content: z.array(resolvedTrackSchema) }).transform((value) => value.content),
]);
const featureEnvelopeSchema = z.union([
  z.array(featureSchema),
  z.object({ content: z.array(featureSchema) }).transform((value) => value.content),
]);

type Operation = 'resolve_tracks' | 'load_audio_features';
function retryAfter(value: string | null) {
  if (value === null || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}
function diagnostic(operation: Operation, category: string, status: number | null) {
  console.error(
    `audio_feature_provider_failure provider=reccobeats operation=${operation} category=${category} status=${status ?? 'none'}`,
  );
}
async function request<T>(operation: Operation, path: string, schema: z.ZodType<T>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      method: 'GET',
      redirect: 'error',
    });
  } catch {
    diagnostic(operation, 'network', null);
    throw new AudioFeatureProviderError('provider_unavailable');
  }
  if (!response.ok) {
    diagnostic(operation, 'http', response.status);
    if (response.status === 400) throw new AudioFeatureProviderError('provider_invalid_request');
    if (response.status === 429)
      throw new AudioFeatureProviderError(
        'rate_limited',
        retryAfter(response.headers.get('retry-after')),
      );
    throw new AudioFeatureProviderError('provider_unavailable');
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    diagnostic(operation, 'json', response.status);
    throw new AudioFeatureProviderError('provider_invalid_response');
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    diagnostic(operation, 'schema', response.status);
    throw new AudioFeatureProviderError('provider_invalid_response');
  }
  return parsed.data;
}
function spotifyIdFromHref(href: string): string | null {
  try {
    const url = new URL(href);
    if (url.hostname !== 'open.spotify.com' || !url.pathname.startsWith('/track/')) return null;
    return url.pathname.split('/')[2] || null;
  } catch {
    return null;
  }
}

export const reccoBeatsProvider: AudioFeatureProvider = {
  name: AUDIO_FEATURE_PROVIDER,
  async loadForSpotifyTrackIds(spotifyTrackIds) {
    const uniqueIds = [...new Set(spotifyTrackIds)];
    if (uniqueIds.length < 1 || uniqueIds.length > AUDIO_FEATURE_BATCH_LIMIT)
      throw new AudioFeatureProviderError('provider_invalid_request');
    const resolved = await request(
      'resolve_tracks',
      `/v1/track?ids=${encodeURIComponent(uniqueIds.join(','))}`,
      trackEnvelopeSchema,
    );
    const spotifyToProvider = new Map<string, string>();
    for (const item of resolved) {
      const spotifyId = spotifyIdFromHref(item.href);
      if (spotifyId && uniqueIds.includes(spotifyId)) spotifyToProvider.set(spotifyId, item.id);
    }
    const providerToSpotify = new Map(
      [...spotifyToProvider].map(([spotify, provider]) => [provider, spotify]),
    );
    const providerIds = [...providerToSpotify.keys()];
    const features = providerIds.length
      ? await request(
          'load_audio_features',
          `/v1/audio-features?ids=${encodeURIComponent(providerIds.join(','))}`,
          featureEnvelopeSchema,
        )
      : [];
    const available: ProviderAudioFeatures[] = [];
    for (const row of features) {
      const spotifyTrackId = providerToSpotify.get(row.id);
      if (spotifyTrackId) available.push({ ...row, spotifyTrackId, providerTrackId: row.id });
    }
    const found = new Set(available.map((item) => item.spotifyTrackId));
    return {
      available,
      notFoundSpotifyTrackIds: uniqueIds.filter((id) => !found.has(id)),
    };
  },
};
