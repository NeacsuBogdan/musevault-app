import 'server-only';

import { sql } from 'drizzle-orm';

import type { Database } from '@/lib/db/client';

import type {
  ArtistMovementItem,
  CurrentLibraryAdditions,
  EvolutionHistorySummary,
  EvolutionPeriodComparison,
  MovementLists,
  SoundPeriodEvidence,
  TrackMovementItem,
} from './contracts';
import {
  buildListeningPeriodMetrics,
  buildListeningShift,
  rankMovement,
  type ListeningPeriodAggregate,
} from './metrics';
import { buildSoundPeriodEvidence } from './sound';

type DatabaseExecutor = Pick<Database, 'execute'>;

interface HistoryRow {
  captured_history_started_at: Date | string | null;
  latest_captured_play_at: Date | string | null;
  latest_successful_listening_sync_at: Date | string | null;
  current_event_count: number | string;
  current_active_day_count: number | string;
  previous_event_count: number | string;
  previous_active_day_count: number | string;
}

interface ListeningRow {
  period: 'current' | 'previous';
  captured_play_count: number | string;
  unique_track_count: number | string;
  unique_artist_count: number | string;
  active_day_count: number | string;
  repeated_track_event_count: number | string;
  top_five_track_event_count: number | string;
  top_five_primary_artist_event_count: number | string;
}

interface TrackMovementRow {
  track_id: string;
  track_name: string;
  primary_artist_name: string | null;
  album_image_url: string | null;
  current_captured_count: number | string;
  previous_captured_count: number | string;
}

interface ArtistMovementRow {
  artist_id: string;
  artist_name: string;
  current_captured_count: number | string;
  previous_captured_count: number | string;
}

interface LibraryAdditionRow {
  period: 'current' | 'previous';
  period_count: number | string;
  track_id: string;
  track_name: string;
  primary_artist_name: string | null;
  album_image_url: string | null;
  saved_at: Date | string;
}

interface SoundRow {
  period: 'current' | 'previous';
  total_captured_events: number | string;
  covered_captured_events: number | string;
  total_unique_captured_tracks: number | string;
  covered_unique_captured_tracks: number | string;
  active_captured_listening_days: number | string;
  acousticness: number | string | null;
  danceability: number | string | null;
  energy: number | string | null;
  instrumentalness: number | string | null;
  liveness: number | string | null;
  speechiness: number | string | null;
  valence: number | string | null;
}

const EMPTY_LISTENING_AGGREGATE: ListeningPeriodAggregate = {
  capturedPlayCount: 0,
  uniqueTrackCount: 0,
  uniqueArtistCount: 0,
  activeDayCount: 0,
  repeatedTrackEventCount: 0,
  topFiveTrackEventCount: 0,
  topFivePrimaryArtistEventCount: 0,
};

export const CURRENT_LIBRARY_ADDITIONS_DISCLOSURE =
  'MuseVault can describe current saved membership by saved timestamp, but does not retain complete historical removal membership yet.';

function resultRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === 'object' && 'rows' in result)
    return (result as { rows: T[] }).rows;
  return [];
}

