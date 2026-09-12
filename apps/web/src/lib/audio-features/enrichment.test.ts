import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { ENRICHMENT_BATCHES_PER_REQUEST } from './enrichment';
import { AUDIO_FEATURE_BATCH_LIMIT, AUDIO_FEATURE_PROVIDER } from './provider';

const source = readFileSync(new URL('./enrichment.ts', import.meta.url), 'utf8');

describe('bounded enrichment architecture', () => {
  it('preserves the ReccoBeats provider and existing 20-by-3 server limits', () => {
    expect(AUDIO_FEATURE_PROVIDER).toBe('reccobeats');
    expect(AUDIO_FEATURE_BATCH_LIMIT).toBe(20);
    expect(ENRICHMENT_BATCHES_PER_REQUEST).toBe(3);
    expect(AUDIO_FEATURE_BATCH_LIMIT * ENRICHMENT_BATCHES_PER_REQUEST).toBe(60);
  });

  it('uses one sequential provider loop for both candidate scopes', () => {
    expect(source).toContain("candidateScope === 'saved_library'");
    expect(source).toContain('await getSavedEnrichmentCandidates(userId)');
    expect(source).toContain('await getEnrichmentCandidates(userId)');
    expect(source).toContain('await reccoBeatsProvider.loadForSpotifyTrackIds(ids)');
    expect(source).not.toMatch(/Promise\.all[\s\S]*loadForSpotifyTrackIds/);
  });
});
