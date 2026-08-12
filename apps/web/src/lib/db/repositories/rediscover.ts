import 'server-only';

import { and, desc, eq, sql } from 'drizzle-orm';

import { withDatabase } from '@/lib/db/client';
import { spotifyLibrarySyncs, users } from '@/lib/db/schema';

export const REDISCOVER_PAGE_SIZE = 20;

export type RediscoverState =
  | 'success'
  | 'sync_required'
  | 'sync_in_progress'
  | 'empty_library'
  | 'nothing_eligible'
  | 'no_candidates';

export interface RediscoverCandidate {
  trackId: string;
  trackName: string;
  spotifyUrl: string;
  albumName: string;
  albumImageUrl: string | null;
  artistNames: string[];
  savedAt: string;
  rediscoverScore: number;
  recordedPlayCount: number;
  latestRecordedPlayAt: string | null;
  affinity: { shortTerm: boolean; mediumTerm: boolean; longTerm: boolean };
}

export interface RediscoverSummary {
  currentSavedTrackCount: number;
  eligibleTrackCount: number;
  candidateCount: number;
  excludedRecentPlayCount: number;
  excludedShortTermCount: number;
}

export interface RediscoverSnapshot {
  state: RediscoverState;
  summary: RediscoverSummary;
  candidates: RediscoverCandidate[];
  recordedCoverage: { startedAt: string | null };
  pagination: { page: number; pageSize: number; totalPages: number };
}

export function normalizeRediscoverPage(input: unknown): number {
  const value = Array.isArray(input) ? input[0] : input;
  if (typeof value !== 'string' && typeof value !== 'number') return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export function calculateRediscoverScore(input: {
  savedAt: Date;
  now: Date;
  recordedPlayCount: number;
  latestRecordedPlayAt: Date | null;
  mediumTerm: boolean;
  longTerm: boolean;
}): number {
  const yearsAgo = (years: number) => {
    const threshold = new Date(input.now);
    threshold.setUTCFullYear(threshold.getUTCFullYear() - years);
    return input.savedAt <= threshold;
  };
  const ageDays = (input.now.getTime() - input.savedAt.getTime()) / 86_400_000;
  const ageScore = yearsAgo(5)
    ? 50
    : yearsAgo(3)
      ? 40
      : yearsAgo(2)
        ? 32
        : yearsAgo(1)
          ? 24
          : ageDays >= 180
            ? 16
            : 8;
  const playAgeDays = input.latestRecordedPlayAt
    ? (input.now.getTime() - input.latestRecordedPlayAt.getTime()) / 86_400_000
    : null;
  const recencyPenalty =
    playAgeDays === null ? 0 : playAgeDays <= 30 ? 25 : playAgeDays <= 90 ? 15 : 5;
  return (
    ageScore -
    recencyPenalty -
    Math.min(input.recordedPlayCount * 2, 20) -
    (input.mediumTerm ? 15 : 0) -
    (input.longTerm ? 8 : 0)
  );
}

interface SummaryRow {
  current_count: number | string;
  eligible_count: number | string;
  candidate_count: number | string;
  recent_play_excluded_count: number | string;
  short_term_excluded_count: number | string;
  coverage_started_at: Date | string | null;
}

interface CandidateRow {
  track_id: string;
  track_name: string;
  spotify_url: string;
  album_name: string;
  album_image_url: string | null;
  artist_names: unknown;
  saved_at: Date | string;
  rediscover_score: number | string;
  recorded_play_count: number | string;
  latest_recorded_play_at: Date | string | null;
  short_term: boolean;
  medium_term: boolean;
  long_term: boolean;
}

const emptySummary: RediscoverSummary = {
  currentSavedTrackCount: 0,
  eligibleTrackCount: 0,
  candidateCount: 0,
  excludedRecentPlayCount: 0,
  excludedShortTermCount: 0,
};

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function resultRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === 'object' && 'rows' in result) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

