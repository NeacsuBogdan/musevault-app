import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const service = readFileSync(
  new URL('../../lib/music-evolution/service.ts', import.meta.url),
  'utf8',
);
const repository = readFileSync(
  new URL('../../lib/music-evolution/repository.ts', import.meta.url),
  'utf8',
);
const navigation = readFileSync(
  new URL('../../features/dashboard/data/dashboard.ts', import.meta.url),
  'utf8',
);

describe('Music Evolution route and truthful presentation', () => {
  it('renders the required route sections and all selectable periods', () => {
    for (const copy of [
      'Music Evolution',
      'Listening Shift',
      'Rotation Movement',
      'Artist Movement',
      'Currently saved tracks added in this period',
      'Sound Evolution',
      'Evidence and captured-history coverage',
      'EVOLUTION_PERIOD_DAYS',
      '/evolution?period=${period}',
    ])
      expect(source).toContain(copy);
  });

  it('keeps the captured-history disclosure and factual unavailable copy visible', () => {
    expect(source).toContain(
      'MuseVault compares captured listening, not your complete Spotify listening history.',
    );
    expect(source).toContain('This comparison needs more captured history');
    expect(source).toContain('Sound comparison unavailable');
    expect(source).toContain('Appeared only in the previous captured period');
    expect(repository).toContain('does not retain complete historical removal membership yet.');
  });

  it('uses semantic badge and neutral-delta presentations without changing active-period styling', () => {
    expect(source).toContain('getComparisonBadgePresentation');
    expect(source).toContain('getListeningDeltaPresentation');
    expect(source).toContain('getMovementDeltaPresentation');
    expect(source).not.toContain("Evidence Level: {snapshot.evidenceLevel ?? 'Unavailable'}");
    expect(source).toContain(
      'rounded-pill bg-accent-green px-4 py-2 text-body-sm font-semibold text-page',
    );
    expect(source).toContain('This comparison needs more captured history');
  });

  it.each([
    'You stopped listening',
    'Your taste changed',
    'library growth',
    'net library change',
    'complete save history',
    'happier',
    'sadder',
    'more aggressive',
  ])('does not make unsupported claim: %s', (claim) => {
    expect(source.toLowerCase()).not.toContain(claim.toLowerCase());
  });

  it('loads only the database service and contains no provider or enrichment side effect', () => {
    expect(source).toContain('getMusicEvolution');
    for (const implementation of [source, service, repository]) {
      expect(implementation).not.toMatch(
        /fetch\(|spotify\/client|reccobeats\.ts|triggerEnrichment/i,
      );
    }
  });

  it('publishes Music Evolution as real navigation without a preview status', () => {
    const entry = navigation.slice(
      navigation.indexOf("label: 'Music Evolution'"),
      navigation.indexOf("label: 'Music Evolution'") + 140,
    );
    expect(entry).toContain("href: '/evolution'");
    expect(entry).not.toContain('Preview');
  });
});
