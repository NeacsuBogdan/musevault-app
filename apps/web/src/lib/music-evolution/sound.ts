import 'server-only';

import {
  BOUNDED_SOUND_FEATURES,
  calculateSoundDistance,
  SOUND_EXPLANATION_FEATURE_ORDER,
  type BoundedSoundFeature,
} from '@/lib/intelligence';

import type {
  CapturedListeningSoundCenter,
  SoundEvolution,
  SoundPeriodEvidence,
  SoundUnavailableReason,
} from './contracts';

export const SOUND_MINIMUM_COVERED_EVENTS = 20;
export const SOUND_MINIMUM_COVERED_TRACKS = 10;
export const SOUND_MINIMUM_ACTIVE_DAYS = 3;
export const SOUND_MINIMUM_EVENT_COVERAGE_PERCENTAGE = 50;

export interface SoundPeriodAggregate {
  totalCapturedEvents: number;
  coveredCapturedEvents: number;
  totalUniqueCapturedTracks: number;
  coveredUniqueCapturedTracks: number;
  activeCapturedListeningDays: number;
  center: Partial<Record<BoundedSoundFeature, number | null>>;
}

function percentage(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : Math.round((numerator / denominator) * 1000) / 10;
}

function completeCenter(
  center: Partial<Record<BoundedSoundFeature, number | null>>,
): CapturedListeningSoundCenter | null {
  if (
    !BOUNDED_SOUND_FEATURES.every(
      (feature) => typeof center[feature] === 'number' && Number.isFinite(center[feature]),
    )
  ) {
    return null;
  }
  return Object.fromEntries(
    BOUNDED_SOUND_FEATURES.map((feature) => [feature, center[feature] as number]),
  ) as CapturedListeningSoundCenter;
}

export function buildSoundPeriodEvidence(aggregate: SoundPeriodAggregate): SoundPeriodEvidence {
  return {
    totalCapturedEvents: aggregate.totalCapturedEvents,
    coveredCapturedEvents: aggregate.coveredCapturedEvents,
    eventCoveragePercentage: percentage(
      aggregate.coveredCapturedEvents,
      aggregate.totalCapturedEvents,
    ),
    totalUniqueCapturedTracks: aggregate.totalUniqueCapturedTracks,
    coveredUniqueCapturedTracks: aggregate.coveredUniqueCapturedTracks,
    uniqueTrackCoveragePercentage: percentage(
      aggregate.coveredUniqueCapturedTracks,
      aggregate.totalUniqueCapturedTracks,
    ),
    activeCapturedListeningDays: aggregate.activeCapturedListeningDays,
    center: completeCenter(aggregate.center),
  };
}

function unavailableReasons(
  period: 'CURRENT' | 'PREVIOUS',
  evidence: SoundPeriodEvidence,
): SoundUnavailableReason[] {
  const reasons: SoundUnavailableReason[] = [];
  if (evidence.coveredCapturedEvents < SOUND_MINIMUM_COVERED_EVENTS)
    reasons.push(`${period}_TOO_FEW_COVERED_EVENTS`);
  if (evidence.coveredUniqueCapturedTracks < SOUND_MINIMUM_COVERED_TRACKS)
    reasons.push(`${period}_TOO_FEW_COVERED_TRACKS`);
  if (evidence.activeCapturedListeningDays < SOUND_MINIMUM_ACTIVE_DAYS)
    reasons.push(`${period}_TOO_FEW_ACTIVE_DAYS`);
  if (
    evidence.eventCoveragePercentage === null ||
    evidence.eventCoveragePercentage < SOUND_MINIMUM_EVENT_COVERAGE_PERCENTAGE
  )
    reasons.push(`${period}_EVENT_COVERAGE_TOO_LOW`);
  return reasons;
}

export function buildSoundEvolution(
  current: SoundPeriodEvidence,
  previous: SoundPeriodEvidence,
): SoundEvolution {
  const reasons = [
    ...unavailableReasons('CURRENT', current),
    ...unavailableReasons('PREVIOUS', previous),
  ];
  if (reasons.length || !current.center || !previous.center) {
    return {
      available: false,
      reasons: reasons.length > 0 ? reasons : ['CURRENT_TOO_FEW_COVERED_EVENTS'],
      current,
      previous,
      movement: null,
      strongestShifts: [],
    };
  }

  const movement = calculateSoundDistance(current.center, previous.center);
  const order = new Map(
    SOUND_EXPLANATION_FEATURE_ORDER.map((feature, index) => [feature, index] as const),
  );
  const strongestShifts = BOUNDED_SOUND_FEATURES.map((feature) => {
    const delta = current.center![feature] - previous.center![feature];
    return {
      feature,
      current: current.center![feature],
      previous: previous.center![feature],
      delta,
      direction: delta >= 0 ? ('higher' as const) : ('lower' as const),
    };
  })
    .filter((shift) => Math.abs(shift.delta) > 1e-12)
    .sort((left, right) => {
      const absoluteDifference = Math.abs(right.delta) - Math.abs(left.delta);
      return Math.abs(absoluteDifference) > 1e-12
        ? absoluteDifference
        : (order.get(left.feature) ?? 0) - (order.get(right.feature) ?? 0);
    })
    .slice(0, 3);

  return {
    available: true,
    reasons: [],
    current,
    previous,
    movement: movement ?? 0,
    strongestShifts,
  };
}
