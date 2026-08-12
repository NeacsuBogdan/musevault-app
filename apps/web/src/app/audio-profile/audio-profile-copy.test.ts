import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const source = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const buttonSource = readFileSync(
  new URL('../../components/audio-enrichment-button.tsx', import.meta.url),
  'utf8',
);
const normalizedSource = `${source} ${buttonSource}`.replace(/\s+/g, ' ');
const nav = readFileSync(
  new URL('../../features/dashboard/data/dashboard.ts', import.meta.url),
  'utf8',
);
describe('Audio Profile copy', () => {
  it('is real navigation with consent, provenance, coverage, library and listening states', () => {
    for (const text of [
      'Audio Profile',
      'ReccoBeats',
      'Spotify track identifiers are sent',
      'No Spotify token is sent',
      'requires no API key',
      'Enrich audio features',
      'Current saved-library audio profile',
      'Recorded listening audio profile',
      'Missing features are excluded, never treated as zero',
    ])
      expect(normalizedSource).toContain(text);
    const entry = nav.slice(
      nav.indexOf("label: 'Audio Profile'"),
      nav.indexOf("label: 'Audio Profile'") + 120,
    );
    expect(entry).not.toContain('Preview');
  });
  it('makes no unsupported claims', () => {
    for (const text of [
      'happy',
      'sad',
      'Spotify Audio Features',
      'recommendation',
      'paid provider',
    ])
      expect(source.toLowerCase()).not.toContain(text.toLowerCase());
  });
});
