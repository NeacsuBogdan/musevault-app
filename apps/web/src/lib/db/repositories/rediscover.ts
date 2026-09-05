import 'server-only';

import { and, desc, eq, sql } from 'drizzle-orm';

import { withDatabase } from '@/lib/db/client';
import { spotifyLibrarySyncs, users } from '@/lib/db/schema';
import {
  buildRediscoverReasons,
  calculateRediscoverIntelligence,
  collectRediscoverSignals,
  paginateRediscoverCandidates,
  REDISCOVER_CANDIDATE_POOL_SIZE,
  type EvidenceLevel,
  type IntelligenceReason,
  type ScoreComponent,
} from '@/lib/intelligence';

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
  albumId: string;
  albumName: string;
  albumImageUrl: string | null;
  artistIds: string[];
  artistNames: string[];
  savedAt: string;
  savedAgeDays: number;
  rediscoverScore: number;
  scoreComponents: ScoreComponent[];
  vaultDepth: number;
  evidenceLevel: EvidenceLevel;
  explanationReasons: IntelligenceReason[];
  recordedPlayCount7d: number;
  recordedPlayCount30d: number;
  recordedPlayCount90d: number;
  latestRecordedPlayAt: string | null;
  affinityRanks: { shortTerm: number | null; mediumTerm: number | null; longTerm: number | null };
}

export interface RediscoverSummary {
  currentSavedTrackCount: number;
  eligibleTrackCount: number;
  candidateCount: number;
  rankedPoolCount: number;
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
  album_id: string;
  album_name: string;
  album_image_url: string | null;
  artist_ids: unknown;
  artist_names: unknown;
  saved_at: Date | string;
  recorded_play_count_7d: number | string;
  recorded_play_count_30d: number | string;
  recorded_play_count_90d: number | string;
  latest_recorded_play_at: Date | string | null;
  short_term_rank: number | string | null;
  medium_term_rank: number | string | null;
  long_term_rank: number | string | null;
  has_short_term_snapshot: boolean;
  has_medium_term_snapshot: boolean;
  has_long_term_snapshot: boolean;
  has_recorded_listening_coverage: boolean;
  has_recent_recorded_events: boolean;
}

const emptySummary: RediscoverSummary = {
  currentSavedTrackCount: 0,
  eligibleTrackCount: 0,
  candidateCount: 0,
  rankedPoolCount: 0,
  excludedRecentPlayCount: 0,
  excludedShortTermCount: 0,
};

