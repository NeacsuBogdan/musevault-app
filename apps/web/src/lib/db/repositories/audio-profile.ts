import 'server-only';

import { and, asc, desc, eq, gte, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';

import { withDatabase } from '@/lib/db/client';
import {
  spotifyAlbums,
  spotifyArtists,
  spotifyPlayHistory,
  spotifyTopItemSnapshots,
  spotifyTopTrackSnapshotItems,
  spotifyTrackArtists,
  spotifyTracks,
  trackAudioFeatures,
  trackEnrichmentRuns,
  userSavedTracks,
  users,
} from '@/lib/db/schema';
import {
  buildSoundDistanceReasons,
  calculateSoundProfileCoverage,
  rankClosestToSoundCenter,
  rankSonicOutliers,
  type CompleteBoundedSoundValues,
  type SoundCenter,
  type SoundDistanceReason,
  type SoundProfileCoverage,
} from '@/lib/intelligence';

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

export interface SoundProfileTrack {
  trackId: string;
  trackName: string;
  spotifyUrl: string;
  albumId: string;
  albumName: string;
  albumImageUrl: string | null;
  artistNames: string[];
  soundDistance: number;
  features: CompleteBoundedSoundValues;
  reasons: SoundDistanceReason[];
}

export interface AudioProfileSummary {
  coverage: SoundProfileCoverage;
  soundCenter: SoundCenter;
  soundDistanceEligibleTrackCount: number;
  sonicOutliers: SoundProfileTrack[];
  closestToSoundCenter: SoundProfileTrack[];
  lastRun: { status: string; resultCode: string | null; retryAfterSeconds: number | null } | null;
}

type SoundMetric = keyof CompleteBoundedSoundValues | 'tempo' | 'loudness';

type SoundProfileRow = {
  current_saved_track_count: number | string;
  audio_covered_track_count: number | string;
  sound_distance_eligible_track_count: number | string;
} & Record<`${SoundMetric}_${'p25' | 'p50' | 'p75'}`, number | string | null>;

interface SoundDistanceRow {
  list_type: 'outlier' | 'closest';
  track_id: string;
  track_name: string;
  spotify_url: string;
  album_id: string;
  album_name: string;
  album_image_url: string | null;
  artist_names: unknown;
  sound_distance: number | string;
  acousticness: number | string;
  danceability: number | string;
  energy: number | string;
  instrumentalness: number | string;
  liveness: number | string;
  speechiness: number | string;
  valence: number | string;
}

const numberOrNull = (value: unknown) =>
  value === null || value === undefined ? null : Number(value);

function resultRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === 'object' && 'rows' in result)
    return (result as { rows: T[] }).rows;
  return [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function buildSoundProfileCtes(userId: string) {
  return sql`
    with current_saved as (
      select saved.track_id
      from ${userSavedTracks} saved
      where saved.user_id = ${userId}
    ), covered_saved as (
      select saved.track_id, features.acousticness, features.danceability,
        features.energy, features.instrumentalness, features.liveness,
        features.speechiness, features.valence, features.tempo, features.loudness
      from current_saved saved
      join ${trackAudioFeatures} features
        on features.track_id = saved.track_id
        and features.provider = ${RECCOBEATS_PROVIDER}
        and features.status = 'available'
    )`;
}

/** PostgreSQL reduces the current saved-library intersection to counts and percentiles. */
export function buildSoundProfileQuery(userId: string) {
  return sql`
    ${buildSoundProfileCtes(userId)}, sound_profile as (
      select
        percentile_cont(0.25) within group (order by acousticness)
          filter (where acousticness is not null) as acousticness_p25,
        percentile_cont(0.5) within group (order by acousticness)
          filter (where acousticness is not null) as acousticness_p50,
        percentile_cont(0.75) within group (order by acousticness)
          filter (where acousticness is not null) as acousticness_p75,
        percentile_cont(0.25) within group (order by danceability)
          filter (where danceability is not null) as danceability_p25,
        percentile_cont(0.5) within group (order by danceability)
          filter (where danceability is not null) as danceability_p50,
        percentile_cont(0.75) within group (order by danceability)
          filter (where danceability is not null) as danceability_p75,
        percentile_cont(0.25) within group (order by energy)
          filter (where energy is not null) as energy_p25,
        percentile_cont(0.5) within group (order by energy)
          filter (where energy is not null) as energy_p50,
        percentile_cont(0.75) within group (order by energy)
          filter (where energy is not null) as energy_p75,
        percentile_cont(0.25) within group (order by instrumentalness)
          filter (where instrumentalness is not null) as instrumentalness_p25,
        percentile_cont(0.5) within group (order by instrumentalness)
          filter (where instrumentalness is not null) as instrumentalness_p50,
        percentile_cont(0.75) within group (order by instrumentalness)
          filter (where instrumentalness is not null) as instrumentalness_p75,
        percentile_cont(0.25) within group (order by liveness)
          filter (where liveness is not null) as liveness_p25,
        percentile_cont(0.5) within group (order by liveness)
          filter (where liveness is not null) as liveness_p50,
        percentile_cont(0.75) within group (order by liveness)
          filter (where liveness is not null) as liveness_p75,
        percentile_cont(0.25) within group (order by speechiness)
          filter (where speechiness is not null) as speechiness_p25,
        percentile_cont(0.5) within group (order by speechiness)
          filter (where speechiness is not null) as speechiness_p50,
        percentile_cont(0.75) within group (order by speechiness)
          filter (where speechiness is not null) as speechiness_p75,
        percentile_cont(0.25) within group (order by valence)
          filter (where valence is not null) as valence_p25,
        percentile_cont(0.5) within group (order by valence)
          filter (where valence is not null) as valence_p50,
        percentile_cont(0.75) within group (order by valence)
          filter (where valence is not null) as valence_p75,
        percentile_cont(0.25) within group (order by tempo)
          filter (where tempo is not null) as tempo_p25,
        percentile_cont(0.5) within group (order by tempo)
          filter (where tempo is not null) as tempo_p50,
        percentile_cont(0.75) within group (order by tempo)
          filter (where tempo is not null) as tempo_p75,
        percentile_cont(0.25) within group (order by loudness)
          filter (where loudness is not null) as loudness_p25,
        percentile_cont(0.5) within group (order by loudness)
          filter (where loudness is not null) as loudness_p50,
        percentile_cont(0.75) within group (order by loudness)
          filter (where loudness is not null) as loudness_p75
      from covered_saved
    )
    select
      (select count(*)::int from current_saved) as current_saved_track_count,
      (select count(*)::int from covered_saved) as audio_covered_track_count,
      (select count(*)::int from covered_saved
        where acousticness is not null and danceability is not null and energy is not null
          and instrumentalness is not null and liveness is not null
          and speechiness is not null and valence is not null)
        as sound_distance_eligible_track_count,
      sound_profile.*
    from sound_profile
  `;
}

/** PostgreSQL computes and bounds both deterministic Sound Distance lists. */
export function buildSoundDistanceRankingsQuery(userId: string) {
  return sql`
    ${buildSoundProfileCtes(userId)}, coverage as (
      select count(*)::int as audio_covered_track_count from covered_saved
    ), sound_center as (
      select
        percentile_cont(0.5) within group (order by acousticness)
          filter (where acousticness is not null) as acousticness_p50,
        percentile_cont(0.5) within group (order by danceability)
          filter (where danceability is not null) as danceability_p50,
        percentile_cont(0.5) within group (order by energy)
          filter (where energy is not null) as energy_p50,
        percentile_cont(0.5) within group (order by instrumentalness)
          filter (where instrumentalness is not null) as instrumentalness_p50,
        percentile_cont(0.5) within group (order by liveness)
          filter (where liveness is not null) as liveness_p50,
        percentile_cont(0.5) within group (order by speechiness)
          filter (where speechiness is not null) as speechiness_p50,
        percentile_cont(0.5) within group (order by valence)
          filter (where valence is not null) as valence_p50
      from covered_saved
    ), sound_distances as (
      select covered.*,
        round(greatest(0, least(100, sqrt((
          power(covered.acousticness - center.acousticness_p50, 2) +
          power(covered.danceability - center.danceability_p50, 2) +
          power(covered.energy - center.energy_p50, 2) +
          power(covered.instrumentalness - center.instrumentalness_p50, 2) +
          power(covered.liveness - center.liveness_p50, 2) +
          power(covered.speechiness - center.speechiness_p50, 2) +
          power(covered.valence - center.valence_p50, 2)
        ) / 7.0) * 100)))::int as sound_distance
      from covered_saved covered
      cross join sound_center center
      cross join coverage
      where coverage.audio_covered_track_count >= 20
        and covered.acousticness is not null and covered.danceability is not null
        and covered.energy is not null and covered.instrumentalness is not null
        and covered.liveness is not null and covered.speechiness is not null
        and covered.valence is not null
        and center.acousticness_p50 is not null and center.danceability_p50 is not null
        and center.energy_p50 is not null and center.instrumentalness_p50 is not null
        and center.liveness_p50 is not null and center.speechiness_p50 is not null
        and center.valence_p50 is not null
    ), sonic_outliers as (
      select 'outlier'::text as list_type, 0 as list_order, distances.*
      from sound_distances distances
      order by sound_distance desc, track_id asc
      limit 10
    ), closest_tracks as (
      select 'closest'::text as list_type, 1 as list_order, distances.*
      from sound_distances distances
      order by sound_distance asc, track_id asc
      limit 5
    ), ranked as (
      select * from sonic_outliers
      union all
      select * from closest_tracks
    )
    select ranked.list_type, ranked.track_id, track.name as track_name, track.spotify_url,
      album.id as album_id, album.name as album_name, album.image_url as album_image_url,
      artists.artist_names, ranked.sound_distance, ranked.acousticness, ranked.danceability,
      ranked.energy, ranked.instrumentalness, ranked.liveness, ranked.speechiness,
      ranked.valence
    from ranked
    join ${spotifyTracks} track on track.id = ranked.track_id
    join ${spotifyAlbums} album on album.id = track.album_id
    cross join lateral (
      select jsonb_agg(artist.name order by track_artist.position) as artist_names
      from ${spotifyTrackArtists} track_artist
      join ${spotifyArtists} artist on artist.id = track_artist.artist_id
      where track_artist.track_id = ranked.track_id
    ) artists
    order by ranked.list_order,
      case when ranked.list_type = 'outlier' then ranked.sound_distance end desc,
      case when ranked.list_type = 'closest' then ranked.sound_distance end asc,
      ranked.track_id asc
  `;
}

const soundMetrics: SoundMetric[] = [
  'acousticness',
  'danceability',
  'energy',
  'instrumentalness',
  'liveness',
  'speechiness',
  'valence',
  'tempo',
  'loudness',
];

function toSoundCenter(row: SoundProfileRow | undefined): SoundCenter {
  return Object.fromEntries(
    soundMetrics.map((metric) => [
      metric,
      {
        p25: numberOrNull(row?.[`${metric}_p25`]),
        p50: numberOrNull(row?.[`${metric}_p50`]),
        p75: numberOrNull(row?.[`${metric}_p75`]),
      },
    ]),
  ) as SoundCenter;
}

function toSoundProfileTrack(
  row: SoundDistanceRow,
  center: CompleteBoundedSoundValues,
): SoundProfileTrack {
  const features: CompleteBoundedSoundValues = {
    acousticness: Number(row.acousticness),
    danceability: Number(row.danceability),
    energy: Number(row.energy),
    instrumentalness: Number(row.instrumentalness),
    liveness: Number(row.liveness),
    speechiness: Number(row.speechiness),
    valence: Number(row.valence),
  };
  return {
    trackId: row.track_id,
    trackName: row.track_name,
    spotifyUrl: row.spotify_url,
    albumId: row.album_id,
    albumName: row.album_name,
    albumImageUrl: row.album_image_url,
    artistNames: strings(row.artist_names),
    soundDistance: Number(row.sound_distance),
    features,
    reasons: buildSoundDistanceReasons(features, center),
  };
}

export async function getAudioProfileSummary(userId: string): Promise<AudioProfileSummary> {
  return withDatabase(async (db) => {
    const profileResult = await db.execute(buildSoundProfileQuery(userId));
    const profileRow = resultRows<SoundProfileRow>(profileResult)[0];
    const coverage = calculateSoundProfileCoverage(
      Number(profileRow?.current_saved_track_count ?? 0),
      Number(profileRow?.audio_covered_track_count ?? 0),
    );
    const soundCenter = toSoundCenter(profileRow);
    const centerMedians = {
      acousticness: soundCenter.acousticness.p50,
      danceability: soundCenter.danceability.p50,
      energy: soundCenter.energy.p50,
      instrumentalness: soundCenter.instrumentalness.p50,
      liveness: soundCenter.liveness.p50,
      speechiness: soundCenter.speechiness.p50,
      valence: soundCenter.valence.p50,
    };
    let sonicOutliers: SoundProfileTrack[] = [];
    let closestToSoundCenter: SoundProfileTrack[] = [];
    if (
      coverage.profileAvailability === 'PROFILE_AVAILABLE' &&
      Object.values(centerMedians).every((value) => value !== null)
    ) {
      const rankingResult = await db.execute(buildSoundDistanceRankingsQuery(userId));
      const rankingRows = resultRows<SoundDistanceRow>(rankingResult);
      sonicOutliers = rankSonicOutliers(
        rankingRows
          .filter((row) => row.list_type === 'outlier')
          .map((row) => toSoundProfileTrack(row, centerMedians as CompleteBoundedSoundValues)),
      );
      closestToSoundCenter = rankClosestToSoundCenter(
        rankingRows
          .filter((row) => row.list_type === 'closest')
          .map((row) => toSoundProfileTrack(row, centerMedians as CompleteBoundedSoundValues)),
      );
    }
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
    return {
      coverage,
      soundCenter,
      soundDistanceEligibleTrackCount: Number(profileRow?.sound_distance_eligible_track_count ?? 0),
      sonicOutliers,
      closestToSoundCenter,
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
    const min = filters[`${key}Min`];
    const max = filters[`${key}Max`];
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