function commonRediscoverCtes(userId: string) {
  return sql`
    with latest_snapshots as (
      select distinct on (time_range) id, time_range
      from spotify_top_item_snapshots
      where user_id = ${userId}
      order by time_range, snapshot_date desc, captured_at desc, id desc
    ), affinity as (
      select i.track_id,
        bool_or(s.time_range = 'short_term') as short_term,
        bool_or(s.time_range = 'medium_term') as medium_term,
        bool_or(s.time_range = 'long_term') as long_term
      from latest_snapshots s
      join spotify_top_track_snapshot_items i on i.snapshot_id = s.id
      group by i.track_id
    ), plays as (
      select track_id, count(*)::int as recorded_play_count, max(played_at) as latest_recorded_play_at
      from spotify_play_history
      where user_id = ${userId}
      group by track_id
    ), eligible as (
      select ust.track_id, ust.saved_at,
        coalesce(p.recorded_play_count, 0)::int as recorded_play_count,
        p.latest_recorded_play_at,
        coalesce(a.short_term, false) as short_term,
        coalesce(a.medium_term, false) as medium_term,
        coalesce(a.long_term, false) as long_term
      from user_saved_tracks ust
      left join plays p on p.track_id = ust.track_id
      left join affinity a on a.track_id = ust.track_id
      where ust.user_id = ${userId}
        and ust.saved_at <= now() - interval '90 days'
    ), scored as (
      select *,
        (case
          when saved_at <= now() - interval '5 years' then 50
          when saved_at <= now() - interval '3 years' then 40
          when saved_at <= now() - interval '2 years' then 32
          when saved_at <= now() - interval '1 year' then 24
          when saved_at <= now() - interval '180 days' then 16
          else 8
        end
        - case
            when latest_recorded_play_at >= now() - interval '30 days' then 25
            when latest_recorded_play_at >= now() - interval '90 days' then 15
            when latest_recorded_play_at is not null then 5
            else 0
          end
        - least(recorded_play_count * 2, 20)
        - case when medium_term then 15 else 0 end
        - case when long_term then 8 else 0 end)::int as rediscover_score
      from eligible
      where (latest_recorded_play_at is null or latest_recorded_play_at < now() - interval '7 days')
        and not short_term
    )`;
}

