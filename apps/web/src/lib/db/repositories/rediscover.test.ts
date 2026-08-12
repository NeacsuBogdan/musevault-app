import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  calculateRediscoverScore,
  normalizeRediscoverPage,
  REDISCOVER_PAGE_SIZE,
} from './rediscover';

const now = new Date('2026-08-12T12:00:00.000Z');
const ago = (value: number, unit: 'days' | 'years') => {
  const date = new Date(now);
  if (unit === 'days') date.setUTCDate(date.getUTCDate() - value);
  else date.setUTCFullYear(date.getUTCFullYear() - value);
  return date;
};
const score = (
  savedAt: Date,
  overrides: Partial<Parameters<typeof calculateRediscoverScore>[0]> = {},
) =>
  calculateRediscoverScore({
    savedAt,
    now,
    recordedPlayCount: 0,
    latestRecordedPlayAt: null,
    mediumTerm: false,
    longTerm: false,
    ...overrides,
  });

describe('Rediscover score', () => {
  it.each([
    [90, 'days', 8],
    [180, 'days', 16],
    [1, 'years', 24],
    [2, 'years', 32],
    [3, 'years', 40],
    [5, 'years', 50],
  ] as const)('scores the %s %s saved-age boundary', (value, unit, expected) => {
    expect(score(ago(value, unit))).toBe(expected);
  });

  it('applies recorded-play recency and repeated-play penalties', () => {
    expect(
      score(ago(2, 'years'), { recordedPlayCount: 2, latestRecordedPlayAt: ago(30, 'days') }),
    ).toBe(3);
    expect(
      score(ago(2, 'years'), { recordedPlayCount: 2, latestRecordedPlayAt: ago(90, 'days') }),
    ).toBe(13);
    expect(
      score(ago(2, 'years'), { recordedPlayCount: 2, latestRecordedPlayAt: ago(91, 'days') }),
    ).toBe(23);
  });

  it('caps repeated plays at 20 points and combines affinity penalties', () => {
    expect(
      score(ago(5, 'years'), {
        recordedPlayCount: 100,
        latestRecordedPlayAt: ago(100, 'days'),
        mediumTerm: true,
        longTerm: true,
      }),
    ).toBe(2);
  });

  it('gives no bonus for missing history and has no audio-feature input', () => {
    expect(score(ago(1, 'years'))).toBe(24);
    expect(calculateRediscoverScore.length).toBe(1);
  });
});

describe('Rediscover pagination', () => {
  it('uses a fixed maximum of 20 results', () => expect(REDISCOVER_PAGE_SIZE).toBe(20));
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

describe('Rediscover SQL contract', () => {
  const source = readFileSync(new URL('./rediscover.ts', import.meta.url), 'utf8');

  it('uses current memberships, the 90-day boundary, and positive activity exclusions', () => {
    expect(source).toContain('from user_saved_tracks ust');
    expect(source).toContain("interval '90 days'");
    expect(source).toContain("interval '7 days'");
    expect(source).toContain('and not short_term');
    expect(source).toContain("eq(spotifyLibrarySyncs.status, 'completed')");
    expect(source).toContain("eq(spotifyLibrarySyncs.status, 'running')");
    expect(source).toContain("return base('sync_in_progress')");
    expect(source).toContain("return base('sync_required')");
  });

  it('uses only latest affinity snapshots and deterministic ordering', () => {
    expect(source).toContain('select distinct on (time_range)');
    expect(source).toContain('snapshot_date desc, captured_at desc, id desc');
    expect(source).toContain('order by s.rediscover_score desc, s.saved_at asc, t.id asc');
    expect(source).toContain('jsonb_agg(ar.name order by ta.position)');
  });

  it('bounds SQL pagination and contains no provider integration', () => {
    expect(source).toContain('limit ${REDISCOVER_PAGE_SIZE} offset ${offset}');
    expect(source).not.toMatch(/spotify\/client|reccobeats|enrichment|recommendation|Math\.random/);
  });
});
