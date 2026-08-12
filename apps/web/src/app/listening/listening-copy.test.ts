import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const source = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const navigation = readFileSync(
  new URL('../../features/dashboard/data/dashboard.ts', import.meta.url),
  'utf8',
);

describe('Listening Insights product copy', () => {
  it('covers authorization, no-data, sync, real data, coverage, and separated affinity states', () => {
    for (const copy of [
      'Enable listening insights',
      'No listening history recorded yet',
      'Listening sync is in progress',
      'Recorded plays',
      'History recorded from',
      'Latest recorded play',
      'Unknown history is not counted as zero',
      'Spotify affinity',
      'shown separately from MuseVault recorded play counts',
    ])
      expect(source).toContain(copy);
  });
  it('avoids unsupported intelligence and complete-history claims', () => {
    for (const copy of ['complete Spotify history', 'Lifetime listening', 'BPM', 'mood', 'energy'])
      expect(source).not.toContain(copy);
  });
  it('adds real navigation without a preview status', () => {
    expect(navigation).toContain("label: 'Listening Insights'");
    const entry = navigation.slice(
      navigation.indexOf("label: 'Listening Insights'"),
      navigation.indexOf("label: 'Listening Insights'") + 120,
    );
    expect(entry).not.toContain('Preview');
  });
});
