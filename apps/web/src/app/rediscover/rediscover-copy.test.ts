import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');

describe('Rediscover truthful presentation', () => {
  it('uses explicit MuseVault-recorded terminology and the incomplete-history disclosure', () => {
    expect(source).toContain('Latest MuseVault-recorded play:');
    expect(source).toContain('MuseVault does not have complete Spotify listening history.');
    expect(source).toContain('Missing recorded plays or');
    expect(source).toContain('affinity snapshots remain unknown and do not add relevance.');
  });

  it.each([
    'Never listened',
    'Unplayed',
    'Forgotten',
    'probability',
    '% chance',
    "haven't listened",
    'Last played on Spotify',
  ])('does not claim %s', (claim) => expect(source).not.toContain(claim));

  it('safely presents artwork, Spotify links, saved dates, and bounded score labels', () => {
    expect(source).toContain("url.hostname === 'i.scdn.co'");
    expect(source).toContain("url.hostname === 'open.spotify.com'");
    expect(source).toContain('Saved {dateFormatter.format');
    expect(source).toContain('Rediscover Score {candidate.rediscoverScore}');
    expect(source).toContain('Evidence Level: {candidate.evidenceLevel}');
    expect(source).not.toContain('candidate.vaultDepth');
    expect(source).not.toContain('candidate.scoreComponents');
  });

  it('explains the v2 signals and diversity behavior without exposing weights', () => {
    expect(source).toContain('How Rediscover works');
    expect(source).toContain('library age, MuseVault-recorded listening, and captured Spotify');
    expect(source).toContain('one artist or album does not dominate');
    expect(source).toContain('Rediscover Score measures surfacing relevance.');
    expect(source).toContain('track-specific and contextual evidence.');
    expect(source).toContain('changing a track&apos;s raw score.');
    expect(source).not.toMatch(/weight|penalty/i);
  });

  it('renders only through the database repository and contains no provider client', () => {
    expect(source).toContain('getRediscoverSnapshot');
    expect(source).not.toMatch(/spotify\/client|reccobeats|enrichment|recommendation API/);
  });
});
