import 'server-only';

import { asc, desc, eq, inArray, sql } from 'drizzle-orm';

import { hasRequiredSpotifyAuthorizationScopes } from '@/lib/auth/oauth';
import { withDatabase } from '@/lib/db/client';
import {
  spotifyArtists,
  spotifyConnections,
  spotifyListeningSyncs,
  spotifyPlayHistory,
  spotifyTopArtistSnapshotItems,
  spotifyTopTrackSnapshotItems,
  spotifyTracks,
  users,
} from '@/lib/db/schema';
import {
  calculateRecordedMomentum,
  calculateRecordedShare,
  calculateListeningFreshness,
  calculateRotationIntelligence,
  collectRotationSignals,
  type EvidenceLevel,
  type ListeningFreshnessState,
  type RecordedMomentum,
  type RotationExplanation,
  type RotationScoreComponent,
} from '@/lib/intelligence';
import type { SpotifyTopTimeRange } from '@/types/spotify';

export interface ListeningPulsePeriod {
  recordedPlayCount: number;
  distinctTracks: number;
  distinctArtists: number;
}

export interface CurrentRotationTrack {
  trackId: string;
  trackName: string;
  spotifyUrl: string;
  albumId: string;
  albumName: string;
  albumImageUrl: string | null;
  artistIds: string[];
  artistNames: string[];
  rotationScore: number;
  scoreComponents: RotationScoreComponent[];
  evidenceLevel: EvidenceLevel;
  explanation: RotationExplanation | null;
  current7RecordedCount: number;
  current30RecordedCount: number;
  latestRecordedPlayAt: string;
}

export interface ListeningInsights {
  authorizationRequired: boolean;
  sync: {
    status: 'never_synced' | 'running' | 'completed' | 'failed';
    resultCode: string | null;
    failureCode: string | null;
    processedPlayCount: number;
    completedAt: string | null;
  };
  summary: {
    totalRecordedPlays: number;
    distinctTracks: number;
    distinctArtists: number;
    earliestPlayedAt: string | null;
    latestPlayedAt: string | null;
  };
  pulse: {
    current7: ListeningPulsePeriod;
    current30: ListeningPulsePeriod;
    coverageStartedAt: string | null;
    repeatIntensity: number | null;
    topTrackConcentration: number | null;
    topArtistConcentration: number | null;
  };
  freshness: {
    latestSuccessfulListeningSyncAt: string | null;
    state: ListeningFreshnessState;
  };
  currentRotation: CurrentRotationTrack[];
  momentum: RecordedMomentum;
  recentPlays: Array<{ trackId: string; trackName: string; playedAt: string }>;
  affinity: Array<{
    timeRange: SpotifyTopTimeRange;
    capturedAt: string;
    tracks: Array<{ id: string; name: string; rank: number }>;
    artists: Array<{ id: string; name: string; rank: number }>;
  }>;
}

interface PulseRow {
  total_recorded_plays: number | string;
  total_distinct_tracks: number | string;
  total_distinct_artists: number | string;
  coverage_started_at: Date | string | null;
  latest_played_at: Date | string | null;
  current_7_recorded_count: number | string;
  current_7_distinct_tracks: number | string;
  current_7_distinct_artists: number | string;
  current_30_recorded_count: number | string;
  current_30_distinct_tracks: number | string;
  current_30_distinct_artists: number | string;
  repeated_track_event_count: number | string;
  top_five_track_event_count: number | string;
  top_five_primary_artist_event_count: number | string;
  latest_successful_listening_sync_at: Date | string | null;
}

interface RotationRow {
  track_id: string;
  track_name: string;
  spotify_url: string;
  album_id: string;
  album_name: string;
  album_image_url: string | null;
  artist_ids: unknown;
  artist_names: unknown;
  recorded_play_count_7d: number | string;
  recorded_play_count_30d: number | string;
  active_recorded_days_30d: number | string;
  latest_recorded_play_at: Date | string;
  rotation_score: number | string;
}

interface MomentumRow {
  artist_id: string;
  artist_name: string;
  current_7_recorded_count: number | string;
  previous_7_recorded_count: number | string;
}

