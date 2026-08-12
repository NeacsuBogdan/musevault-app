import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');

describe('Rediscover truthful presentation', () => {
  it('uses explicit MuseVault-recorded terminology and the product disclosure', () => {
    expect(source).toContain('No play recorded by MuseVault yet');
    expect(source).toContain('Latest MuseVault-recorded play:');
    expect(source).toContain('Missing recorded plays are not treated as proof');
    expect(source).toContain('This only refers to MuseVault&apos;s recorded listening history.');
  });

  it.each([
    'Never listened',
    'Unplayed',
    'Forgotten',
    "haven't listened",
    'Last played on Spotify',
  ])('does not claim %s', (claim) => expect(source).not.toContain(claim));

  it('safely presents artwork, Spotify links, saved dates, and affinity reasons', () => {
    expect(source).toContain("url.hostname === 'i.scdn.co'");
    expect(source).toContain("url.hostname === 'open.spotify.com'");
    expect(source).toContain('Saved {dateFormatter.format');
    expect(source).toContain('In medium-term Spotify affinity');
    expect(source).toContain('In long-term Spotify affinity');
  });

  it('renders only through the database repository and contains no provider client', () => {
    expect(source).toContain('getRediscoverSnapshot');
    expect(source).not.toMatch(/spotify\/client|reccobeats|enrichment|recommendation API/);
  });
});
