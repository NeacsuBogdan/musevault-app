import { readFileSync } from 'node:fs';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import {
  buildCurrentRotationQuery,
  buildListeningPulseQuery,
  buildListeningWindowCtes,
  buildRecordedMomentumQuery,
} from './listening-intelligence';

const source = readFileSync(new URL('./listening-intelligence.ts', import.meta.url), 'utf8');
const fixedNow = new Date('2026-09-12T12:00:00.000Z');
const dialect = new PgDialect();
const compile = (query: ReturnType<typeof buildListeningWindowCtes>) => dialect.sqlToQuery(query);

describe('listening intelligence PostgreSQL windows', () => {
  it('binds one deterministic now through an explicit timestamptz anchor', () => {
    const query = compile(buildListeningWindowCtes('user-id', fixedNow));
    expect(query.sql).toMatch(/select \$1::timestamptz as now_at/);
    expect(query.params.filter((value) => value === fixedNow)).toHaveLength(1);
    expect(compile(buildListeningWindowCtes('user-id', fixedNow))).toEqual(query);
  });

  it('uses exact half-open current7, previous7, and current30 boundaries', () => {
    const query = compile(buildListeningWindowCtes('user-id', fixedNow)).sql;
    expect(query).toContain("played_at >= anchor.now_at - interval '30 days'");
    expect(query).toContain("played_at >= anchor.now_at - interval '14 days'");
    expect(query).toContain("played_at >= anchor.now_at - interval '7 days'");
    expect(query).toContain("played_at < anchor.now_at - interval '7 days'");
    expect(query).toContain('played_at < anchor.now_at');
  });

  it('selects only the latest successful listening sync with deterministic tie-breaking', () => {
    const query = compile(buildListeningPulseQuery('user-id', fixedNow)).sql;
    expect(query).toContain('latest_successful_listening_sync as');
    expect(query).toContain("status = 'completed'");
    expect(query).toContain('completed_at is not null');
    expect(query).toContain('order by completed_at desc, started_at desc, id desc');
    expect(query).toContain('select completed_at from latest_successful_listening_sync');
    expect(query).not.toContain("status = 'failed'");
  });

  it('never subtracts an interval from a bare bound parameter', () => {
    for (const query of [
      buildListeningWindowCtes('user-id', fixedNow),
      buildListeningPulseQuery('user-id', fixedNow),
      buildCurrentRotationQuery('user-id', fixedNow),
      buildRecordedMomentumQuery('user-id', fixedNow),
    ]) {
      expect(compile(query).sql).not.toMatch(/\$\d+\s*-\s*interval/i);
    }
    expect(source).not.toMatch(/\$\{now\}\s*-\s*interval/i);
  });
});

describe('bounded database aggregation contracts', () => {
  const pulseSql = compile(buildListeningPulseQuery('user-id', fixedNow)).sql;
  const rotationSql = compile(buildCurrentRotationQuery('user-id', fixedNow)).sql;
  const momentumSql = compile(buildRecordedMomentumQuery('user-id', fixedNow)).sql;

  it('calculates event, unique-track, unique-credited-artist, repeat, and concentration inputs in SQL', () => {
    expect(pulseSql).toContain('current_7_recorded_count');
    expect(pulseSql).toContain('current_30_recorded_count');
    expect(pulseSql).toContain('count(distinct plays.track_id)');
    expect(pulseSql).toContain('count(distinct track_artist.artist_id)');
    expect(pulseSql).toContain('repeated_track_event_count');
    expect(pulseSql).toContain('top_five_track_event_count');
    expect(pulseSql).toContain('top_five_primary_artist_event_count');
  });

  it('counts recorded events before credited-artist joins so collaborations do not inflate them', () => {
    expect(pulseSql).toContain('select count(*)::int from windowed_plays');
    expect(pulseSql).toContain('join spotify_track_artists track_artist');
    expect(pulseSql).toContain('select history.track_id, history.played_at');
  });

  it('uses primary artist only for artist concentration and momentum', () => {
    expect(pulseSql).toContain('track_artist.position = 0');
    expect(momentumSql).toContain('track_artist.position = 0');
  });

  it('scores and caps Current Rotation in PostgreSQL with deterministic tie-breaking', () => {
    expect(rotationSql).toContain('rotation_components as');
    expect(rotationSql).toContain('greatest(0, least(100,');
    expect(rotationSql).toContain('order by rotation_score desc, recorded_play_count_7d desc');
    expect(rotationSql).toContain(
      'recorded_play_count_30d desc, latest_recorded_play_at desc, track_id asc',
    );
    expect(rotationSql).toContain('limit 10');
    expect(source).not.toMatch(/rerankCurrentRotation|rotation.*diversity/i);
  });

  it('applies momentum noise controls, deterministic order, and separate five-item caps', () => {
    expect(momentumSql).toContain('where delta >= 2');
    expect(momentumSql).toContain('where delta <= -2 and previous_7_recorded_count >= 2');
    expect(momentumSql).toContain(
      'order by delta desc, current_7_recorded_count desc, artist_id asc',
    );
    expect(momentumSql).toContain(
      'order by delta asc, previous_7_recorded_count desc, artist_id asc',
    );
    expect(momentumSql.match(/limit 5/g)).toHaveLength(2);
  });

  it('keeps every Node-facing history query bounded or aggregated', () => {
    expect(source).toContain('.limit(10)');
    expect(source).toContain('select distinct on (time_range)');
    expect(source).not.toMatch(/\.select\(\)\s*\.from\(spotifyPlayHistory\)/);
  });

  it('adds no provider, enrichment, recommendation, randomization, or AI call', () => {
    expect(source).not.toMatch(
      /fetch\(|spotify\/client|reccobeats|enrichment|recommendation API|openai|Math\.random|order by random/i,
    );
  });
});
