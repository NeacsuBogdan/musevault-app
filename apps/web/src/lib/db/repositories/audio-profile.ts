import 'server-only';

import { and, asc, desc, eq, gte, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { withDatabase } from '@/lib/db/client';
import {
  spotifyPlayHistory,
  spotifyTopItemSnapshots,
  spotifyTopTrackSnapshotItems,
  spotifyTracks,
  trackAudioFeatures,
  trackEnrichmentRuns,
  userSavedTracks,
  users,
} from '@/lib/db/schema';

export const RECCOBEATS_PROVIDER = 'reccobeats';
export const NOT_FOUND_COOLDOWN_MS = 30 * 86_400_000;
export const ENRICHMENT_REQUEST_LIMIT = 60;

export function prioritizeCandidateTrackIds(
  tiers: readonly (readonly { id: string }[])[],
  limit = ENRICHMENT_REQUEST_LIMIT,
): string[] {
  const ids = new Set<string>();
  for (const tier of tiers) {
    for (const row of tier) {
      if (ids.size === limit) return [...ids];
      ids.add(row.id);
    }
  }
  return [...ids];
}

export async function resolveAudioProfileUser(spotifyAccountId: string) {
  return withDatabase(async (db) => {
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.spotifyAccountId, spotifyAccountId))
      .limit(1);
    return user?.id ?? null;
  });
}

export async function getEnrichmentCandidates(
  userId: string,
  now = new Date(),
  limit = ENRICHMENT_REQUEST_LIMIT,
): Promise<string[]> {
  return withDatabase(async (db) => {
    const recentSince = new Date(now.getTime() - 7 * 86_400_000);
    const eligible = or(
      isNull(trackAudioFeatures.trackId),
      and(eq(trackAudioFeatures.status, 'not_found'), lte(trackAudioFeatures.retryAfterAt, now)),
    );
    const recent = await db
      .select({ id: spotifyPlayHistory.trackId })
      .from(spotifyPlayHistory)
      .leftJoin(
        trackAudioFeatures,
        and(
          eq(trackAudioFeatures.trackId, spotifyPlayHistory.trackId),
          eq(trackAudioFeatures.provider, RECCOBEATS_PROVIDER),
        ),
      )
      .where(
        and(
          eq(spotifyPlayHistory.userId, userId),
          gte(spotifyPlayHistory.playedAt, recentSince),
          eligible,
        ),
      )
      .groupBy(spotifyPlayHistory.trackId)
      .orderBy(desc(sql`max(${spotifyPlayHistory.playedAt})`), asc(spotifyPlayHistory.trackId))
      .limit(limit);
    const latestDate = db
      .select({ date: sql<string>`max(${spotifyTopItemSnapshots.snapshotDate})` })
      .from(spotifyTopItemSnapshots)
      .where(eq(spotifyTopItemSnapshots.userId, userId));
    const top = await db
      .select({ id: spotifyTopTrackSnapshotItems.trackId })
      .from(spotifyTopTrackSnapshotItems)
      .innerJoin(
        spotifyTopItemSnapshots,
        eq(spotifyTopItemSnapshots.id, spotifyTopTrackSnapshotItems.snapshotId),
      )
      .leftJoin(
        trackAudioFeatures,
        and(
          eq(trackAudioFeatures.trackId, spotifyTopTrackSnapshotItems.trackId),
          eq(trackAudioFeatures.provider, RECCOBEATS_PROVIDER),
        ),
      )
      .where(
        and(
          eq(spotifyTopItemSnapshots.userId, userId),
          eq(spotifyTopItemSnapshots.snapshotDate, latestDate),
          eligible,
        ),
      )
      .orderBy(asc(spotifyTopTrackSnapshotItems.rank), asc(spotifyTopTrackSnapshotItems.trackId))
      .limit(limit);
    const saved = await db
      .select({ id: userSavedTracks.trackId })
      .from(userSavedTracks)
      .leftJoin(
        trackAudioFeatures,
        and(
          eq(trackAudioFeatures.trackId, userSavedTracks.trackId),
          eq(trackAudioFeatures.provider, RECCOBEATS_PROVIDER),
        ),
      )
      .where(and(eq(userSavedTracks.userId, userId), eligible))
      .orderBy(desc(userSavedTracks.savedAt), asc(userSavedTracks.trackId))
      .limit(limit);
    const olderHistory = await db
      .select({ id: spotifyPlayHistory.trackId })
      .from(spotifyPlayHistory)
      .leftJoin(
        trackAudioFeatures,
        and(
          eq(trackAudioFeatures.trackId, spotifyPlayHistory.trackId),
          eq(trackAudioFeatures.provider, RECCOBEATS_PROVIDER),
        ),
      )
      .where(
        and(
          eq(spotifyPlayHistory.userId, userId),
          lt(spotifyPlayHistory.playedAt, recentSince),
          eligible,
        ),
      )
      .groupBy(spotifyPlayHistory.trackId)
      .orderBy(desc(sql`max(${spotifyPlayHistory.playedAt})`), asc(spotifyPlayHistory.trackId))
      .limit(limit);
    return prioritizeCandidateTrackIds([recent, top, saved, olderHistory], limit);
  });
}

