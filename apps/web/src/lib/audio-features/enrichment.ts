import 'server-only';

import { and, eq, sql } from 'drizzle-orm';
import { withDatabase } from '@/lib/db/client';
import { trackAudioFeatures, trackEnrichmentRuns } from '@/lib/db/schema';
import {
  getEnrichmentCandidates,
  NOT_FOUND_COOLDOWN_MS,
  resolveAudioProfileUser,
} from '@/lib/db/repositories/audio-profile';
import { reccoBeatsProvider } from './reccobeats';
import {
  AUDIO_FEATURE_BATCH_LIMIT,
  AUDIO_FEATURE_PROVIDER,
  AudioFeatureProviderError,
} from './provider';

export const ENRICHMENT_BATCHES_PER_REQUEST = 3;
export type EnrichmentResultCode =
  | 'applied'
  | 'no_changes'
  | 'rate_limited'
  | 'provider_unavailable'
  | 'provider_invalid_response';
export class EnrichmentError extends Error {
  constructor(
    public readonly code: EnrichmentResultCode | 'unexpected_failure',
    public readonly retryAfter: number | null = null,
  ) {
    super('Audio enrichment failed.');
    this.name = 'EnrichmentError';
  }
}
function publicCode(error: AudioFeatureProviderError): EnrichmentResultCode {
  return error.code === 'rate_limited'
    ? 'rate_limited'
    : error.code === 'provider_invalid_response'
      ? 'provider_invalid_response'
      : 'provider_unavailable';
}
export async function processEnrichmentRequest(spotifyAccountId: string) {
  const userId = await resolveAudioProfileUser(spotifyAccountId);
  if (!userId) throw new EnrichmentError('unexpected_failure');
  const run = await withDatabase((db) =>
    db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId} || ':enrichment'))`);
      const [created] = await tx
        .insert(trackEnrichmentRuns)
        .values({ userId, provider: AUDIO_FEATURE_PROVIDER })
        .returning({ id: trackEnrichmentRuns.id });
      return created;
    }),
  );
  if (!run) throw new EnrichmentError('unexpected_failure');
  const candidates = await getEnrichmentCandidates(userId);
  let attempted = 0,
    enriched = 0,
    notFound = 0;
  try {
    for (
      let offset = 0, batch = 0;
      offset < candidates.length && batch < ENRICHMENT_BATCHES_PER_REQUEST;
      offset += AUDIO_FEATURE_BATCH_LIMIT, batch += 1
    ) {
      const ids = candidates.slice(offset, offset + AUDIO_FEATURE_BATCH_LIMIT);
      const result = await reccoBeatsProvider.loadForSpotifyTrackIds(ids);
      const now = new Date();
      await withDatabase((db) =>
        db.transaction(async (tx) => {
          if (result.available.length)
            await tx
              .insert(trackAudioFeatures)
              .values(
                result.available.map((item) => ({
                  trackId: item.spotifyTrackId,
                  provider: AUDIO_FEATURE_PROVIDER,
                  providerTrackId: item.providerTrackId,
                  status: 'available',
                  acousticness: item.acousticness,
                  danceability: item.danceability,
                  energy: item.energy,
                  instrumentalness: item.instrumentalness,
                  liveness: item.liveness,
                  loudness: item.loudness,
                  speechiness: item.speechiness,
                  tempo: item.tempo,
                  valence: item.valence,
                  fetchedAt: now,
                  retryAfterAt: null,
                  updatedAt: now,
                })),
              )
              .onConflictDoUpdate({
                target: [trackAudioFeatures.trackId, trackAudioFeatures.provider],
                set: {
                  providerTrackId: sql`excluded.provider_track_id`,
                  status: 'available',
                  acousticness: sql`excluded.acousticness`,
                  danceability: sql`excluded.danceability`,
                  energy: sql`excluded.energy`,
                  instrumentalness: sql`excluded.instrumentalness`,
                  liveness: sql`excluded.liveness`,
                  loudness: sql`excluded.loudness`,
                  speechiness: sql`excluded.speechiness`,
                  tempo: sql`excluded.tempo`,
                  valence: sql`excluded.valence`,
                  fetchedAt: now,
                  retryAfterAt: null,
                  updatedAt: now,
                },
              });
          if (result.notFoundSpotifyTrackIds.length)
            await tx
              .insert(trackAudioFeatures)
              .values(
                result.notFoundSpotifyTrackIds.map((trackId) => ({
                  trackId,
                  provider: AUDIO_FEATURE_PROVIDER,
                  status: 'not_found',
                  retryAfterAt: new Date(now.getTime() + NOT_FOUND_COOLDOWN_MS),
                  updatedAt: now,
                })),
              )
              .onConflictDoUpdate({
                target: [trackAudioFeatures.trackId, trackAudioFeatures.provider],
                set: {
                  status: 'not_found',
                  retryAfterAt: new Date(now.getTime() + NOT_FOUND_COOLDOWN_MS),
                  updatedAt: now,
                },
              });
        }),
      );
      attempted += ids.length;
      enriched += result.available.length;
      notFound += result.notFoundSpotifyTrackIds.length;
    }
    const resultCode: EnrichmentResultCode = enriched || notFound ? 'applied' : 'no_changes';
    await finishRun(run.id, {
      attempted,
      enriched,
      notFound,
      resultCode,
      status: 'completed',
      retryAfter: null,
    });
    return {
      provider: AUDIO_FEATURE_PROVIDER,
      result: resultCode,
      attemptedTrackCount: attempted,
      enrichedTrackCount: enriched,
      notFoundTrackCount: notFound,
      retryAfter: null,
    };
  } catch (error) {
    const providerError = error instanceof AudioFeatureProviderError ? error : null;
    const code = providerError ? publicCode(providerError) : 'provider_unavailable';
    await finishRun(run.id, {
      attempted,
      enriched,
      notFound,
      resultCode: code,
      status: 'failed',
      retryAfter: providerError?.retryAfter ?? null,
    });
    throw new EnrichmentError(code, providerError?.retryAfter ?? null);
  }
}
async function finishRun(
  id: string,
  input: {
    attempted: number;
    enriched: number;
    notFound: number;
    resultCode: string;
    status: string;
    retryAfter: number | null;
  },
) {
  await withDatabase((db) =>
    db
      .update(trackEnrichmentRuns)
      .set({
        attemptedTrackCount: input.attempted,
        enrichedTrackCount: input.enriched,
        notFoundTrackCount: input.notFound,
        completedAt: new Date(),
        updatedAt: new Date(),
        resultCode: input.resultCode,
        status: input.status,
        retryAfterSeconds: input.retryAfter,
      })
      .where(and(eq(trackEnrichmentRuns.id, id), eq(trackEnrichmentRuns.status, 'running'))),
  );
}