function date(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function iso(value: Date | string): string {
  return date(value).toISOString();
}

function numberOrNull(value: number | string | null): number | null {
  return value === null ? null : Number(value);
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function resultRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === 'object' && 'rows' in result) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

/**
 * PostgreSQL filters membership, aggregates bounded listening windows, picks one latest affinity
 * snapshot per range, and calculates the same bounded v2 score used by the TypeScript foundation.
 */
export function buildRediscoverCtes(userId: string, now: Date) {
  return sql`
    with time_anchor as (
      select ${now}::timestamptz as now_at
    ), latest_snapshots as (
      select distinct on (time_range) id, time_range, captured_at
      from spotify_top_item_snapshots
      where user_id = ${userId}
      order by time_range, snapshot_date desc, captured_at desc, id desc
    ), snapshot_coverage as (
      select
        (count(*) filter (where time_range = 'short_term') > 0) as has_short_term_snapshot,
        (count(*) filter (where time_range = 'medium_term') > 0) as has_medium_term_snapshot,
        (count(*) filter (where time_range = 'long_term') > 0) as has_long_term_snapshot
      from latest_snapshots
    ), affinity as (
      select i.track_id,
        min(i.rank) filter (where s.time_range = 'short_term')::int as short_term_rank,
        min(i.rank) filter (where s.time_range = 'medium_term')::int as medium_term_rank,
        min(i.rank) filter (where s.time_range = 'long_term')::int as long_term_rank
      from latest_snapshots s
      join spotify_top_track_snapshot_items i on i.snapshot_id = s.id
      group by i.track_id
    ), plays as (
      select track_id,
        count(*) filter (where played_at >= anchor.now_at - interval '7 days')::int as recorded_play_count_7d,
        count(*) filter (where played_at >= anchor.now_at - interval '30 days')::int as recorded_play_count_30d,
        count(*) filter (where played_at >= anchor.now_at - interval '90 days')::int as recorded_play_count_90d,
        max(played_at) as latest_recorded_play_at
      from spotify_play_history
      cross join time_anchor anchor
      where user_id = ${userId}
      group by track_id, anchor.now_at
    ), evidence as (
      select
        exists (
          select 1 from spotify_listening_syncs
          where user_id = ${userId} and status = 'completed'
        ) as has_recorded_listening_coverage,
        exists (
          select 1 from spotify_play_history
          where user_id = ${userId} and played_at >= anchor.now_at - interval '90 days'
        ) as has_recent_recorded_events,
        (select min(played_at) from spotify_play_history where user_id = ${userId}) as coverage_started_at
      from time_anchor anchor
    ), eligible as (
      select ust.track_id, ust.saved_at, anchor.now_at,
        greatest(0, floor(extract(epoch from (anchor.now_at - ust.saved_at)) / 86400))::int
          as saved_age_days,
        coalesce(p.recorded_play_count_7d, 0)::int as recorded_play_count_7d,
        coalesce(p.recorded_play_count_30d, 0)::int as recorded_play_count_30d,
        coalesce(p.recorded_play_count_90d, 0)::int as recorded_play_count_90d,
        p.latest_recorded_play_at,
        a.short_term_rank, a.medium_term_rank, a.long_term_rank,
        sc.has_short_term_snapshot, sc.has_medium_term_snapshot, sc.has_long_term_snapshot,
        e.has_recorded_listening_coverage, e.has_recent_recorded_events, e.coverage_started_at
      from user_saved_tracks ust
      left join plays p on p.track_id = ust.track_id
      left join affinity a on a.track_id = ust.track_id
      cross join snapshot_coverage sc
      cross join evidence e
      cross join time_anchor anchor
      where ust.user_id = ${userId}
        and ust.saved_at <= anchor.now_at - interval '90 days'
    ), components as (
      select *,
        case
          when saved_age_days >= 2920 then 100
          when saved_age_days >= 1825 then
            90 + floor((2 * (saved_age_days - 1825) * 10 + 1095)::numeric / 2190)::int
          when saved_age_days >= 1095 then
            78 + floor((2 * (saved_age_days - 1095) * 12 + 730)::numeric / 1460)::int
          when saved_age_days >= 730 then
            65 + floor((2 * (saved_age_days - 730) * 13 + 365)::numeric / 730)::int
          when saved_age_days >= 365 then
            50 + floor((2 * (saved_age_days - 365) * 15 + 365)::numeric / 730)::int
          when saved_age_days >= 180 then
            35 + floor((2 * (saved_age_days - 180) * 15 + 185)::numeric / 370)::int
          else
            25 + floor((2 * (saved_age_days - 90) * 10 + 90)::numeric / 180)::int
        end as age_relevance,
        case
          when latest_recorded_play_at is null then 0
          when latest_recorded_play_at >= now_at - interval '7 days' then 38
          when latest_recorded_play_at >= now_at - interval '30 days' then 30
          when latest_recorded_play_at >= now_at - interval '90 days' then 18
          when latest_recorded_play_at >= now_at - interval '180 days' then 10
          else 4
        end as recorded_recency_pressure,
        least(recorded_play_count_7d * 6 + recorded_play_count_30d * 2 + recorded_play_count_90d, 30)::int
          as recorded_frequency_pressure,
        case when short_term_rank is null then 0 else greatest(
          18, round(34 - ((least(greatest(short_term_rank, 1), 50) - 1) * 16.0 / 49))::int
        ) end as short_term_affinity_pressure,
        case when medium_term_rank is null then 0 else greatest(
          8, round(16 - ((least(greatest(medium_term_rank, 1), 50) - 1) * 8.0 / 49))::int
        ) end as medium_term_affinity_pressure,
        case when long_term_rank is null then 0 else greatest(
          3, round(7 - ((least(greatest(long_term_rank, 1), 50) - 1) * 4.0 / 49))::int
        ) end as long_term_affinity_pressure
      from eligible
    ), scored as (
      select *, greatest(0, least(100,
        age_relevance
        - recorded_recency_pressure
        - recorded_frequency_pressure
        - short_term_affinity_pressure
        - medium_term_affinity_pressure
        - long_term_affinity_pressure
      ))::int as rediscover_score
      from components
    )`;
}

export async function getRediscoverSnapshot(
  spotifyAccountId: string,
  options: { page?: unknown; now?: Date } = {},
): Promise<RediscoverSnapshot> {
  const page = normalizeRediscoverPage(options.page);
  const now = options.now ?? new Date();
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
        ${buildRediscoverCtes(user.id, now)}
        select
          (select count(*) from user_saved_tracks where user_id = ${user.id})::int as current_count,
          (select count(*) from eligible)::int as eligible_count,
          (select count(*) from scored where rediscover_score > 0)::int as candidate_count,
          (select count(*) from scored where rediscover_score = 0 and recorded_recency_pressure = 38)::int
            as recent_play_excluded_count,
          (select count(*) from scored where rediscover_score = 0 and short_term_rank is not null)::int
            as short_term_excluded_count,
          (select coverage_started_at from evidence) as coverage_started_at
      `);
      const row = resultRows<SummaryRow>(summaryResult)[0];
      const candidateCount = Number(row?.candidate_count ?? 0);
      const summary: RediscoverSummary = {
        currentSavedTrackCount: Number(row?.current_count ?? 0),
        eligibleTrackCount: Number(row?.eligible_count ?? 0),
        candidateCount,
        rankedPoolCount: Math.min(candidateCount, REDISCOVER_CANDIDATE_POOL_SIZE),
        excludedRecentPlayCount: Number(row?.recent_play_excluded_count ?? 0),
        excludedShortTermCount: Number(row?.short_term_excluded_count ?? 0),
      };
      const totalPages = Math.ceil(summary.rankedPoolCount / REDISCOVER_PAGE_SIZE);
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

      const candidateResult = await transaction.execute(sql`
        ${buildRediscoverCtes(user.id, now)}
        select
          t.id as track_id, t.name as track_name, t.spotify_url,
          a.id as album_id, a.name as album_name, a.image_url as album_image_url,
          jsonb_agg(ar.id order by ta.position) as artist_ids,
          jsonb_agg(ar.name order by ta.position) as artist_names,
          s.saved_at, s.recorded_play_count_7d, s.recorded_play_count_30d,
          s.recorded_play_count_90d, s.latest_recorded_play_at,
          s.short_term_rank, s.medium_term_rank, s.long_term_rank,
          s.has_short_term_snapshot, s.has_medium_term_snapshot, s.has_long_term_snapshot,
          s.has_recorded_listening_coverage, s.has_recent_recorded_events
        from scored s
        join spotify_tracks t on t.id = s.track_id
        join spotify_albums a on a.id = t.album_id
        join spotify_track_artists ta on ta.track_id = t.id
        join spotify_artists ar on ar.id = ta.artist_id
        where s.rediscover_score > 0
        group by t.id, t.name, t.spotify_url, a.id, a.name, a.image_url,
          s.saved_at, s.rediscover_score, s.recorded_play_count_7d,
          s.recorded_play_count_30d, s.recorded_play_count_90d,
          s.latest_recorded_play_at, s.short_term_rank, s.medium_term_rank, s.long_term_rank,
          s.has_short_term_snapshot, s.has_medium_term_snapshot, s.has_long_term_snapshot,
          s.has_recorded_listening_coverage, s.has_recent_recorded_events
        order by s.rediscover_score desc, s.saved_at asc, t.id asc
        limit ${REDISCOVER_CANDIDATE_POOL_SIZE}
      `);
      const pool = resultRows<CandidateRow>(candidateResult).map((candidate) => {
        const savedAt = date(candidate.saved_at);
        const latestRecordedPlayAt = candidate.latest_recorded_play_at
          ? date(candidate.latest_recorded_play_at)
          : null;
        const shortTermRank = numberOrNull(candidate.short_term_rank);
        const mediumTermRank = numberOrNull(candidate.medium_term_rank);
        const longTermRank = numberOrNull(candidate.long_term_rank);
        const signals = collectRediscoverSignals({
          savedAt,
          now,
          latestRecordedPlayAt,
          recordedPlayCount7d: Number(candidate.recorded_play_count_7d),
          recordedPlayCount30d: Number(candidate.recorded_play_count_30d),
          recordedPlayCount90d: Number(candidate.recorded_play_count_90d),
          recordedListeningCoverage: candidate.has_recorded_listening_coverage,
          recentRecordedEventsAvailable: candidate.has_recent_recorded_events,
          affinity: {
            shortTerm: {
              snapshotAvailable: candidate.has_short_term_snapshot,
              rank: shortTermRank,
            },
            mediumTerm: {
              snapshotAvailable: candidate.has_medium_term_snapshot,
              rank: mediumTermRank,
            },
            longTerm: {
              snapshotAvailable: candidate.has_long_term_snapshot,
              rank: longTermRank,
            },
          },
        });
        const intelligence = calculateRediscoverIntelligence(signals);
        return {
          trackId: candidate.track_id,
          trackName: candidate.track_name,
          spotifyUrl: candidate.spotify_url,
          albumId: candidate.album_id,
          albumName: candidate.album_name,
          albumImageUrl: candidate.album_image_url,
          artistIds: strings(candidate.artist_ids),
          artistNames: strings(candidate.artist_names),
          savedAt: savedAt.toISOString(),
          savedAgeDays: signals.savedAgeDays,
          rediscoverScore: intelligence.rediscoverScore,
          scoreComponents: intelligence.scoreComponents,
          vaultDepth: intelligence.vaultDepth,
          evidenceLevel: intelligence.evidenceLevel,
          explanationReasons: buildRediscoverReasons(signals, intelligence.evidenceLevel),
          recordedPlayCount7d: signals.recordedPlayCount7d,
          recordedPlayCount30d: signals.recordedPlayCount30d,
          recordedPlayCount90d: signals.recordedPlayCount90d,
          latestRecordedPlayAt: latestRecordedPlayAt?.toISOString() ?? null,
          affinityRanks: {
            shortTerm: shortTermRank,
            mediumTerm: mediumTermRank,
            longTerm: longTermRank,
          },
        } satisfies RediscoverCandidate;
      });
      const candidates = paginateRediscoverCandidates(pool, page, REDISCOVER_PAGE_SIZE);
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