export async function getRediscoverSnapshot(
  spotifyAccountId: string,
  options: { page?: unknown } = {},
): Promise<RediscoverSnapshot> {
  const page = normalizeRediscoverPage(options.page);
  const base = (state: RediscoverState): RediscoverSnapshot => ({
    state,
    summary: emptySummary,
    candidates: [],
    recordedCoverage: { startedAt: null },
    pagination: { page, pageSize: REDISCOVER_PAGE_SIZE, totalPages: 0 },
  });

  return withDatabase((database) =>
    database.transaction(async (transaction) => {
      const [user] = await transaction
        .select({ id: users.id })
        .from(users)
        .where(eq(users.spotifyAccountId, spotifyAccountId))
        .limit(1);
      if (!user) return base('sync_required');

      await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${user.id}))`);
      const [runningFullSync] = await transaction
        .select({ id: spotifyLibrarySyncs.id })
        .from(spotifyLibrarySyncs)
        .where(
          and(
            eq(spotifyLibrarySyncs.userId, user.id),
            eq(spotifyLibrarySyncs.syncKind, 'full'),
            eq(spotifyLibrarySyncs.status, 'running'),
          ),
        )
        .limit(1);
      if (runningFullSync) return base('sync_in_progress');

      const [baseline] = await transaction
        .select({ completedAt: spotifyLibrarySyncs.completedAt })
        .from(spotifyLibrarySyncs)
        .where(
          and(
            eq(spotifyLibrarySyncs.userId, user.id),
            eq(spotifyLibrarySyncs.syncKind, 'full'),
            eq(spotifyLibrarySyncs.status, 'completed'),
          ),
        )
        .orderBy(desc(spotifyLibrarySyncs.completedAt))
        .limit(1);
      if (!baseline?.completedAt) return base('sync_required');

      const summaryResult = await transaction.execute(sql`
        ${commonRediscoverCtes(user.id)}
        select
          (select count(*) from user_saved_tracks where user_id = ${user.id})::int as current_count,
          (select count(*) from eligible)::int as eligible_count,
          (select count(*) from scored)::int as candidate_count,
          (select count(*) from eligible where latest_recorded_play_at >= now() - interval '7 days')::int as recent_play_excluded_count,
          (select count(*) from eligible where short_term)::int as short_term_excluded_count,
          (select min(played_at) from spotify_play_history where user_id = ${user.id}) as coverage_started_at
      `);
      const row = resultRows<SummaryRow>(summaryResult)[0];
      const summary: RediscoverSummary = {
        currentSavedTrackCount: Number(row?.current_count ?? 0),
        eligibleTrackCount: Number(row?.eligible_count ?? 0),
        candidateCount: Number(row?.candidate_count ?? 0),
        excludedRecentPlayCount: Number(row?.recent_play_excluded_count ?? 0),
        excludedShortTermCount: Number(row?.short_term_excluded_count ?? 0),
      };
      const totalPages = Math.ceil(summary.candidateCount / REDISCOVER_PAGE_SIZE);
      const state: RediscoverState =
        summary.currentSavedTrackCount === 0
          ? 'empty_library'
          : summary.eligibleTrackCount === 0
            ? 'nothing_eligible'
            : summary.candidateCount === 0
              ? 'no_candidates'
              : 'success';
      if (state !== 'success') {
        return {
          ...base(state),
          summary,
          recordedCoverage: {
            startedAt: row?.coverage_started_at ? iso(row.coverage_started_at) : null,
          },
        };
      }

      const offset = (page - 1) * REDISCOVER_PAGE_SIZE;
      const candidateResult = await transaction.execute(sql`
        ${commonRediscoverCtes(user.id)}
        select
          t.id as track_id, t.name as track_name, t.spotify_url,
          a.name as album_name, a.image_url as album_image_url,
          jsonb_agg(ar.name order by ta.position) as artist_names,
          s.saved_at, s.rediscover_score, s.recorded_play_count,
          s.latest_recorded_play_at, s.short_term, s.medium_term, s.long_term
        from scored s
        join spotify_tracks t on t.id = s.track_id
        join spotify_albums a on a.id = t.album_id
        join spotify_track_artists ta on ta.track_id = t.id
        join spotify_artists ar on ar.id = ta.artist_id
        group by t.id, t.name, t.spotify_url, a.id, a.name, a.image_url,
          s.saved_at, s.rediscover_score, s.recorded_play_count,
          s.latest_recorded_play_at, s.short_term, s.medium_term, s.long_term
        order by s.rediscover_score desc, s.saved_at asc, t.id asc
        limit ${REDISCOVER_PAGE_SIZE} offset ${offset}
      `);
      const candidates = resultRows<CandidateRow>(candidateResult).map((candidate) => ({
        trackId: candidate.track_id,
        trackName: candidate.track_name,
        spotifyUrl: candidate.spotify_url,
        albumName: candidate.album_name,
        albumImageUrl: candidate.album_image_url,
        artistNames: Array.isArray(candidate.artist_names)
          ? candidate.artist_names.filter((name): name is string => typeof name === 'string')
          : [],
        savedAt: iso(candidate.saved_at),
        rediscoverScore: Number(candidate.rediscover_score),
        recordedPlayCount: Number(candidate.recorded_play_count),
        latestRecordedPlayAt: candidate.latest_recorded_play_at
          ? iso(candidate.latest_recorded_play_at)
          : null,
        affinity: {
          shortTerm: candidate.short_term,
          mediumTerm: candidate.medium_term,
          longTerm: candidate.long_term,
        },
      }));
      return {
        state,
        summary,
        candidates,
        recordedCoverage: {
          startedAt: row?.coverage_started_at ? iso(row.coverage_started_at) : null,
        },
        pagination: { page, pageSize: REDISCOVER_PAGE_SIZE, totalPages },
      };
    }),
  );
}
