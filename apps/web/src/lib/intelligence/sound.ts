import 'server-only';

import type {
  BoundedSoundFeature,
  CompleteBoundedSoundValues,
  SoundCoverageQuality,
  SoundDistanceCandidate,
  SoundDistanceReason,
  SoundDistribution,
  SoundProfileAvailability,
  SoundProfileCoverage,
} from './types';

export const BOUNDED_SOUND_FEATURES = [
  'acousticness',
  'danceability',
  'energy',
  'instrumentalness',
  'liveness',
  'speechiness',
  'valence',
] as const satisfies readonly BoundedSoundFeature[];

export const SOUND_EXPLANATION_FEATURE_ORDER = [
  'energy',
  'valence',
  'danceability',
  'acousticness',
  'instrumentalness',
  'liveness',
  'speechiness',
] as const satisfies readonly BoundedSoundFeature[];

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const normalizeCount = (value: number) =>
  Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;

export function calculateSoundProfileCoverage(
  currentSavedTrackCount: number,
  audioCoveredTrackCount: number,
): SoundProfileCoverage {
  const saved = normalizeCount(currentSavedTrackCount);
  const covered = Math.min(saved, normalizeCount(audioCoveredTrackCount));
  const exactCoveragePercent = saved === 0 ? null : (covered / saved) * 100;
  const audioCoveragePercent =
    exactCoveragePercent === null ? null : Math.round(exactCoveragePercent * 10) / 10;
  const profileAvailability: SoundProfileAvailability =
    covered === 0 ? 'NO_DATA' : covered < 20 ? 'LIMITED_SAMPLE' : 'PROFILE_AVAILABLE';
  let coverageQuality: SoundCoverageQuality;
  if (covered >= 200 && exactCoveragePercent !== null && exactCoveragePercent >= 60) {
    coverageQuality = 'HIGH';
  } else if (covered < 50 || exactCoveragePercent === null || exactCoveragePercent < 20) {
    coverageQuality = 'LOW';
  } else {
    coverageQuality = 'MEDIUM';
  }
  return {
    currentSavedTrackCount: saved,
    audioCoveredTrackCount: covered,
    audioCoveragePercent,
    profileAvailability,
    coverageQuality,
  };
}

export function calculateSoundDistribution(values: readonly number[]): SoundDistribution {
  const ordered = values.filter(Number.isFinite).toSorted((left, right) => left - right);
  const percentile = (fraction: number) => {
    if (ordered.length === 0) return null;
    const position = (ordered.length - 1) * fraction;
    const lowerIndex = Math.floor(position);
    const upperIndex = Math.ceil(position);
    const lower = ordered[lowerIndex]!;
    const upper = ordered[upperIndex]!;
    return lower + (upper - lower) * (position - lowerIndex);
  };
  return { p25: percentile(0.25), p50: percentile(0.5), p75: percentile(0.75) };
}

function isCompleteBoundedSoundValues(
  values: Partial<Record<BoundedSoundFeature, number | null | undefined>>,
): values is CompleteBoundedSoundValues {
  return BOUNDED_SOUND_FEATURES.every((feature) => {
    const value = values[feature];
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
  });
}

export function calculateSoundDistance(
  track: Partial<Record<BoundedSoundFeature, number | null | undefined>>,
  center: Partial<Record<BoundedSoundFeature, number | null | undefined>>,
): number | null {
  if (!isCompleteBoundedSoundValues(track) || !isCompleteBoundedSoundValues(center)) return null;
  const sumOfSquares = BOUNDED_SOUND_FEATURES.reduce((sum, feature) => {
    const difference = track[feature] - center[feature];
    return sum + difference * difference;
  }, 0);
  return Math.round(clamp(Math.sqrt(sumOfSquares / BOUNDED_SOUND_FEATURES.length) * 100, 0, 100));
}

export function buildSoundDistanceReasons(
  track: Partial<Record<BoundedSoundFeature, number | null | undefined>>,
  center: Partial<Record<BoundedSoundFeature, number | null | undefined>>,
  limit = 2,
): SoundDistanceReason[] {
  if (!isCompleteBoundedSoundValues(track) || !isCompleteBoundedSoundValues(center)) return [];
  const order = new Map(
    SOUND_EXPLANATION_FEATURE_ORDER.map((feature, index) => [feature, index] as const),
  );
  return SOUND_EXPLANATION_FEATURE_ORDER.map((feature) => ({
    feature,
    trackValue: track[feature],
    centerValue: center[feature],
    absoluteDifference: Math.abs(track[feature] - center[feature]),
  }))
    .sort(
      (left, right) =>
        right.absoluteDifference - left.absoluteDifference ||
        (order.get(left.feature) ?? 0) - (order.get(right.feature) ?? 0),
    )
    .slice(0, Math.max(0, Math.floor(limit)));
}

export function rankSonicOutliers<T extends SoundDistanceCandidate>(rows: readonly T[]): T[] {
  return [...rows]
    .sort(
      (left, right) =>
        right.soundDistance - left.soundDistance || compareTrackIds(left.trackId, right.trackId),
    )
    .slice(0, 10);
}

export function rankClosestToSoundCenter<T extends SoundDistanceCandidate>(
  rows: readonly T[],
): T[] {
  return [...rows]
    .sort(
      (left, right) =>
        left.soundDistance - right.soundDistance || compareTrackIds(left.trackId, right.trackId),
    )
    .slice(0, 5);
}

function compareTrackIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
