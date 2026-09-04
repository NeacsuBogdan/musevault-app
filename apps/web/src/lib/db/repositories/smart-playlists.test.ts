import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { smartPlaylistSummaryFromRow } from './smart-playlists';

const source = fs.readFileSync(new URL('./smart-playlists.ts', import.meta.url), 'utf8');

describe('smart playlist SQL and provider contract', () => {
  it('preserves real library and coverage context while forcing invalid-definition preview metrics to zero', () => {
    expect(
      smartPlaylistSummaryFromRow(
        { current_count: 2942, audio_count: 67, matching_count: 999 },
        false,
      ),
    ).toEqual({
      currentSavedTrackCount: 2942,
      audioFeatureCount: 67,
      coveragePercentage: (67 / 2942) * 100,
      matchingTrackCount: 0,
      previewTrackCount: 0,
      previewDurationMs: 0,
    });
  });

  it('does not put invalid bounds in SQL and returns before the preview-track query', () => {
    expect(source).toContain(
      "parsed.kind === 'definition' ? smartPlaylistFilterSql(parsed.definition) : sql``",
    );
    expect(source).toContain("parsed.kind === 'invalid_definition' ? sql`false`");
    expect(source.indexOf("return { ...base('invalid_definition'), summary }")).toBeLessThan(
      source.indexOf('const trackResult'),
    );
  });

  it('uses the current membership, cached ReccoBeats available rows, inclusive bounds, AND filters, SQL limits, and ordered artist aggregation', () => {
    expect(source).toContain('from user_saved_tracks');
    expect(source).toContain("af.provider='reccobeats'");
    expect(source).toContain("af.status='available'");
    expect(source).toContain('>= ${min}');
    expect(source).toContain('<= ${max}');
    expect(source).toContain('sql.join(conditions, sql` and `)');
    expect(source).toContain('limit ${parsed.definition.limit}');
    expect(source).toContain('jsonb_agg(ar.name order by ta.position)');
  });
  it('requires and locks a completed full baseline and pauses during a running full sync', () => {
    expect(source).toContain('pg_advisory_xact_lock');
    expect(source).toContain("eq(spotifyLibrarySyncs.syncKind, 'full')");
    expect(source).toContain("eq(spotifyLibrarySyncs.status, 'running')");
    expect(source).toContain("eq(spotifyLibrarySyncs.status, 'completed')");
  });
  it('contains no provider, enrichment, recommendation, randomization, or Spotify write client', () => {
    expect(source).not.toMatch(
      /fetch\(|Math\.random|order by random|spotify\/client|reccobeats\.ts|enrichment\.ts|recommendation/i,
    );
  });
});