function number(value: number | string | null | undefined): number {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function date(value: Date | string | null): Date | null {
  return value === null ? null : value instanceof Date ? value : new Date(value);
}

export function buildEvolutionHistoryQuery(userId: string, period: EvolutionPeriodComparison) {
  return sql`
    with latest_successful_sync as (
      select completed_at
      from spotify_listening_syncs
      where user_id = ${userId} and status = 'completed' and completed_at is not null
      order by completed_at desc, started_at desc, id desc
      limit 1
    )
    select
      min(history.played_at) as captured_history_started_at,
      max(history.played_at) as latest_captured_play_at,
      (select completed_at from latest_successful_sync) as latest_successful_listening_sync_at,
      count(*) filter (
        where history.played_at >= ${period.current.start}::timestamptz
          and history.played_at < ${period.current.end}::timestamptz
      )::int as current_event_count,
      count(distinct (history.played_at at time zone 'UTC')::date) filter (
        where history.played_at >= ${period.current.start}::timestamptz
          and history.played_at < ${period.current.end}::timestamptz
      )::int as current_active_day_count,
      count(*) filter (
        where history.played_at >= ${period.previous.start}::timestamptz
          and history.played_at < ${period.previous.end}::timestamptz
      )::int as previous_event_count,
      count(distinct (history.played_at at time zone 'UTC')::date) filter (
        where history.played_at >= ${period.previous.start}::timestamptz
          and history.played_at < ${period.previous.end}::timestamptz
      )::int as previous_active_day_count
    from spotify_play_history history
    where history.user_id = ${userId}
  `;
}

export function buildListeningShiftQuery(userId: string, period: EvolutionPeriodComparison) {
  return sql`
    with comparison_windows as (
      select 'current'::text as period,
        ${period.current.start}::timestamptz as start_at,
        ${period.current.end}::timestamptz as end_at
      union all
      select 'previous'::text as period,
        ${period.previous.start}::timestamptz as start_at,
        ${period.previous.end}::timestamptz as end_at
    ), windowed_plays as (
      select windows.period, history.track_id, history.played_at
      from comparison_windows windows
      join spotify_play_history history
        on history.user_id = ${userId}
        and history.played_at >= windows.start_at
        and history.played_at < windows.end_at
    ), track_counts as (
      select period, track_id, count(*)::int as event_count
      from windowed_plays
      group by period, track_id
    ), ranked_track_counts as (
      select period, track_id, event_count,
        row_number() over (partition by period order by event_count desc, track_id asc) as rank
      from track_counts
    ), track_facts as (
      select period,
        coalesce(sum(event_count) filter (where event_count >= 2), 0)::int
          as repeated_track_event_count,
        coalesce(sum(event_count) filter (where rank <= 5), 0)::int
          as top_five_track_event_count
      from ranked_track_counts
      group by period
    ), credited_artist_facts as (
      select plays.period, count(distinct credit.artist_id)::int as unique_artist_count
      from (select distinct period, track_id from windowed_plays) plays
      join spotify_track_artists credit on credit.track_id = plays.track_id
      group by plays.period
    ), primary_artist_counts as (
      select plays.period, credit.artist_id, count(*)::int as event_count
      from windowed_plays plays
      join spotify_track_artists credit
        on credit.track_id = plays.track_id and credit.position = 0
      group by plays.period, credit.artist_id
    ), ranked_primary_artist_counts as (
      select period, artist_id, event_count,
        row_number() over (partition by period order by event_count desc, artist_id asc) as rank
      from primary_artist_counts
    ), primary_artist_facts as (
      select period,
        coalesce(sum(event_count) filter (where rank <= 5), 0)::int
          as top_five_primary_artist_event_count
      from ranked_primary_artist_counts
      group by period
    ), period_facts as (
      select period, count(*)::int as captured_play_count,
        count(distinct track_id)::int as unique_track_count,
        count(distinct (played_at at time zone 'UTC')::date)::int as active_day_count
      from windowed_plays
      group by period
    )
    select windows.period,
      coalesce(facts.captured_play_count, 0)::int as captured_play_count,
      coalesce(facts.unique_track_count, 0)::int as unique_track_count,
      coalesce(artists.unique_artist_count, 0)::int as unique_artist_count,
      coalesce(facts.active_day_count, 0)::int as active_day_count,
      coalesce(tracks.repeated_track_event_count, 0)::int as repeated_track_event_count,
      coalesce(tracks.top_five_track_event_count, 0)::int as top_five_track_event_count,
      coalesce(primary_artists.top_five_primary_artist_event_count, 0)::int
        as top_five_primary_artist_event_count
    from comparison_windows windows
    left join period_facts facts on facts.period = windows.period
    left join track_facts tracks on tracks.period = windows.period
    left join credited_artist_facts artists on artists.period = windows.period
    left join primary_artist_facts primary_artists on primary_artists.period = windows.period
    order by case when windows.period = 'current' then 0 else 1 end
  `;
}

function buildMovementCountCtes(userId: string, period: EvolutionPeriodComparison) {
  return sql`
    comparison_windows as (
      select 'current'::text as period,
        ${period.current.start}::timestamptz as start_at,
        ${period.current.end}::timestamptz as end_at
      union all
      select 'previous'::text as period,
        ${period.previous.start}::timestamptz as start_at,
        ${period.previous.end}::timestamptz as end_at
    ), windowed_plays as (
      select windows.period, history.track_id
      from comparison_windows windows
      join spotify_play_history history
        on history.user_id = ${userId}
        and history.played_at >= windows.start_at
        and history.played_at < windows.end_at
    ), track_counts as (
      select track_id,
        count(*) filter (where period = 'current')::int as current_captured_count,
        count(*) filter (where period = 'previous')::int as previous_captured_count
      from windowed_plays
      group by track_id
    )`;
}

export function buildTrackMovementQuery(userId: string, period: EvolutionPeriodComparison) {
  return sql`
    with ${buildMovementCountCtes(userId, period)}, movement as (
      select track_id, current_captured_count, previous_captured_count,
        current_captured_count - previous_captured_count as delta
      from track_counts
    ), entering as (
      select track_id from movement
      where current_captured_count > 0 and previous_captured_count = 0
      order by current_captured_count desc, track_id asc
      limit 5
    ), leaving as (
      select track_id from movement
      where current_captured_count = 0 and previous_captured_count > 0
      order by previous_captured_count desc, track_id asc
      limit 5
    ), increased as (
      select track_id from movement
      where current_captured_count > 0 and previous_captured_count > 0 and delta >= 2
      order by delta desc, current_captured_count desc, track_id asc
      limit 5
    ), decreased as (
      select track_id from movement
      where current_captured_count > 0 and previous_captured_count >= 2 and delta <= -2
      order by delta asc, previous_captured_count desc, track_id asc
      limit 5
    ), selected as (
      select track_id from entering
      union all select track_id from leaving
      union all select track_id from increased
      union all select track_id from decreased
    )
    select movement.track_id, track.name as track_name,
      artist.name as primary_artist_name, album.image_url as album_image_url,
      movement.current_captured_count, movement.previous_captured_count
    from selected
    join movement on movement.track_id = selected.track_id
    join spotify_tracks track on track.id = movement.track_id
    join spotify_albums album on album.id = track.album_id
    left join spotify_track_artists credit
      on credit.track_id = track.id and credit.position = 0
    left join spotify_artists artist on artist.id = credit.artist_id
  `;
}

export function buildArtistMovementQuery(userId: string, period: EvolutionPeriodComparison) {
  return sql`
    with comparison_windows as (
      select 'current'::text as period,
        ${period.current.start}::timestamptz as start_at,
        ${period.current.end}::timestamptz as end_at
      union all
      select 'previous'::text as period,
        ${period.previous.start}::timestamptz as start_at,
        ${period.previous.end}::timestamptz as end_at
    ), windowed_primary_artists as (
      select windows.period, credit.artist_id
      from comparison_windows windows
      join spotify_play_history history
        on history.user_id = ${userId}
        and history.played_at >= windows.start_at
        and history.played_at < windows.end_at
      join spotify_track_artists credit
        on credit.track_id = history.track_id and credit.position = 0
    ), artist_counts as (
      select artist_id,
        count(*) filter (where period = 'current')::int as current_captured_count,
        count(*) filter (where period = 'previous')::int as previous_captured_count
      from windowed_primary_artists
      group by artist_id
    ), movement as (
      select artist_id, current_captured_count, previous_captured_count,
        current_captured_count - previous_captured_count as delta
      from artist_counts
    ), entering as (
      select artist_id from movement
      where current_captured_count > 0 and previous_captured_count = 0
      order by current_captured_count desc, artist_id asc
      limit 5
    ), leaving as (
      select artist_id from movement
      where current_captured_count = 0 and previous_captured_count > 0
      order by previous_captured_count desc, artist_id asc
      limit 5
    ), increased as (
      select artist_id from movement
      where current_captured_count > 0 and previous_captured_count > 0 and delta >= 2
      order by delta desc, current_captured_count desc, artist_id asc
      limit 5
    ), decreased as (
      select artist_id from movement
      where current_captured_count > 0 and previous_captured_count >= 2 and delta <= -2
      order by delta asc, previous_captured_count desc, artist_id asc
      limit 5
    ), selected as (
      select artist_id from entering
      union all select artist_id from leaving
      union all select artist_id from increased
      union all select artist_id from decreased
    )
    select movement.artist_id, artist.name as artist_name,
      movement.current_captured_count, movement.previous_captured_count
    from selected
    join movement on movement.artist_id = selected.artist_id
    join spotify_artists artist on artist.id = movement.artist_id
  `;
}

export function buildCurrentLibraryAdditionsQuery(
  userId: string,
  period: EvolutionPeriodComparison,
) {
  return sql`
    with comparison_windows as (
      select 'current'::text as period,
        ${period.current.start}::timestamptz as start_at,
        ${period.current.end}::timestamptz as end_at
      union all
      select 'previous'::text as period,
        ${period.previous.start}::timestamptz as start_at,
        ${period.previous.end}::timestamptz as end_at
    ), ranked as (
      select windows.period, saved.track_id, saved.saved_at,
        count(*) over (partition by windows.period)::int as period_count,
        row_number() over (
          partition by windows.period order by saved.saved_at desc, saved.track_id asc
        ) as rank
      from comparison_windows windows
      join user_saved_tracks saved
        on saved.user_id = ${userId}
        and saved.saved_at >= windows.start_at
        and saved.saved_at < windows.end_at
    )
    select ranked.period, ranked.period_count, ranked.track_id, ranked.saved_at,
      track.name as track_name, artist.name as primary_artist_name,
      album.image_url as album_image_url
    from ranked
    join spotify_tracks track on track.id = ranked.track_id
    join spotify_albums album on album.id = track.album_id
    left join spotify_track_artists credit
      on credit.track_id = track.id and credit.position = 0
    left join spotify_artists artist on artist.id = credit.artist_id
    where ranked.rank <= 5
    order by case when ranked.period = 'current' then 0 else 1 end,
      ranked.saved_at desc, ranked.track_id asc
  `;
}

export function buildCapturedSoundQuery(userId: string, period: EvolutionPeriodComparison) {
  return sql`
    with comparison_windows as (
      select 'current'::text as period,
        ${period.current.start}::timestamptz as start_at,
        ${period.current.end}::timestamptz as end_at
      union all
      select 'previous'::text as period,
        ${period.previous.start}::timestamptz as start_at,
        ${period.previous.end}::timestamptz as end_at
    ), enriched_plays as (
      select windows.period, history.track_id, history.played_at,
        features.acousticness, features.danceability, features.energy,
        features.instrumentalness, features.liveness, features.speechiness, features.valence,
        (features.status = 'available'
          and features.acousticness is not null
          and features.danceability is not null
          and features.energy is not null
          and features.instrumentalness is not null
          and features.liveness is not null
          and features.speechiness is not null
          and features.valence is not null) as covered
      from comparison_windows windows
      join spotify_play_history history
        on history.user_id = ${userId}
        and history.played_at >= windows.start_at
        and history.played_at < windows.end_at
      left join track_audio_features features
        on features.track_id = history.track_id and features.provider = 'reccobeats'
    ), sound_facts as (
      select period,
        count(*)::int as total_captured_events,
        count(*) filter (where covered)::int as covered_captured_events,
        count(distinct track_id)::int as total_unique_captured_tracks,
        count(distinct track_id) filter (where covered)::int as covered_unique_captured_tracks,
        count(distinct (played_at at time zone 'UTC')::date)::int
          as active_captured_listening_days,
        avg(acousticness) filter (where covered) as acousticness,
        avg(danceability) filter (where covered) as danceability,
        avg(energy) filter (where covered) as energy,
        avg(instrumentalness) filter (where covered) as instrumentalness,
        avg(liveness) filter (where covered) as liveness,
        avg(speechiness) filter (where covered) as speechiness,
        avg(valence) filter (where covered) as valence
      from enriched_plays
      group by period
    )
    select windows.period,
      coalesce(facts.total_captured_events, 0)::int as total_captured_events,
      coalesce(facts.covered_captured_events, 0)::int as covered_captured_events,
      coalesce(facts.total_unique_captured_tracks, 0)::int as total_unique_captured_tracks,
      coalesce(facts.covered_unique_captured_tracks, 0)::int as covered_unique_captured_tracks,
      coalesce(facts.active_captured_listening_days, 0)::int
        as active_captured_listening_days,
      facts.acousticness, facts.danceability, facts.energy, facts.instrumentalness,
      facts.liveness, facts.speechiness, facts.valence
    from comparison_windows windows
    left join sound_facts facts on facts.period = windows.period
    order by case when windows.period = 'current' then 0 else 1 end
  `;
}

export async function readEvolutionHistory(
  database: DatabaseExecutor,
  userId: string,
  period: EvolutionPeriodComparison,
): Promise<EvolutionHistorySummary> {
  const [row] = resultRows<HistoryRow>(
    await database.execute(buildEvolutionHistoryQuery(userId, period)),
  );
  return {
    capturedHistoryStartedAt: date(row?.captured_history_started_at ?? null),
    latestCapturedPlayAt: date(row?.latest_captured_play_at ?? null),
    latestSuccessfulListeningSyncAt: date(row?.latest_successful_listening_sync_at ?? null),
    current: {
      capturedEventCount: number(row?.current_event_count),
      activeDayCount: number(row?.current_active_day_count),
    },
    previous: {
      capturedEventCount: number(row?.previous_event_count),
      activeDayCount: number(row?.previous_active_day_count),
    },
  };
}

function listeningAggregate(row: ListeningRow | undefined): ListeningPeriodAggregate {
  if (!row) return EMPTY_LISTENING_AGGREGATE;
  return {
    capturedPlayCount: number(row.captured_play_count),
    uniqueTrackCount: number(row.unique_track_count),
    uniqueArtistCount: number(row.unique_artist_count),
    activeDayCount: number(row.active_day_count),
    repeatedTrackEventCount: number(row.repeated_track_event_count),
    topFiveTrackEventCount: number(row.top_five_track_event_count),
    topFivePrimaryArtistEventCount: number(row.top_five_primary_artist_event_count),
  };
}

export async function readListeningShift(
  database: DatabaseExecutor,
  userId: string,
  period: EvolutionPeriodComparison,
) {
  const rows = resultRows<ListeningRow>(
    await database.execute(buildListeningShiftQuery(userId, period)),
  );
  return buildListeningShift(
    buildListeningPeriodMetrics(listeningAggregate(rows.find((row) => row.period === 'current'))),
    buildListeningPeriodMetrics(listeningAggregate(rows.find((row) => row.period === 'previous'))),
  );
}

export async function readTrackMovement(
  database: DatabaseExecutor,
  userId: string,
  period: EvolutionPeriodComparison,
): Promise<MovementLists<TrackMovementItem>> {
  const rows = resultRows<TrackMovementRow>(
    await database.execute(buildTrackMovementQuery(userId, period)),
  );
  return rankMovement(
    rows.map((row) => ({
      trackId: row.track_id,
      trackName: row.track_name,
      primaryArtistName: row.primary_artist_name,
      albumImageUrl: row.album_image_url,
      currentCapturedCount: number(row.current_captured_count),
      previousCapturedCount: number(row.previous_captured_count),
      delta: number(row.current_captured_count) - number(row.previous_captured_count),
    })),
    (item) => item.trackId,
  );
}

export async function readArtistMovement(
  database: DatabaseExecutor,
  userId: string,
  period: EvolutionPeriodComparison,
): Promise<MovementLists<ArtistMovementItem>> {
  const rows = resultRows<ArtistMovementRow>(
    await database.execute(buildArtistMovementQuery(userId, period)),
  );
  return rankMovement(
    rows.map((row) => ({
      artistId: row.artist_id,
      artistName: row.artist_name,
      currentCapturedCount: number(row.current_captured_count),
      previousCapturedCount: number(row.previous_captured_count),
      delta: number(row.current_captured_count) - number(row.previous_captured_count),
    })),
    (item) => item.artistId,
  );
}

export async function readCurrentLibraryAdditions(
  database: DatabaseExecutor,
  userId: string,
  period: EvolutionPeriodComparison,
): Promise<CurrentLibraryAdditions> {
  const rows = resultRows<LibraryAdditionRow>(
    await database.execute(buildCurrentLibraryAdditionsQuery(userId, period)),
  );
  const buildPeriod = (key: LibraryAdditionRow['period']) => {
    const matching = rows.filter((row) => row.period === key);
    return {
      count: number(matching[0]?.period_count),
      examples: matching.map((row) => ({
        trackId: row.track_id,
        trackName: row.track_name,
        primaryArtistName: row.primary_artist_name,
        albumImageUrl: row.album_image_url,
        savedAt: date(row.saved_at)!,
      })),
    };
  };
  return {
    current: buildPeriod('current'),
    previous: buildPeriod('previous'),
    disclosure: CURRENT_LIBRARY_ADDITIONS_DISCLOSURE,
  };
}

function soundEvidence(row: SoundRow | undefined): SoundPeriodEvidence {
  return buildSoundPeriodEvidence({
    totalCapturedEvents: number(row?.total_captured_events),
    coveredCapturedEvents: number(row?.covered_captured_events),
    totalUniqueCapturedTracks: number(row?.total_unique_captured_tracks),
    coveredUniqueCapturedTracks: number(row?.covered_unique_captured_tracks),
    activeCapturedListeningDays: number(row?.active_captured_listening_days),
    center: {
      acousticness:
        row?.acousticness === null || row?.acousticness === undefined
          ? null
          : number(row.acousticness),
      danceability:
        row?.danceability === null || row?.danceability === undefined
          ? null
          : number(row.danceability),
      energy: row?.energy === null || row?.energy === undefined ? null : number(row.energy),
      instrumentalness:
        row?.instrumentalness === null || row?.instrumentalness === undefined
          ? null
          : number(row.instrumentalness),
      liveness: row?.liveness === null || row?.liveness === undefined ? null : number(row.liveness),
      speechiness:
        row?.speechiness === null || row?.speechiness === undefined
          ? null
          : number(row.speechiness),
      valence: row?.valence === null || row?.valence === undefined ? null : number(row.valence),
    },
  });
}

export async function readCapturedSoundPeriods(
  database: DatabaseExecutor,
  userId: string,
  period: EvolutionPeriodComparison,
): Promise<{ current: SoundPeriodEvidence; previous: SoundPeriodEvidence }> {
  const rows = resultRows<SoundRow>(
    await database.execute(buildCapturedSoundQuery(userId, period)),
  );
  return {
    current: soundEvidence(rows.find((row) => row.period === 'current')),
    previous: soundEvidence(rows.find((row) => row.period === 'previous')),
  };
}