export interface AudioProfileSummary {
  candidates: number;
  enriched: number;
  notFound: number;
  remaining: number;
  coveragePercentage: number;
  library: {
    total: number;
    enriched: number;
    averageTempo: number | null;
    averageEnergy: number | null;
    averageValence: number | null;
    averageDanceability: number | null;
    averageAcousticness: number | null;
    averageInstrumentalness: number | null;
    tempoBuckets: Array<{ label: string; count: number }>;
  };
  listening: {
    totalEvents: number;
    enrichedEvents: number;
    uniqueEnrichedTracks: number;
    coverageDays: number;
    averageTempo: number | null;
    averageEnergy: number | null;
    averageValence: number | null;
    averageDanceability: number | null;
  };
  lastRun: { status: string; resultCode: string | null; retryAfterSeconds: number | null } | null;
}
const numberOrNull = (value: unknown) =>
  value === null || value === undefined ? null : Number(value);
export async function getAudioProfileSummary(
  userId: string,
  now = new Date(),
): Promise<AudioProfileSummary> {
  return withDatabase(async (db) => {
    const [counts] = await db
      .select({
        candidates: sql<number>`count(distinct candidate.track_id)::int`,
        enriched: sql<number>`count(distinct candidate.track_id) filter (where ${trackAudioFeatures.status} = 'available')::int`,
        notFound: sql<number>`count(distinct candidate.track_id) filter (where ${trackAudioFeatures.status} = 'not_found')::int`,
      })
      .from(
        sql`(select track_id from ${userSavedTracks} where user_id=${userId} union select track_id from ${spotifyPlayHistory} where user_id=${userId} union select i.track_id from ${spotifyTopTrackSnapshotItems} i join ${spotifyTopItemSnapshots} s on s.id=i.snapshot_id where s.user_id=${userId}) candidate`,
      )
      .leftJoin(
        trackAudioFeatures,
        and(
          eq(trackAudioFeatures.trackId, sql`candidate.track_id`),
          eq(trackAudioFeatures.provider, RECCOBEATS_PROVIDER),
        ),
      );
    const [library] = await db
      .select({
        total: sql<number>`count(*)::int`,
        enriched: sql<number>`count(*) filter (where ${trackAudioFeatures.status}='available')::int`,
        averageTempo: sql<
          number | null
        >`avg(${trackAudioFeatures.tempo}) filter (where ${trackAudioFeatures.status}='available')`,
        averageEnergy: sql<
          number | null
        >`avg(${trackAudioFeatures.energy}) filter (where ${trackAudioFeatures.status}='available')`,
        averageValence: sql<
          number | null
        >`avg(${trackAudioFeatures.valence}) filter (where ${trackAudioFeatures.status}='available')`,
        averageDanceability: sql<
          number | null
        >`avg(${trackAudioFeatures.danceability}) filter (where ${trackAudioFeatures.status}='available')`,
        averageAcousticness: sql<
          number | null
        >`avg(${trackAudioFeatures.acousticness}) filter (where ${trackAudioFeatures.status}='available')`,
        averageInstrumentalness: sql<
          number | null
        >`avg(${trackAudioFeatures.instrumentalness}) filter (where ${trackAudioFeatures.status}='available')`,
        under90: sql<number>`count(*) filter (where ${trackAudioFeatures.status}='available' and ${trackAudioFeatures.tempo}<90)::int`,
        ninety119: sql<number>`count(*) filter (where ${trackAudioFeatures.status}='available' and ${trackAudioFeatures.tempo}>=90 and ${trackAudioFeatures.tempo}<120)::int`,
        oneTwenty139: sql<number>`count(*) filter (where ${trackAudioFeatures.status}='available' and ${trackAudioFeatures.tempo}>=120 and ${trackAudioFeatures.tempo}<140)::int`,
        over140: sql<number>`count(*) filter (where ${trackAudioFeatures.status}='available' and ${trackAudioFeatures.tempo}>=140)::int`,
      })
      .from(userSavedTracks)
      .leftJoin(
        trackAudioFeatures,
        and(
          eq(trackAudioFeatures.trackId, userSavedTracks.trackId),
          eq(trackAudioFeatures.provider, RECCOBEATS_PROVIDER),
        ),
      )
      .where(eq(userSavedTracks.userId, userId));
    const since = new Date(now.getTime() - 7 * 86_400_000);
    const [listening] = await db
      .select({
        totalEvents: sql<number>`count(*)::int`,
        enrichedEvents: sql<number>`count(*) filter (where ${trackAudioFeatures.status}='available')::int`,
        uniqueEnrichedTracks: sql<number>`count(distinct ${spotifyPlayHistory.trackId}) filter (where ${trackAudioFeatures.status}='available')::int`,
        earliest: sql<Date | null>`min(${spotifyPlayHistory.playedAt})`.mapWith(
          spotifyPlayHistory.playedAt,
        ),
        averageTempo: sql<
          number | null
        >`avg(${trackAudioFeatures.tempo}) filter (where ${trackAudioFeatures.status}='available')`,
        averageEnergy: sql<
          number | null
        >`avg(${trackAudioFeatures.energy}) filter (where ${trackAudioFeatures.status}='available')`,
        averageValence: sql<
          number | null
        >`avg(${trackAudioFeatures.valence}) filter (where ${trackAudioFeatures.status}='available')`,
        averageDanceability: sql<
          number | null
        >`avg(${trackAudioFeatures.danceability}) filter (where ${trackAudioFeatures.status}='available')`,
      })
      .from(spotifyPlayHistory)
      .leftJoin(
        trackAudioFeatures,
        and(
          eq(trackAudioFeatures.trackId, spotifyPlayHistory.trackId),
          eq(trackAudioFeatures.provider, RECCOBEATS_PROVIDER),
        ),
      )
      .where(and(eq(spotifyPlayHistory.userId, userId), gte(spotifyPlayHistory.playedAt, since)));
    const [lastRun] = await db
      .select({
        status: trackEnrichmentRuns.status,
        resultCode: trackEnrichmentRuns.resultCode,
        retryAfterSeconds: trackEnrichmentRuns.retryAfterSeconds,
      })
      .from(trackEnrichmentRuns)
      .where(eq(trackEnrichmentRuns.userId, userId))
      .orderBy(desc(trackEnrichmentRuns.startedAt))
      .limit(1);
    const candidates = Number(counts?.candidates ?? 0),
      enriched = Number(counts?.enriched ?? 0),
      notFound = Number(counts?.notFound ?? 0);
    return {
      candidates,
      enriched,
      notFound,
      remaining: Math.max(0, candidates - enriched - notFound),
      coveragePercentage: candidates ? (enriched / candidates) * 100 : 0,
      library: {
        total: Number(library?.total ?? 0),
        enriched: Number(library?.enriched ?? 0),
        averageTempo: numberOrNull(library?.averageTempo),
        averageEnergy: numberOrNull(library?.averageEnergy),
        averageValence: numberOrNull(library?.averageValence),
        averageDanceability: numberOrNull(library?.averageDanceability),
        averageAcousticness: numberOrNull(library?.averageAcousticness),
        averageInstrumentalness: numberOrNull(library?.averageInstrumentalness),
        tempoBuckets: [
          { label: '< 90 BPM', count: Number(library?.under90 ?? 0) },
          { label: '90–119 BPM', count: Number(library?.ninety119 ?? 0) },
          { label: '120–139 BPM', count: Number(library?.oneTwenty139 ?? 0) },
          { label: '140+ BPM', count: Number(library?.over140 ?? 0) },
        ],
      },
      listening: {
        totalEvents: Number(listening?.totalEvents ?? 0),
        enrichedEvents: Number(listening?.enrichedEvents ?? 0),
        uniqueEnrichedTracks: Number(listening?.uniqueEnrichedTracks ?? 0),
        coverageDays: listening?.earliest
          ? Math.min(
              7,
              Math.max(1, Math.ceil((now.getTime() - listening.earliest.getTime()) / 86_400_000)),
            )
          : 0,
        averageTempo: numberOrNull(listening?.averageTempo),
        averageEnergy: numberOrNull(listening?.averageEnergy),
        averageValence: numberOrNull(listening?.averageValence),
        averageDanceability: numberOrNull(listening?.averageDanceability),
      },
      lastRun: lastRun ?? null,
    };
  });
}

