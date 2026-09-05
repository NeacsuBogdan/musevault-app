import { readFileSync } from 'node:fs';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { buildRediscoverCtes, normalizeRediscoverPage, REDISCOVER_PAGE_SIZE } from './rediscover';

const source = readFileSync(new URL('./rediscover.ts', import.meta.url), 'utf8');

describe('Rediscover pagination', () => {
  it('uses a fixed visible page of 20 results', () => expect(REDISCOVER_PAGE_SIZE).toBe(20));
  it.each([
    [undefined, 1],
    ['', 1],
    ['0', 1],
    ['-2', 1],
    ['1.5', 1],
    ['wat', 1],
    ['2', 2],
    [3, 3],
  ])('normalizes %j to page %i', (input, expected) =>
    expect(normalizeRediscoverPage(input)).toBe(expected),
  );
});

describe('Rediscover v2 SQL contract', () => {
  it('uses only current memberships with the inclusive 90-day boundary', () => {
    expect(source).toContain('from user_saved_tracks ust');
    expect(source).toContain("interval '90 days'");
    expect(source).toContain("ust.saved_at <= anchor.now_at - interval '90 days'");
  });

  it('aggregates latest play and bounded 7/30/90-day recorded windows in PostgreSQL', () => {
    expect(source).toContain('max(played_at) as latest_recorded_play_at');
    expect(source).toContain('recorded_play_count_7d');
    expect(source).toContain('recorded_play_count_30d');
    expect(source).toContain('recorded_play_count_90d');
    expect(source).toContain("interval '7 days'");
    expect(source).toContain("interval '30 days'");
  });

  it('selects one latest affinity snapshot per range with a stable tie-break', () => {
    expect(source).toContain('select distinct on (time_range)');
    expect(source).toContain('order by time_range, snapshot_date desc, captured_at desc, id desc');
    expect(source).toContain("filter (where s.time_range = 'short_term')");
    expect(source).toContain("filter (where s.time_range = 'medium_term')");
    expect(source).toContain("filter (where s.time_range = 'long_term')");
  });

  it('distinguishes missing snapshots from non-membership and keeps rank as rank', () => {
    expect(source).toContain('snapshot_coverage as');
    expect(source).toContain('has_short_term_snapshot');
    expect(source).toContain('short_term_rank');
    expect(source).not.toMatch(/play_count.*rank|rank.*play_count/);
  });

  it('calculates bounded explicit components before scoring and reranking', () => {
    expect(source).toContain('components as');
    expect(source).toContain('age_relevance');
    expect(source).toContain('recorded_recency_pressure');
    expect(source).toContain('recorded_frequency_pressure');
    expect(source).toContain('short_term_affinity_pressure');
    expect(source).toContain('medium_term_affinity_pressure');
    expect(source).toContain('long_term_affinity_pressure');
    expect(source).toContain('greatest(0, least(100,');
  });

  it('preserves full-sync safety and the per-user advisory lock', () => {
    expect(source).toContain('pg_advisory_xact_lock');
    expect(source).toContain("eq(spotifyLibrarySyncs.syncKind, 'full')");
    expect(source).toContain("eq(spotifyLibrarySyncs.status, 'completed')");
    expect(source).toContain("eq(spotifyLibrarySyncs.status, 'running')");
    expect(source).toContain("return base('sync_in_progress')");
    expect(source).toContain("return base('sync_required')");
  });

  it('loads only a bounded score-ordered pool and uses ordered credited artists', () => {
    expect(source).toContain('limit ${REDISCOVER_CANDIDATE_POOL_SIZE}');
    expect(source).toContain('paginateRediscoverCandidates(pool, page, REDISCOVER_PAGE_SIZE)');
    expect(source).toContain('jsonb_agg(ar.id order by ta.position)');
    expect(source).toContain('jsonb_agg(ar.name order by ta.position)');
    expect(source).not.toContain('limit ${REDISCOVER_PAGE_SIZE} offset');
  });

  it('contains no provider call, audio feature, enrichment, randomization, or AI integration', () => {
    expect(source).not.toMatch(
      /fetch\(|Math\.random|order by random|spotify\/client|reccobeats|audio_feature|enrichment|recommendation API|openai/i,
    );
  });
});

describe('Rediscover PostgreSQL time anchor', () => {
  const fixedNow = new Date('2026-09-05T12:00:00.000Z');
  const compile = () => new PgDialect().sqlToQuery(buildRediscoverCtes('user-id', fixedNow));

  it('casts the single injected deterministic anchor to PostgreSQL timestamptz', () => {
    const query = compile();
    expect(query.sql).toMatch(/select \$1::timestamptz as now_at/);
    expect(query.params.filter((value) => value === fixedNow)).toHaveLength(1);
    expect(compile()).toEqual(query);
  });

  it.each(['7', '30', '90'])(
    'uses typed timestamptz subtraction for the %s-day play window',
    (days) => {
      expect(compile().sql).toContain(`played_at >= anchor.now_at - interval '${days} days'`);
    },
  );

  it('uses the typed anchor for saved-age eligibility', () => {
    expect(compile().sql).toContain("saved_at <= anchor.now_at - interval '90 days'");
  });

  it('derives whole saved-age days from the typed timestamp anchor', () => {
    expect(compile().sql).toContain('extract(epoch from (anchor.now_at - ust.saved_at)) / 86400');
  });

  it.each(['180', '365', '730', '1095', '1825', '2920'])(
    'uses the %s-day interpolation anchor in SQL',
    (days) => {
      expect(compile().sql).toContain(`saved_age_days >= ${days}`);
    },
  );

  it('uses deterministic integer interpolation rather than flat age buckets', () => {
    expect(compile().sql).toContain('2 * (saved_age_days - 1825) * 10 + 1095');
    expect(compile().sql).toContain('2 * (saved_age_days - 90) * 10 + 90');
  });

  it.each(['7', '30', '90', '180'])(
    'uses the typed anchor for the %s-day recorded-recency bucket',
    (days) => {
      expect(compile().sql).toContain(
        `latest_recorded_play_at >= now_at - interval '${days} days'`,
      );
    },
  );

  it('contains no bare bound parameter followed by interval subtraction', () => {
    expect(compile().sql).not.toMatch(/\$\d+\s*-\s*interval/i);
    expect(source).not.toMatch(/\$\{now\}\s*-\s*interval/i);
  });
});