const ranges: SpotifyTopTimeRange[] = ['short_term', 'medium_term', 'long_term'];
const emptySync = {
  status: 'never_synced' as const,
  resultCode: null,
  failureCode: null,
  processedPlayCount: 0,
  completedAt: null,
};
const emptyPeriod: ListeningPulsePeriod = {
  recordedPlayCount: 0,
  distinctTracks: 0,
  distinctArtists: 0,
};
const emptySummary = {
  totalRecordedPlays: 0,
  distinctTracks: 0,
  distinctArtists: 0,
  earliestPlayedAt: null,
  latestPlayedAt: null,
};

function emptyInsights(authorizationRequired: boolean): ListeningInsights {
  return {
    authorizationRequired,
    sync: emptySync,
    summary: emptySummary,
    pulse: {
      current7: emptyPeriod,
      current30: emptyPeriod,
      coverageStartedAt: null,
      repeatIntensity: null,
      topTrackConcentration: null,
      topArtistConcentration: null,
    },
    freshness: {
      latestSuccessfulListeningSyncAt: null,
      state: 'never_synced',
    },
    currentRotation: [],
    momentum: { state: 'insufficient_coverage', increased: [], decreased: [] },
    recentPlays: [],
    affinity: [],
  };
}

function date(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function iso(value: Date | string): string {
  return date(value).toISOString();
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function resultRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === 'object' && 'rows' in result)
    return (result as { rows: T[] }).rows;
  return [];
}

/**
 * One typed anchor defines [now-7d, now), [now-14d, now-7d), and [now-30d, now).
 * The bounded window is reduced in PostgreSQL; raw history is never returned to Node.
 */
export function buildListeningWindowCtes(userId: string, now: Date) {
  return sql`
    with time_anchor as (
      select ${now}::timestamptz as now_at
    ), recorded_coverage as (
      select min(played_at) as coverage_started_at, max(played_at) as latest_played_at
      from spotify_play_history
      where user_id = ${userId}
    ), latest_successful_listening_sync as (
      select completed_at
      from spotify_listening_syncs
      where user_id = ${userId}
        and status = 'completed'
        and completed_at is not null
      order by completed_at desc, started_at desc, id desc
      limit 1
    ), windowed_plays as (
      select history.track_id, history.played_at
      from spotify_play_history history
      cross join time_anchor anchor
      where history.user_id = ${userId}
        and history.played_at >= anchor.now_at - interval '30 days'
        and history.played_at < anchor.now_at
    ), track_window_counts as (
      select plays.track_id,
        count(*) filter (
          where plays.played_at >= anchor.now_at - interval '7 days'
            and plays.played_at < anchor.now_at
        )::int as recorded_play_count_7d,
        count(*)::int as recorded_play_count_30d,
        count(distinct (plays.played_at at time zone 'UTC')::date)::int
          as active_recorded_days_30d,
        max(plays.played_at) as latest_recorded_play_at
      from windowed_plays plays
      cross join time_anchor anchor
      group by plays.track_id, anchor.now_at
    ), primary_artist_window_counts as (
      select track_artist.artist_id,
        count(*) filter (
          where plays.played_at >= anchor.now_at - interval '7 days'
            and plays.played_at < anchor.now_at
        )::int as current_7_recorded_count,
        count(*) filter (
          where plays.played_at >= anchor.now_at - interval '14 days'
            and plays.played_at < anchor.now_at - interval '7 days'
        )::int as previous_7_recorded_count,
        count(*)::int as current_30_recorded_count
      from windowed_plays plays
      join spotify_track_artists track_artist
        on track_artist.track_id = plays.track_id and track_artist.position = 0
      cross join time_anchor anchor
      group by track_artist.artist_id, anchor.now_at
    )`;
}