const filterSchema = z
  .object({
    tempoMin: z.number().finite().nonnegative().optional(),
    tempoMax: z.number().finite().nonnegative().optional(),
    energyMin: z.number().finite().min(0).max(1).optional(),
    energyMax: z.number().finite().min(0).max(1).optional(),
    valenceMin: z.number().finite().min(0).max(1).optional(),
    valenceMax: z.number().finite().min(0).max(1).optional(),
    danceabilityMin: z.number().finite().min(0).max(1).optional(),
    danceabilityMax: z.number().finite().min(0).max(1).optional(),
    acousticnessMin: z.number().finite().min(0).max(1).optional(),
    acousticnessMax: z.number().finite().min(0).max(1).optional(),
    instrumentalnessMin: z.number().finite().min(0).max(1).optional(),
    instrumentalnessMax: z.number().finite().min(0).max(1).optional(),
    limit: z.number().int().min(1).max(100),
  })
  .strict();
export async function selectSavedTracksByAudioFeatures(
  userId: string,
  input: z.input<typeof filterSchema>,
) {
  const filters = filterSchema.parse(input);
  const conditions = [
    eq(userSavedTracks.userId, userId),
    eq(trackAudioFeatures.provider, RECCOBEATS_PROVIDER),
    eq(trackAudioFeatures.status, 'available'),
  ];
  for (const [key, column] of [
    ['tempo', trackAudioFeatures.tempo],
    ['energy', trackAudioFeatures.energy],
    ['valence', trackAudioFeatures.valence],
    ['danceability', trackAudioFeatures.danceability],
    ['acousticness', trackAudioFeatures.acousticness],
    ['instrumentalness', trackAudioFeatures.instrumentalness],
  ] as const) {
    const min = filters[`${key}Min`],
      max = filters[`${key}Max`];
    if (min !== undefined) conditions.push(gte(column, min));
    if (max !== undefined) conditions.push(lte(column, max));
  }
  return withDatabase((db) =>
    db
      .select({
        trackId: spotifyTracks.id,
        name: spotifyTracks.name,
        tempo: trackAudioFeatures.tempo,
        energy: trackAudioFeatures.energy,
        valence: trackAudioFeatures.valence,
        danceability: trackAudioFeatures.danceability,
      })
      .from(userSavedTracks)
      .innerJoin(spotifyTracks, eq(spotifyTracks.id, userSavedTracks.trackId))
      .innerJoin(trackAudioFeatures, eq(trackAudioFeatures.trackId, userSavedTracks.trackId))
      .where(and(...conditions))
      .orderBy(asc(spotifyTracks.name), asc(spotifyTracks.id))
      .limit(filters.limit),
  );
}
