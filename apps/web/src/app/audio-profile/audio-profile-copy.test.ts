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

describe('Audio Profile v2 copy and state contracts', () => {
  it('names the coverage-aware profile sections and preserves explicit enrichment', () => {
    for (const text of [
      'Audio Profile',
      'Current saved-library coverage',
      'Sound Center',
      'Feature distribution',
      'Sonic Outliers',
      'Closest to Sound Center',
      'Sound Distance',
      'Enrich audio features',
      "method: 'POST'",
    ])
      expect(normalizedSource).toContain(text);
  });

  it('discloses provider provenance and the low-coverage limitation', () => {
    for (const text of [
      'ReccoBeats',
      'Only when you choose enrichment',
      'Spotify track identifiers',
      'No Spotify token is sent',
      'requires no API key',
      'This profile is based on the enriched portion of your saved library and may not represent the full library yet.',
    ])
      expect(normalizedSource).toContain(text);
  });

  it('keeps empty, limited, available, missing-distance, and failed-enrichment states truthful', () => {
    for (const text of [
      'No current saved tracks',
      'No saved-library audio coverage yet',
      'LIMITED SAMPLE',
      'become available at 20 covered tracks',
      'Sound Distance is not available',
      'Missing values are never substituted',
      'latest explicit enrichment attempt did not complete',
      'Method and coverage',
      'Tempo and loudness remain descriptive',
      'excluded because they use native scales',
      'Low coverage',
      'Medium coverage',
      'High coverage',
      'percentage-point difference',
      'vs',
      'Closest to the median sound profile of your currently covered saved tracks',
    ])
      expect(normalizedSource).toContain(text);
  });

  it('avoids unsupported interpretations and competing branded scores', () => {
    expect(normalizedSource).toContain('does not infer mood, genre, or listening behavior');
    for (const text of [
      'Audio Score',
      'Outlier Score',
      'Taste Score',
      'Spotify Audio Features',
      'recommendation',
      'representative tracks',
      'average taste',
      'definitive library sound',
      'uniqueness',
      'popularity',
      'probability',
      'happy track',
      'sad track',
    ])
      expect(normalizedSource.toLowerCase()).not.toContain(text.toLowerCase());
  });

  it('keeps Audio Profile available as real navigation', () => {
    const entry = nav.slice(
      nav.indexOf("label: 'Audio Profile'"),
      nav.indexOf("label: 'Audio Profile'") + 120,
    );
    expect(entry).not.toContain('Preview');
  });
});