function rotationRecencySql() {
  return sql`case
    when elapsed_days <= 0 then 55
    when elapsed_days <= 1 then round(55 + elapsed_days * (52 - 55))::int
    when elapsed_days <= 3 then round(52 + (elapsed_days - 1) * (46 - 52) / 2)::int
    when elapsed_days <= 7 then round(46 + (elapsed_days - 3) * (36 - 46) / 4)::int
    when elapsed_days <= 14 then round(36 + (elapsed_days - 7) * (24 - 36) / 7)::int
    when elapsed_days <= 30 then round(24 + (elapsed_days - 14) * (0 - 24) / 16)::int
    else 0 end`;
}

function rotationFrequency30Sql() {
  return sql`case
    when recorded_play_count_30d <= 0 then 0
    when recorded_play_count_30d = 1 then 5
    when recorded_play_count_30d = 2 then 9
    when recorded_play_count_30d = 3 then 12
    when recorded_play_count_30d <= 5 then round(12 + (recorded_play_count_30d - 3) * 4.0 / 2)::int
    when recorded_play_count_30d <= 8 then round(16 + (recorded_play_count_30d - 5) * 4.0 / 3)::int
    when recorded_play_count_30d <= 12 then round(20 + (recorded_play_count_30d - 8) * 5.0 / 4)::int
    else 25 end`;
}

function rotationFrequency7Sql() {
  return sql`case
    when recorded_play_count_7d <= 0 then 0
    when recorded_play_count_7d = 1 then 5
    when recorded_play_count_7d = 2 then 9
    when recorded_play_count_7d = 3 then 12
    when recorded_play_count_7d <= 5 then round(12 + (recorded_play_count_7d - 3) * 4.0 / 2)::int
    when recorded_play_count_7d <= 8 then round(16 + (recorded_play_count_7d - 5) * 4.0 / 3)::int
    else 20 end`;
}

export function buildCurrentRotationQuery(userId: string, now: Date) {
  return sql`
    ${buildListeningWindowCtes(userId, now)}, rotation_elapsed as (
      select counts.*,
        greatest(0, extract(epoch from (anchor.now_at - counts.latest_recorded_play_at)) / 86400)
          as elapsed_days
      from track_window_counts counts
      cross join time_anchor anchor
    ), rotation_components as (
      select elapsed.*,
        ${rotationRecencySql()} as recency_component,
        ${rotationFrequency30Sql()} as frequency_30d_component,
        ${rotationFrequency7Sql()} as frequency_7d_component
      from rotation_elapsed elapsed
    ), rotation_scored as (
      select components.*,
        greatest(0, least(100,
          recency_component + frequency_30d_component + frequency_7d_component
        ))::int as rotation_score
      from rotation_components components
    ), ranked_rotation as (
      select * from rotation_scored
      order by rotation_score desc, recorded_play_count_7d desc,
        recorded_play_count_30d desc, latest_recorded_play_at desc, track_id asc
      limit 10
    )
    select track.id as track_id, track.name as track_name, track.spotify_url,
      album.id as album_id, album.name as album_name, album.image_url as album_image_url,
      jsonb_agg(artist.id order by track_artist.position) as artist_ids,
      jsonb_agg(artist.name order by track_artist.position) as artist_names,
      rotation.recorded_play_count_7d, rotation.recorded_play_count_30d,
      rotation.active_recorded_days_30d, rotation.latest_recorded_play_at,
      rotation.rotation_score
    from ranked_rotation rotation
    join spotify_tracks track on track.id = rotation.track_id
    join spotify_albums album on album.id = track.album_id
    join spotify_track_artists track_artist on track_artist.track_id = track.id
    join spotify_artists artist on artist.id = track_artist.artist_id
    group by track.id, track.name, track.spotify_url, album.id, album.name, album.image_url,
      rotation.rotation_score, rotation.recorded_play_count_7d,
      rotation.recorded_play_count_30d, rotation.active_recorded_days_30d,
      rotation.latest_recorded_play_at
    order by rotation.rotation_score desc, rotation.recorded_play_count_7d desc,
      rotation.recorded_play_count_30d desc, rotation.latest_recorded_play_at desc, track.id asc
  `;
}

