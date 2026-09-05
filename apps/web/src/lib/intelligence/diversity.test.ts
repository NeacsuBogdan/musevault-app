import { describe, expect, it } from 'vitest';

import {
  paginateRediscoverCandidates,
  REDISCOVER_CANDIDATE_POOL_SIZE,
  rerankRediscoverCandidates,
} from './diversity';

const item = (
  trackId: string,
  rediscoverScore: number,
  artistIds: string | string[],
  albumId = `album-${trackId}`,
) => ({
  trackId,
  rediscoverScore,
  artistIds: Array.isArray(artistIds) ? artistIds : [artistIds],
  albumId,
});

describe('deterministic Rediscover diversity reranking', () => {
  it('strongly discourages adjacent same-album tracks with near-equal scores', () => {
    const result = rerankRediscoverCandidates([
      item('shared-1', 91, 'artist-a', 'shared-album'),
      item('shared-2', 90, 'artist-b', 'shared-album'),
      item('other', 89, 'artist-c', 'other-album'),
    ]);
    expect(result.map(({ trackId }) => trackId)).toEqual(['shared-1', 'other', 'shared-2']);
  });

  it('penalizes a primary artist repeated inside the local window', () => {
    const result = rerankRediscoverCandidates([
      item('artist-1', 91, 'artist-a'),
      item('artist-2', 90, 'artist-a'),
      item('other', 89, 'artist-b'),
    ]);
    expect(result.map(({ trackId }) => trackId)).toEqual(['artist-1', 'other', 'artist-2']);
  });

  it('gives credited-artist collaborations mild rather than dominant pressure', () => {
    const materialLead = rerankRediscoverCandidates([
      item('first', 100, ['artist-a', 'guest']),
      item('collaboration', 96, ['artist-b', 'guest']),
      item('other', 89, 'artist-c'),
    ]);
    expect(materialLead[1]?.trackId).toBe('collaboration');

    const nearTie = rerankRediscoverCandidates([
      item('first', 100, ['artist-a', 'guest']),
      item('collaboration', 90, ['artist-b', 'guest']),
      item('other', 89, 'artist-c'),
    ]);
    expect(nearTie[1]?.trackId).toBe('other');
  });

  it('keeps materially higher relevance ahead of local artist and album pressure', () => {
    const result = rerankRediscoverCandidates([
      item('first', 100, 'artist-a', 'album-a'),
      item('repeat', 96, 'artist-a', 'album-a'),
      item('other', 80, 'artist-b', 'album-b'),
    ]);
    expect(result[1]?.trackId).toBe('repeat');
  });

  it('creates one global order before pagination and preserves diversity at a page boundary', () => {
    const candidates = [
      item('a', 100, 'artist-a', 'album-a'),
      item('b', 99, 'artist-b', 'album-b'),
      item('shared-1', 98, 'artist-c', 'shared-album'),
      item('shared-2', 97, 'artist-d', 'shared-album'),
      item('d', 96, 'artist-e', 'album-d'),
      item('e', 95, 'artist-f', 'album-e'),
    ];
    const globalOrder = rerankRediscoverCandidates(candidates);
    const pageOne = paginateRediscoverCandidates(candidates, 1, 3);
    const pageTwo = paginateRediscoverCandidates(candidates, 2, 3);
    expect([...pageOne, ...pageTwo]).toEqual(globalOrder);
    expect(pageOne.at(-1)?.albumId).not.toBe(pageTwo[0]?.albumId);
    expect(pageTwo[0]?.trackId).toBe('d');
  });

  it('resolves ties by track ID and returns the same ordering every time', () => {
    const candidates = [item('track-b', 80, 'artist-b'), item('track-a', 80, 'artist-a')];
    expect(rerankRediscoverCandidates(candidates).map(({ trackId }) => trackId)).toEqual([
      'track-a',
      'track-b',
    ]);
    expect(rerankRediscoverCandidates(candidates)).toEqual(rerankRediscoverCandidates(candidates));
  });

  it('rejects an unbounded whole-library pool', () => {
    const candidates = Array.from({ length: REDISCOVER_CANDIDATE_POOL_SIZE + 1 }, (_, index) =>
      item(`track-${index}`, 50, `artist-${index}`),
    );
    expect(() => rerankRediscoverCandidates(candidates)).toThrow(RangeError);
  });
});
