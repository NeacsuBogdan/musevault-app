import 'server-only';

import type { DiversityCandidate } from './types';

export const REDISCOVER_CANDIDATE_POOL_SIZE = 120;

const LOCAL_DIVERSITY_WINDOW = 4;

function repeatedPrimaryArtistPenalty(
  candidate: DiversityCandidate,
  artistCounts: Map<string, number>,
) {
  const primaryArtist = candidate.artistIds[0];
  const repeats = primaryArtist ? (artistCounts.get(primaryArtist) ?? 0) : 0;
  return Math.min(repeats, 3);
}

function repeatedCreditedArtistPenalty(
  candidate: DiversityCandidate,
  artistCounts: Map<string, number>,
) {
  const repeats = candidate.artistIds
    .slice(1)
    .reduce((highest, artistId) => Math.max(highest, artistCounts.get(artistId) ?? 0), 0);
  return Math.min(repeats, 2);
}

function repeatedAlbumPenalty(candidate: DiversityCandidate, albumCounts: Map<string, number>) {
  const repeats = albumCounts.get(candidate.albumId) ?? 0;
  return Math.min(repeats, 3);
}

function recentSequencePenalty(
  candidate: DiversityCandidate,
  selected: readonly DiversityCandidate[],
) {
  const recent = selected.slice(-LOCAL_DIVERSITY_WINDOW);
  const previous = recent.at(-1);
  const primaryArtist = candidate.artistIds[0];
  const secondaryArtists = candidate.artistIds.slice(1);
  const albumPenalty =
    previous?.albumId === candidate.albumId
      ? 6
      : recent.some(({ albumId }) => albumId === candidate.albumId)
        ? 4
        : 0;
  const primaryArtistPenalty = !primaryArtist
    ? 0
    : previous?.artistIds.includes(primaryArtist)
      ? 4
      : recent.some(({ artistIds }) => artistIds.includes(primaryArtist))
        ? 3
        : 0;
  const creditedArtistPenalty = secondaryArtists.length
    ? secondaryArtists.some((artistId) => previous?.artistIds.includes(artistId))
      ? 2
      : secondaryArtists.some((artistId) =>
            recent.some(({ artistIds }) => artistIds.includes(artistId)),
          )
        ? 1
        : 0
    : 0;
  return albumPenalty + primaryArtistPenalty + creditedArtistPenalty;
}

function compareTrackIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Selects from a bounded, score-sorted pool. Relevance remains dominant while total repetition and
 * repetition within the last four selections receive capped penalties. Same-album adjacency has
 * the strongest local pressure, and credited collaborators receive only a mild penalty. Equal
 * adjusted scores resolve by raw score and then track ID.
 */
export function rerankRediscoverCandidates<T extends DiversityCandidate>(
  candidates: readonly T[],
  limit = candidates.length,
): T[] {
  if (candidates.length > REDISCOVER_CANDIDATE_POOL_SIZE) {
    throw new RangeError(
      `Rediscover reranking accepts at most ${REDISCOVER_CANDIDATE_POOL_SIZE} candidates.`,
    );
  }
  const remaining = [...candidates];
  const selected: T[] = [];
  const artistCounts = new Map<string, number>();
  const albumCounts = new Map<string, number>();

  while (remaining.length && selected.length < Math.max(0, limit)) {
    remaining.sort((left, right) => {
      const adjusted = (candidate: T) =>
        candidate.rediscoverScore -
        repeatedPrimaryArtistPenalty(candidate, artistCounts) -
        repeatedCreditedArtistPenalty(candidate, artistCounts) -
        repeatedAlbumPenalty(candidate, albumCounts) -
        recentSequencePenalty(candidate, selected);
      return (
        adjusted(right) - adjusted(left) ||
        right.rediscoverScore - left.rediscoverScore ||
        compareTrackIds(left.trackId, right.trackId)
      );
    });
    const next = remaining.shift();
    if (!next) break;
    selected.push(next);
    albumCounts.set(next.albumId, (albumCounts.get(next.albumId) ?? 0) + 1);
    for (const artistId of new Set(next.artistIds)) {
      artistCounts.set(artistId, (artistCounts.get(artistId) ?? 0) + 1);
    }
  }

  return selected;
}

export function paginateRediscoverCandidates<T extends DiversityCandidate>(
  candidates: readonly T[],
  page: number,
  pageSize: number,
): T[] {
  const globallyReranked = rerankRediscoverCandidates(candidates);
  const offset = (Math.max(1, Math.floor(page)) - 1) * Math.max(1, Math.floor(pageSize));
  return globallyReranked.slice(offset, offset + Math.max(1, Math.floor(pageSize)));
}
