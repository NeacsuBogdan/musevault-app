import { describe, expect, it } from 'vitest';
import { ENRICHMENT_REQUEST_LIMIT, prioritizeCandidateTrackIds } from './audio-profile';

describe('audio enrichment candidate priority', () => {
  it('deduplicates recent, affinity, saved, and older-history tiers in priority order', () => {
    expect(
      prioritizeCandidateTrackIds([
        [{ id: 'recent-2' }, { id: 'shared' }],
        [{ id: 'top-1' }, { id: 'shared' }],
        [{ id: 'saved-1' }, { id: 'top-1' }],
        [{ id: 'older-1' }, { id: 'recent-2' }],
      ]),
    ).toEqual(['recent-2', 'shared', 'top-1', 'saved-1', 'older-1']);
  });

  it('bounds every POST candidate set at 60', () => {
    const ids = prioritizeCandidateTrackIds([
      Array.from({ length: 100 }, (_, index) => ({ id: `track-${index}` })),
    ]);
    expect(ids).toHaveLength(ENRICHMENT_REQUEST_LIMIT);
  });
});