export function buildListeningPulseQuery(userId: string, now: Date) {
  return sql`
    ${buildListeningWindowCtes(userId, now)}, top_five_tracks as (
      select recorded_play_count_30d
      from track_window_counts
      order by recorded_play_count_30d desc, track_id asc
      limit 5
    ), top_five_primary_artists as (
      select current_30_recorded_count
      from primary_artist_window_counts
      order by current_30_recorded_count desc, artist_id asc
      limit 5
    )
    select
      (select count(*)::int from spotify_play_history where user_id = ${userId})
        as total_recorded_plays,
      (select count(distinct track_id)::int from spotify_play_history where user_id = ${userId})
        as total_distinct_tracks,
      (select count(distinct track_artist.artist_id)::int
        from spotify_play_history history
        join spotify_track_artists track_artist on track_artist.track_id = history.track_id
        where history.user_id = ${userId}) as total_distinct_artists,
      coverage.coverage_started_at, coverage.latest_played_at,
      (select count(*)::int from windowed_plays plays cross join time_anchor anchor
        where plays.played_at >= anchor.now_at - interval '7 days'
          and plays.played_at < anchor.now_at) as current_7_recorded_count,
      (select count(distinct plays.track_id)::int from windowed_plays plays
        cross join time_anchor anchor
        where plays.played_at >= anchor.now_at - interval '7 days'
          and plays.played_at < anchor.now_at) as current_7_distinct_tracks,
      (select count(distinct track_artist.artist_id)::int
        from windowed_plays plays
        join spotify_track_artists track_artist on track_artist.track_id = plays.track_id
        cross join time_anchor anchor
        where plays.played_at >= anchor.now_at - interval '7 days'
          and plays.played_at < anchor.now_at) as current_7_distinct_artists,
      (select count(*)::int from windowed_plays) as current_30_recorded_count,
      (select count(distinct track_id)::int from windowed_plays) as current_30_distinct_tracks,
      (select count(distinct track_artist.artist_id)::int
        from windowed_plays plays
        join spotify_track_artists track_artist on track_artist.track_id = plays.track_id)
          as current_30_distinct_artists,
      (select coalesce(sum(recorded_play_count_30d)
        filter (where recorded_play_count_30d >= 2), 0)::int from track_window_counts)
          as repeated_track_event_count,
      (select coalesce(sum(recorded_play_count_30d), 0)::int from top_five_tracks)
        as top_five_track_event_count,
      (select coalesce(sum(current_30_recorded_count), 0)::int from top_five_primary_artists)
        as top_five_primary_artist_event_count,
      (select completed_at from latest_successful_listening_sync)
        as latest_successful_listening_sync_at
    from recorded_coverage coverage
  `;
}

export function buildRecordedMomentumQuery(userId: string, now: Date) {
  return sql`
    ${buildListeningWindowCtes(userId, now)}, artist_changes as (
      select counts.artist_id, artist.name as artist_name,
        counts.current_7_recorded_count, counts.previous_7_recorded_count,
        counts.current_7_recorded_count - counts.previous_7_recorded_count as delta
      from primary_artist_window_counts counts
      join spotify_artists artist on artist.id = counts.artist_id
    ), increased as (
      select * from artist_changes
      where delta >= 2
      order by delta desc, current_7_recorded_count desc, artist_id asc
      limit 5
    ), decreased as (
      select * from artist_changes
      where delta <= -2 and previous_7_recorded_count >= 2
      order by delta asc, previous_7_recorded_count desc, artist_id asc
      limit 5
    )
    select artist_id, artist_name, current_7_recorded_count, previous_7_recorded_count
    from increased
    union all
    select artist_id, artist_name, current_7_recorded_count, previous_7_recorded_count
    from decreased
  `;
}

