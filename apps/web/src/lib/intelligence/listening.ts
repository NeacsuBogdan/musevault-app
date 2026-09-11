import 'server-only';

import { MILLISECONDS_PER_DAY } from './signals';
import type {
  EvidenceLevel,
  ListeningComparisonWindow,
  ListeningFreshnessState,
  ListeningWindowBoundaries,
  ListeningWindowSignals,
  RecordedMomentum,
  RecordedMomentumInput,
  RotationExplanation,
  RotationIntelligence,
  RotationScoreComponent,
  RotationSignals,
} from './types';

const RECENCY_ANCHORS = [
  [0, 55],
  [1, 52],
  [3, 46],
  [7, 36],
  [14, 24],
  [30, 0],
] as const;

const FREQUENCY_30_ANCHORS = [
  [0, 0],
  [1, 5],
  [2, 9],
  [3, 12],
  [5, 16],
  [8, 20],
  [12, 25],
] as const;

const FREQUENCY_7_ANCHORS = [
  [0, 0],
  [1, 5],
  [2, 9],
  [3, 12],
  [5, 16],
  [8, 20],
] as const;

function count(value: number): number {
  return Math.max(0, Math.floor(value));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

function interpolate(value: number, anchors: readonly (readonly [number, number])[]): number {
  const first = anchors[0];
  const last = anchors.at(-1);
  if (!first || !last || !Number.isFinite(value)) return 0;
  if (value <= first[0]) return first[1];
  if (value >= last[0]) return last[1];

  for (let index = 1; index < anchors.length; index += 1) {
    const lower = anchors[index - 1];
    const upper = anchors[index];
    if (!lower || !upper || value > upper[0]) continue;
    const progress = (value - lower[0]) / (upper[0] - lower[0]);
    return Math.round(lower[1] + progress * (upper[1] - lower[1]));
  }

  return last[1];
}

/** All listening windows are half-open, so events at `now` are not yet classified. */
export function buildListeningWindowBoundaries(now: Date): ListeningWindowBoundaries {
  const timestamp = now.getTime();
  return {
    now: new Date(timestamp),
    current7StartedAt: new Date(timestamp - 7 * MILLISECONDS_PER_DAY),
    previous7StartedAt: new Date(timestamp - 14 * MILLISECONDS_PER_DAY),
    current30StartedAt: new Date(timestamp - 30 * MILLISECONDS_PER_DAY),
  };
}

/**
 * Classifies the disjoint comparison windows first. `current30_only` is the remainder of current30.
 */
export function classifyListeningWindow(
  playedAt: Date,
  boundaries: ListeningWindowBoundaries,
): ListeningComparisonWindow {
  const timestamp = playedAt.getTime();
  if (timestamp >= boundaries.now.getTime()) return null;
  if (timestamp >= boundaries.current7StartedAt.getTime()) return 'current7';
  if (timestamp >= boundaries.previous7StartedAt.getTime()) return 'previous7';
  if (timestamp >= boundaries.current30StartedAt.getTime()) return 'current30_only';
  return null;
}

export function collectListeningWindowSignals(input: {
  current7RecordedCount: number;
  previous7RecordedCount: number;
  current30RecordedCount: number;
}): ListeningWindowSignals {
  return {
    current7RecordedCount: count(input.current7RecordedCount),
    previous7RecordedCount: count(input.previous7RecordedCount),
    current30RecordedCount: count(input.current30RecordedCount),
  };
}

/** A successful persisted sync, not the newest play event, is authoritative for freshness. */
export function calculateListeningFreshness(
  latestSuccessfulListeningSyncAt: Date | null,
  now: Date,
): ListeningFreshnessState {
  if (!latestSuccessfulListeningSyncAt) return 'never_synced';
  const refreshedAt = latestSuccessfulListeningSyncAt.getTime();
  const current7StartedAt = now.getTime() - 7 * MILLISECONDS_PER_DAY;
  return refreshedAt >= current7StartedAt && refreshedAt < now.getTime()
    ? 'refreshed_within_current7'
    : 'stale_for_current7';
}

export function collectRotationSignals(input: {
  latestRecordedPlayAt: Date | null;
  recordedPlayCount7d: number;
  recordedPlayCount30d: number;
  activeRecordedDays30d: number;
  recordedCoverageStartedAt: Date | null;
}): RotationSignals {
  return {
    latestRecordedPlayAt: input.latestRecordedPlayAt,
    recordedPlayCount7d: count(input.recordedPlayCount7d),
    recordedPlayCount30d: count(input.recordedPlayCount30d),
    activeRecordedDays30d: count(input.activeRecordedDays30d),
    recordedCoverageStartedAt: input.recordedCoverageStartedAt,
  };
}

export function calculateRotationRecency(elapsedDays: number | null): number {
  if (elapsedDays === null) return 0;
  return clamp(interpolate(Math.max(0, elapsedDays), RECENCY_ANCHORS), 0, 55);
}

export function calculateRotationFrequency30(recordedPlayCount: number): number {
  return clamp(interpolate(count(recordedPlayCount), FREQUENCY_30_ANCHORS), 0, 25);
}

export function calculateRotationFrequency7(recordedPlayCount: number): number {
  return clamp(interpolate(count(recordedPlayCount), FREQUENCY_7_ANCHORS), 0, 20);
}

/** Evidence depends on repeated, track-specific events; global coverage alone never makes it High. */
export function calculateRotationEvidenceLevel(signals: RotationSignals): EvidenceLevel {
  if (signals.recordedPlayCount30d >= 6 && signals.activeRecordedDays30d >= 3) return 'high';
  if (signals.recordedPlayCount30d >= 2 || signals.activeRecordedDays30d >= 2) return 'medium';
  return 'low';
}

export function buildRotationExplanation(
  signals: RotationSignals,
  now: Date,
): RotationExplanation | null {
  if (!signals.latestRecordedPlayAt || signals.recordedPlayCount30d === 0) return null;
  if (signals.recordedPlayCount7d >= 2) {
    return {
      code: 'recorded_frequency_7d',
      text: `${signals.recordedPlayCount7d} MuseVault-recorded plays in the last 7 days`,
      evidenceSource: 'recorded_listening',
    };
  }
  const elapsedDays = Math.max(
    0,
    (now.getTime() - signals.latestRecordedPlayAt.getTime()) / MILLISECONDS_PER_DAY,
  );
  if (elapsedDays < 1) {
    return {
      code: 'latest_recorded_play_today',
      text: 'Latest MuseVault-recorded play was today',
      evidenceSource: 'recorded_listening',
    };
  }
  if (signals.activeRecordedDays30d >= 3) {
    return {
      code: 'recorded_presence_days',
      text: `Present on ${signals.activeRecordedDays30d} days in the recent recorded window`,
      evidenceSource: 'recorded_listening',
    };
  }
  return {
    code: 'recorded_frequency_30d',
    text: `${signals.recordedPlayCount30d} MuseVault-recorded ${signals.recordedPlayCount30d === 1 ? 'play' : 'plays'} in the last 30 days`,
    evidenceSource: 'recorded_listening',
  };
}

export function calculateRotationIntelligence(
  signals: RotationSignals,
  now: Date,
): RotationIntelligence {
  const elapsedDays = signals.latestRecordedPlayAt
    ? Math.max(0, (now.getTime() - signals.latestRecordedPlayAt.getTime()) / MILLISECONDS_PER_DAY)
    : null;
  const components: RotationScoreComponent[] = [
    { key: 'recency', value: calculateRotationRecency(elapsedDays), range: [0, 55] },
    {
      key: 'frequency_30d',
      value: calculateRotationFrequency30(signals.recordedPlayCount30d),
      range: [0, 25],
    },
    {
      key: 'frequency_7d',
      value: calculateRotationFrequency7(signals.recordedPlayCount7d),
      range: [0, 20],
    },
  ];
  return {
    rotationScore: clamp(
      components.reduce((total, component) => total + component.value, 0),
      0,
      100,
    ),
    scoreComponents: components,
    evidenceLevel: calculateRotationEvidenceLevel(signals),
    explanation: buildRotationExplanation(signals, now),
  };
}

export function calculateRecordedShare(numerator: number, denominator: number): number | null {
  const safeDenominator = count(denominator);
  if (safeDenominator === 0) return null;
  return clamp((count(numerator) / safeDenominator) * 100, 0, 100);
}

export function calculateRepeatIntensity(trackRecordedCounts: number[]): number | null {
  const counts = trackRecordedCounts.map(count);
  const denominator = counts.reduce((total, value) => total + value, 0);
  const numerator = counts.filter((value) => value >= 2).reduce((total, value) => total + value, 0);
  return calculateRecordedShare(numerator, denominator);
}

export function calculateTopTrackConcentration(trackRecordedCounts: number[]): number | null {
  const counts = trackRecordedCounts.map(count).sort((left, right) => right - left);
  const denominator = counts.reduce((total, value) => total + value, 0);
  const numerator = counts.slice(0, 5).reduce((total, value) => total + value, 0);
  return calculateRecordedShare(numerator, denominator);
}

export function calculateRecordedMomentum(
  rows: RecordedMomentumInput[],
  coverageStartedAt: Date | null,
  freshnessState: ListeningFreshnessState,
  now: Date,
): RecordedMomentum {
  if (
    !coverageStartedAt ||
    now.getTime() - coverageStartedAt.getTime() < 14 * MILLISECONDS_PER_DAY
  ) {
    return { state: 'insufficient_coverage', increased: [], decreased: [] };
  }
  if (freshnessState !== 'refreshed_within_current7') {
    return { state: 'stale_data', increased: [], decreased: [] };
  }

  const changes = rows.map((row) => ({
    ...row,
    current7RecordedCount: count(row.current7RecordedCount),
    previous7RecordedCount: count(row.previous7RecordedCount),
    delta: count(row.current7RecordedCount) - count(row.previous7RecordedCount),
  }));
  const increased = changes
    .filter((item) => item.delta >= 2)
    .sort(
      (left, right) =>
        right.delta - left.delta ||
        right.current7RecordedCount - left.current7RecordedCount ||
        left.artistId.localeCompare(right.artistId),
    )
    .slice(0, 5);
  const decreased = changes
    .filter((item) => item.delta <= -2 && item.previous7RecordedCount >= 2)
    .sort(
      (left, right) =>
        left.delta - right.delta ||
        right.previous7RecordedCount - left.previous7RecordedCount ||
        left.artistId.localeCompare(right.artistId),
    )
    .slice(0, 5);
  return { state: 'available', increased, decreased };
}
