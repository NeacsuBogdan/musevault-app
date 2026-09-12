import { readFileSync } from 'node:fs';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  buildAudioEnrichmentStatusQuery,
  buildSoundDistanceRankingsQuery,
  buildSoundProfileQuery,
  ENRICHMENT_REQUEST_LIMIT,
  prioritizeCandidateTrackIds,
} from './audio-profile';

const source = readFileSync(new URL('./audio-profile.ts', import.meta.url), 'utf8');
const dialect = new PgDialect();
const compile = (query: ReturnType<typeof buildSoundProfileQuery>) => dialect.sqlToQuery(query).sql;
const fixedNow = new Date('2026-09-12T12:00:00.000Z');

describe('audio enrichment candidate priority', () => {
  it('deduplicates recent, affinity, saved, and older-history tiers in priority order', () => {
    expect(
      prioritizeCandidateTrackIds([
        [{ id: 'recent-2' }, { id: 'shared' }],
        [{ id: 'top-1' }, { id: 'shared' }],
        [{ id: 'saved-1' }, { id: 'top-1' }],
        [{ id: 'older-1' }, { id: 'recent-2' }],
      ]),
    ).toEqual(['recent-2', 'shared', 'top-1', 'saved-1', 'older-1']);
  });

  it('bounds every POST candidate set at 60', () => {
    const ids = prioritizeCandidateTrackIds([
      Array.from({ length: 100 }, (_, index) => ({ id: `track-${index}` })),
    ]);
    expect(ids).toHaveLength(ENRICHMENT_REQUEST_LIMIT);
  });
});

describe('bulk audio enrichment status SQL', () => {
  const query = dialect.sqlToQuery(buildAudioEnrichmentStatusQuery('user-id', fixedNow));

  it('counts only current saved membership and excludes stale global cache rows', () => {
    expect(query.sql).toContain('from "user_saved_tracks" saved');
    expect(query.sql).toContain('left join "track_audio_features" features');
    expect(query.sql).toContain('where saved.user_id =');
    expect(query.sql).not.toContain('spotify_play_history');
    expect(query.sql).not.toContain('spotify_top_track_snapshot_items');
  });

  it('returns covered, currently eligible, and cooling-down counts as bounded aggregates', () => {
    expect(query.sql).toContain("features.status = 'available'");
    expect(query.sql).toContain('features.track_id is null');
    expect(query.sql).toContain("features.status = 'not_found' and features.retry_after_at <=");
    expect(query.sql).toContain("features.status = 'not_found' and features.retry_after_at >");
    expect(query.sql.match(/count\(\*\)/g)).toHaveLength(4);
    expect(query.params).toContain('reccobeats');
    expect(query.params.filter((value) => value === fixedNow)).toHaveLength(2);
  });

  it('keeps saved-library selection bounded to the existing 60-candidate request limit', () => {
    expect(ENRICHMENT_REQUEST_LIMIT).toBe(60);
    const savedSelector = source.slice(
      source.indexOf('export async function getSavedEnrichmentCandidates'),
      source.indexOf('interface AudioEnrichmentStatusRow'),
    );
    expect(savedSelector).toContain('.limit(limit)');
    expect(savedSelector).toContain('eq(userSavedTracks.userId, userId)');
    expect(savedSelector).toContain('isNull(trackAudioFeatures.trackId)');
    expect(savedSelector).toContain("eq(trackAudioFeatures.status, 'not_found')");
    expect(savedSelector).not.toContain("eq(trackAudioFeatures.status, 'available')");
  });
});

describe('Audio Profile v2 PostgreSQL contracts', () => {
  const profileSql = compile(buildSoundProfileQuery('user-id'));
  const rankingSql = compile(buildSoundDistanceRankingsQuery('user-id'));

  it('defines coverage as current saved tracks intersected with available cached ReccoBeats rows', () => {
    expect(profileSql).toContain('with current_saved as');
    expect(profileSql).toContain('from "user_saved_tracks" saved');
    expect(profileSql).toContain('join "track_audio_features" features');
    expect(dialect.sqlToQuery(buildSoundProfileQuery('user-id')).params).toContain('reccobeats');
    expect(profileSql).toContain("and features.status = 'available'");
    expect(profileSql).not.toContain('spotify_play_history');
    expect(profileSql).not.toContain('spotify_top_track_snapshot_items');
  });

  it('computes p25, p50, and p75 for all nine characteristics in PostgreSQL', () => {
    expect(profileSql.match(/percentile_cont\(/g)).toHaveLength(27);
    for (const metric of [
      'acousticness',
      'danceability',
      'energy',
      'instrumentalness',
      'liveness',
      'speechiness',
      'valence',
      'tempo',
      'loudness',
    ]) {
      expect(profileSql).toContain(`as ${metric}_p25`);
      expect(profileSql).toContain(`as ${metric}_p50`);
      expect(profileSql).toContain(`as ${metric}_p75`);
      expect(profileSql).toContain(`filter (where ${metric} is not null)`);
    }
  });

  it('requires all seven bounded fields for Sound Distance without substituting missing data', () => {
    for (const metric of [
      'acousticness',
      'danceability',
      'energy',
      'instrumentalness',
      'liveness',
      'speechiness',
      'valence',
    ]) {
      expect(rankingSql).toContain(`covered.${metric} is not null`);
      expect(rankingSql).toContain(`center.${metric}_p50 is not null`);
    }
    expect(rankingSql).not.toContain('coalesce(covered.');
    expect(rankingSql).toContain('coverage.audio_covered_track_count >= 20');
  });

  it('implements the documented seven-feature RMS formula and excludes tempo and loudness', () => {
    const formula = rankingSql.slice(
      rankingSql.indexOf('round(greatest'),
      rankingSql.indexOf('as sound_distance'),
    );
    expect(formula.match(/power\(/g)).toHaveLength(7);
    expect(formula).toContain('/ 7.0');
    expect(formula).toContain('* 100');
    expect(formula).toContain('greatest(0, least(100, sqrt(');
    expect(formula).not.toContain('tempo');
    expect(formula).not.toContain('loudness');
  });

  it('bounds and orders both lists in SQL with stable track-ID tie breakers', () => {
    expect(rankingSql).toContain('order by sound_distance desc, track_id asc');
    expect(rankingSql).toContain('order by sound_distance asc, track_id asc');
    expect(rankingSql).toMatch(/sonic_outliers as[\s\S]*?limit 10/);
    expect(rankingSql).toMatch(/closest_tracks as[\s\S]*?limit 5/);
  });

  it('keeps normal profile rendering database-only and returns no whole-library rowset', () => {
    const summarySource = source.slice(
      source.indexOf('export async function getAudioProfileSummary'),
    );
    expect(summarySource).not.toContain('fetch(');
    expect(summarySource).not.toContain('getEnrichmentCandidates(');
    expect(profileSql).toContain('sound_profile.*');
    expect(rankingSql).toContain('from ranked');
  });
});