export async function getListeningInsights(
  spotifyAccountId: string,
  now = new Date(),
): Promise<ListeningInsights> {
  return withDatabase(async (database) => {
    const [identity] = await database
      .select({ userId: users.id, scopes: spotifyConnections.scopes })
      .from(users)
      .innerJoin(spotifyConnections, eq(spotifyConnections.userId, users.id))
      .where(eq(users.spotifyAccountId, spotifyAccountId))
      .limit(1);
    if (!identity || !hasRequiredSpotifyAuthorizationScopes(identity.scopes))
      return emptyInsights(true);

    const userId = identity.userId;
    const [sync] = await database
      .select()
      .from(spotifyListeningSyncs)
      .where(eq(spotifyListeningSyncs.userId, userId))
      .orderBy(desc(spotifyListeningSyncs.startedAt))
      .limit(1);

    const pulseResult = await database.execute(buildListeningPulseQuery(userId, now));
    const pulseRow = resultRows<PulseRow>(pulseResult)[0];
    if (!pulseRow) return emptyInsights(false);

    const current30RecordedCount = Number(pulseRow.current_30_recorded_count);
    const coverageStartedAt = pulseRow.coverage_started_at
      ? date(pulseRow.coverage_started_at)
      : null;
    const latestSuccessfulListeningSyncAt = pulseRow.latest_successful_listening_sync_at
      ? date(pulseRow.latest_successful_listening_sync_at)
      : null;
    const freshnessState = calculateListeningFreshness(latestSuccessfulListeningSyncAt, now);
    const rotationResult = await database.execute(buildCurrentRotationQuery(userId, now));
    const currentRotation = resultRows<RotationRow>(rotationResult).map((row) => {
      const latestRecordedPlayAt = date(row.latest_recorded_play_at);
      const signals = collectRotationSignals({
        latestRecordedPlayAt,
        recordedPlayCount7d: Number(row.recorded_play_count_7d),
        recordedPlayCount30d: Number(row.recorded_play_count_30d),
        activeRecordedDays30d: Number(row.active_recorded_days_30d),
        recordedCoverageStartedAt: coverageStartedAt,
      });
      const intelligence = calculateRotationIntelligence(signals, now);
      return {
        trackId: row.track_id,
        trackName: row.track_name,
        spotifyUrl: row.spotify_url,
        albumId: row.album_id,
        albumName: row.album_name,
        albumImageUrl: row.album_image_url,
        artistIds: strings(row.artist_ids),
        artistNames: strings(row.artist_names),
        rotationScore: intelligence.rotationScore,
        scoreComponents: intelligence.scoreComponents,
        evidenceLevel: intelligence.evidenceLevel,
        explanation: intelligence.explanation,
        current7RecordedCount: signals.recordedPlayCount7d,
        current30RecordedCount: signals.recordedPlayCount30d,
        latestRecordedPlayAt: latestRecordedPlayAt.toISOString(),
      } satisfies CurrentRotationTrack;
    });

    const momentumResult = await database.execute(buildRecordedMomentumQuery(userId, now));
    const momentum = calculateRecordedMomentum(
      resultRows<MomentumRow>(momentumResult).map((row) => ({
        artistId: row.artist_id,
        artistName: row.artist_name,
        current7RecordedCount: Number(row.current_7_recorded_count),
        previous7RecordedCount: Number(row.previous_7_recorded_count),
      })),
      coverageStartedAt,
      freshnessState,
      now,
    );

    const recentPlays = await database
      .select({
        trackId: spotifyTracks.id,
        trackName: spotifyTracks.name,
        playedAt: spotifyPlayHistory.playedAt,
      })
      .from(spotifyPlayHistory)
      .innerJoin(spotifyTracks, eq(spotifyTracks.id, spotifyPlayHistory.trackId))
      .where(eq(spotifyPlayHistory.userId, userId))
      .orderBy(desc(spotifyPlayHistory.playedAt), asc(spotifyTracks.id))
      .limit(10);

    const snapshotResult = await database.execute(sql`
      select distinct on (time_range) id, time_range, captured_at
      from spotify_top_item_snapshots
      where user_id = ${userId}
      order by time_range, snapshot_date desc, captured_at desc, id desc
    `);
    const latest = resultRows<{
      id: string;
      time_range: string;
      captured_at: Date | string;
    }>(snapshotResult).filter((row) => ranges.includes(row.time_range as SpotifyTopTimeRange));
    const snapshotIds = latest.map((row) => row.id);
    const trackItems = snapshotIds.length
      ? await database
          .select({
            snapshotId: spotifyTopTrackSnapshotItems.snapshotId,
            id: spotifyTracks.id,
            name: spotifyTracks.name,
            rank: spotifyTopTrackSnapshotItems.rank,
          })
          .from(spotifyTopTrackSnapshotItems)
          .innerJoin(spotifyTracks, eq(spotifyTracks.id, spotifyTopTrackSnapshotItems.trackId))
          .where(inArray(spotifyTopTrackSnapshotItems.snapshotId, snapshotIds))
          .orderBy(asc(spotifyTopTrackSnapshotItems.rank))
      : [];
    const artistItems = snapshotIds.length
      ? await database
          .select({
            snapshotId: spotifyTopArtistSnapshotItems.snapshotId,
            id: spotifyArtists.id,
            name: spotifyArtists.name,
            rank: spotifyTopArtistSnapshotItems.rank,
          })
          .from(spotifyTopArtistSnapshotItems)
          .innerJoin(spotifyArtists, eq(spotifyArtists.id, spotifyTopArtistSnapshotItems.artistId))
          .where(inArray(spotifyTopArtistSnapshotItems.snapshotId, snapshotIds))
          .orderBy(asc(spotifyTopArtistSnapshotItems.rank))
      : [];

    return {
      authorizationRequired: false,
      sync: sync
        ? {
            status: sync.status as 'running' | 'completed' | 'failed',
            resultCode: sync.resultCode,
            failureCode: sync.failureCode,
            processedPlayCount: sync.processedPlayCount,
            completedAt: sync.completedAt?.toISOString() ?? null,
          }
        : emptySync,
      summary: {
        totalRecordedPlays: Number(pulseRow.total_recorded_plays),
        distinctTracks: Number(pulseRow.total_distinct_tracks),
        distinctArtists: Number(pulseRow.total_distinct_artists),
        earliestPlayedAt: coverageStartedAt?.toISOString() ?? null,
        latestPlayedAt: pulseRow.latest_played_at ? iso(pulseRow.latest_played_at) : null,
      },
      pulse: {
        current7: {
          recordedPlayCount: Number(pulseRow.current_7_recorded_count),
          distinctTracks: Number(pulseRow.current_7_distinct_tracks),
          distinctArtists: Number(pulseRow.current_7_distinct_artists),
        },
        current30: {
          recordedPlayCount: current30RecordedCount,
          distinctTracks: Number(pulseRow.current_30_distinct_tracks),
          distinctArtists: Number(pulseRow.current_30_distinct_artists),
        },
        coverageStartedAt: coverageStartedAt?.toISOString() ?? null,
        repeatIntensity: calculateRecordedShare(
          Number(pulseRow.repeated_track_event_count),
          current30RecordedCount,
        ),
        topTrackConcentration: calculateRecordedShare(
          Number(pulseRow.top_five_track_event_count),
          current30RecordedCount,
        ),
        topArtistConcentration: calculateRecordedShare(
          Number(pulseRow.top_five_primary_artist_event_count),
          current30RecordedCount,
        ),
      },
      freshness: {
        latestSuccessfulListeningSyncAt: latestSuccessfulListeningSyncAt?.toISOString() ?? null,
        state: freshnessState,
      },
      currentRotation,
      momentum,
      recentPlays: recentPlays.map((play) => ({
        trackId: play.trackId,
        trackName: play.trackName,
        playedAt: play.playedAt.toISOString(),
      })),
      affinity: latest.map((snapshot) => ({
        timeRange: snapshot.time_range as SpotifyTopTimeRange,
        capturedAt: iso(snapshot.captured_at),
        tracks: trackItems
          .filter((item) => item.snapshotId === snapshot.id)
          .map((item) => ({ id: item.id, name: item.name, rank: item.rank })),
        artists: artistItems
          .filter((item) => item.snapshotId === snapshot.id)
          .map((item) => ({ id: item.id, name: item.name, rank: item.rank })),
      })),
    };
  });
}
