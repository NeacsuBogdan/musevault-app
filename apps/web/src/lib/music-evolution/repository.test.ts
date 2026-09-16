import { readFileSync } from 'node:fs';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { buildEvolutionPeriodComparison } from './periods';
import {
  buildArtistMovementQuery,
  buildCapturedSoundQuery,
  buildCurrentLibraryAdditionsQuery,
  buildEvolutionHistoryQuery,
  buildListeningShiftQuery,
  buildTrackMovementQuery,
  CURRENT_LIBRARY_ADDITIONS_DISCLOSURE,
} from './repository';

const dialect = new PgDialect();
const period = buildEvolutionPeriodComparison(7, new Date('2026-09-17T12:00:00.000Z'));
const compile = (query: ReturnType<typeof buildEvolutionHistoryQuery>) => dialect.sqlToQuery(query);
const source = readFileSync(new URL('./repository.ts', import.meta.url), 'utf8');
const serviceSource = readFileSync(new URL('./service.ts', import.meta.url), 'utf8');

describe('Music Evolution PostgreSQL period contracts', () => {
  it('binds exact half-open current and previous boundaries', () => {
    const query = compile(buildEvolutionHistoryQuery('user-id', period));
    expect(query.sql).toContain('history.played_at >=');
    expect(query.sql).toContain('history.played_at <');
    expect(query.params).toContainEqual(period.current.start);
    expect(query.params).toContainEqual(period.current.end);
    expect(query.params).toContainEqual(period.previous.start);
    expect(query.params).toContainEqual(period.previous.end);
  });

  it('selects only the latest completed listening sync deterministically', () => {
    const query = compile(buildEvolutionHistoryQuery('user-id', period)).sql;
    expect(query).toContain("status = 'completed'");
    expect(query).toContain('completed_at is not null');
    expect(query).toContain('order by completed_at desc, started_at desc, id desc');
  });
});

describe('Music Evolution DB-first aggregation', () => {
  const listening = compile(buildListeningShiftQuery('user-id', period)).sql;
  const tracks = compile(buildTrackMovementQuery('user-id', period)).sql;
  const artists = compile(buildArtistMovementQuery('user-id', period)).sql;
  const additions = compile(buildCurrentLibraryAdditionsQuery('user-id', period)).sql;
  const sound = compile(buildCapturedSoundQuery('user-id', period)).sql;

  it('counts listening events before artist joins and separates all-credit uniqueness from primary concentration', () => {
    expect(listening).toContain('count(*)::int as captured_play_count');
    expect(listening).toContain('count(distinct credit.artist_id)::int as unique_artist_count');
    expect(listening).toContain('credit.position = 0');
    expect(listening).toContain('repeated_track_event_count');
    expect(listening).toContain('top_five_track_event_count');
    expect(listening).toContain('top_five_primary_artist_event_count');
  });

  it('implements track movement thresholds, deterministic order, and four five-item caps', () => {
    expect(tracks).toContain('current_captured_count > 0 and previous_captured_count = 0');
    expect(tracks).toContain('current_captured_count = 0 and previous_captured_count > 0');
    expect(tracks).toContain('delta >= 2');
    expect(tracks).toContain('previous_captured_count >= 2 and delta <= -2');
    expect(tracks).toContain('order by delta desc, current_captured_count desc, track_id asc');
    expect(tracks).toContain('order by delta asc, previous_captured_count desc, track_id asc');
    expect(tracks.match(/limit 5/g)).toHaveLength(4);
    expect(tracks).toContain('album.image_url as album_image_url');
  });

  it('assigns every artist event through primary credit and applies the same bounded movement rules', () => {
    expect(artists).toContain('credit.position = 0');
    expect(artists).toContain('group by artist_id');
    expect(artists).toContain('order by delta desc, current_captured_count desc, artist_id asc');
    expect(artists).toContain('order by delta asc, previous_captured_count desc, artist_id asc');
    expect(artists.match(/limit 5/g)).toHaveLength(4);
    expect(artists).not.toContain('spotify_top_item_snapshots');
  });

  it('uses only current saved membership, half-open saved timestamps, and deterministic examples', () => {
    expect(additions).toContain('join user_saved_tracks saved');
    expect(additions).toContain('saved.saved_at >= windows.start_at');
    expect(additions).toContain('saved.saved_at < windows.end_at');
    expect(additions).toContain('order by saved.saved_at desc, saved.track_id asc');
    expect(additions).toContain('where ranked.rank <= 5');
    expect(CURRENT_LIBRARY_ADDITIONS_DISCLOSURE).toContain('current saved membership');
    expect(CURRENT_LIBRARY_ADDITIONS_DISCLOSURE).toContain(
      'does not retain complete historical removal membership',
    );
  });

  it('computes play-weighted seven-feature means and separate coverage without tempo or loudness', () => {
    expect(sound).toContain('join spotify_play_history history');
    expect(sound).toContain("features.status = 'available'");
    expect(sound.match(/avg\(/g)).toHaveLength(7);
    expect(sound).not.toContain('avg(tempo)');
    expect(sound).not.toContain('avg(loudness)');
    expect(sound).not.toContain('coalesce(features.');
    expect(sound).toContain('count(*) filter (where covered)');
    expect(sound).toContain('count(distinct track_id) filter (where covered)');
  });

  it('keeps application processing bounded and provider-free', () => {
    expect(source).not.toMatch(/fetch\(|spotify\/client|reccobeats\.ts|enrichment|Math\.random/i);
    expect(serviceSource).not.toMatch(/fetch\(|spotify\/client|reccobeats|enrichment/i);
    expect(serviceSource).toContain('if (!availability.available)');
    expect(source).not.toMatch(/\.select\(\)\s*\.from\(spotifyPlayHistory\)/);
  });
});
