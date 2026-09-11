import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const repository = readFileSync(
  new URL('../../lib/db/repositories/listening-intelligence.ts', import.meta.url),
  'utf8',
);
const navigation = readFileSync(
  new URL('../../features/dashboard/data/dashboard.ts', import.meta.url),
  'utf8',
);

describe('Listening intelligence truthful presentation', () => {
  it('covers authorization, no-data, sync, pulse, rotation, momentum, recent plays, and affinity', () => {
    for (const copy of [
      'Enable listening intelligence',
      'No MuseVault-recorded listening yet',
      'Listening sync is in progress',
      'Listening Pulse',
      'Current Rotation',
      'Recorded Momentum',
      'Recent MuseVault-recorded plays',
      'Captured Spotify affinity',
    ])
      expect(source).toContain(copy);
  });

  it('states captured-history limitations and preserves unknown or unavailable states', () => {
    expect(source).toContain('MuseVault does not have complete Spotify listening history.');
    expect(source).toContain('missing events stay unknown');
    expect(source).toContain('percentage metrics');
    expect(source).toContain('unavailable rather than treated as 0%.');
    expect(source).toContain('Missing Spotify events remain unknown.');
  });

  it('renders successful-sync freshness and a restrained stale-data state', () => {
    expect(source).toContain('Last successful listening sync');
    expect(source).toContain('Listening data needs a refresh');
    expect(source).toContain(
      'Listening data has not been refreshed during the latest 7-day window',
    );
    expect(source).toContain(
      'Sync listening data to compare the latest 7 days with the previous 7-day window.',
    );
    expect(source).toContain('No successful listening sync was completed during the latest 7-day');
  });

  it('describes Rotation Score accurately without popularity or probability claims', () => {
    expect(source).toContain('bounded recency-and-frequency measure');
    expect(source).toContain('Spotify popularity or a probability');
    expect(source).toContain('Rotation Score {track.rotationScore}');
    expect(source).toContain('Evidence Level: {track.evidenceLevel}');
  });

  it('keeps captured Spotify affinity ranks separate from recorded play counts', () => {
    expect(source).toContain('affinity ranks remain separate from Rotation Score');
    expect(source).toContain('never presented as play counts');
    expect(source).toContain('Captured rank · artists');
    expect(source).toContain('Captured rank · tracks');
  });

  it.each([
    'You played this',
    'lifetime plays',
    'Lifetime listening',
    'Your favorite',
    'obsessed',
    'Your taste is changing',
    'stopped listening',
    'Your listening decreased',
    'recommendation probability',
  ])('does not make the unsupported claim %s', (claim) => expect(source).not.toContain(claim));

  it('renders only through the database repository and makes no provider call on GET', () => {
    expect(source).toContain('getListeningInsights');
    expect(source).not.toMatch(/fetch\(|spotify\/client|reccobeats|enrichment|recommendation API/);
    expect(repository).not.toMatch(
      /fetch\(|spotify\/client|reccobeats|enrichment|recommendation API/,
    );
  });

  it('keeps Current Rotation captured and does not add artificial diversity', () => {
    expect(source).toContain('MuseVault&apos;s recent captured rotation');
    expect(source).not.toMatch(/diversity|rerank/i);
  });

  it('keeps real navigation without a preview status', () => {
    expect(navigation).toContain("label: 'Listening Insights'");
    const entry = navigation.slice(
      navigation.indexOf("label: 'Listening Insights'"),
      navigation.indexOf("label: 'Listening Insights'") + 120,
    );
    expect(entry).not.toContain('Preview');
  });
});
