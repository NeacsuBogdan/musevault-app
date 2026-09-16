import 'server-only';

import { calculateListeningFreshness } from '@/lib/intelligence';

import type {
  EvolutionAvailability,
  EvolutionEvidenceLevel,
  EvolutionHistorySummary,
  EvolutionPeriodComparison,
  EvolutionPeriodObservation,
} from './contracts';

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

export function evaluateEvolutionAvailability(
  period: EvolutionPeriodComparison,
  history: EvolutionHistorySummary,
): EvolutionAvailability {
  if (!history.capturedHistoryStartedAt) {
    return { available: false, reason: 'NO_CAPTURED_HISTORY' };
  }
  if (!history.latestSuccessfulListeningSyncAt) {
    return { available: false, reason: 'NO_SUCCESSFUL_SYNC' };
  }
  if (history.capturedHistoryStartedAt.getTime() > period.previous.start.getTime()) {
    return { available: false, reason: 'INSUFFICIENT_HISTORY_SPAN' };
  }
  if (
    calculateListeningFreshness(history.latestSuccessfulListeningSyncAt, period.now) !==
    'refreshed_within_current7'
  ) {
    return { available: false, reason: 'STALE_LISTENING_DATA' };
  }
  if (history.current.capturedEventCount === 0 && history.previous.capturedEventCount === 0) {
    return { available: false, reason: 'NO_EVENTS_IN_COMPARISON' };
  }
  return { available: true, reason: null };
}

function meetsThreshold(
  observation: EvolutionPeriodObservation,
  eventThreshold: number,
  activeDayThreshold: number,
): boolean {
  return (
    observation.capturedEventCount >= eventThreshold &&
    observation.activeDayCount >= activeDayThreshold
  );
}

export function calculateEvolutionEvidenceLevel(
  period: EvolutionPeriodComparison,
  history: EvolutionHistorySummary,
): EvolutionEvidenceLevel {
  const mediumActiveDayThreshold = Math.max(2, Math.ceil(period.periodDays / 10));
  const highActiveDayThreshold = Math.max(5, Math.ceil(period.periodDays / 4));
  const meetsMedium = [history.current, history.previous].every((observation) =>
    meetsThreshold(observation, 10, mediumActiveDayThreshold),
  );
  if (!meetsMedium) return 'LOW';

  const syncAge = history.latestSuccessfulListeningSyncAt
    ? period.now.getTime() - history.latestSuccessfulListeningSyncAt.getTime()
    : Number.POSITIVE_INFINITY;
  const meetsHigh = [history.current, history.previous].every((observation) =>
    meetsThreshold(observation, 50, highActiveDayThreshold),
  );
  return meetsHigh && syncAge >= 0 && syncAge <= FORTY_EIGHT_HOURS_MS ? 'HIGH' : 'MEDIUM';
}
