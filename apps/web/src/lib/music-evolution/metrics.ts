import 'server-only';

import { calculateRecordedShare } from '@/lib/intelligence';

import type {
  ListeningPeriodMetrics,
  ListeningShift,
  MetricComparison,
  MovementCounts,
  MovementLists,
} from './contracts';

export interface ListeningPeriodAggregate {
  capturedPlayCount: number;
  uniqueTrackCount: number;
  uniqueArtistCount: number;
  activeDayCount: number;
  repeatedTrackEventCount: number;
  topFiveTrackEventCount: number;
  topFivePrimaryArtistEventCount: number;
}

export function buildListeningPeriodMetrics(
  aggregate: ListeningPeriodAggregate,
): ListeningPeriodMetrics {
  return {
    capturedPlayCount: aggregate.capturedPlayCount,
    uniqueTrackCount: aggregate.uniqueTrackCount,
    uniqueArtistCount: aggregate.uniqueArtistCount,
    activeDayCount: aggregate.activeDayCount,
    repeatIntensity: calculateRecordedShare(
      aggregate.repeatedTrackEventCount,
      aggregate.capturedPlayCount,
    ),
    topTrackConcentration: calculateRecordedShare(
      aggregate.topFiveTrackEventCount,
      aggregate.capturedPlayCount,
    ),
    primaryArtistConcentration: calculateRecordedShare(
      aggregate.topFivePrimaryArtistEventCount,
      aggregate.capturedPlayCount,
    ),
  };
}

export function compareMetric(current: number | null, previous: number | null): MetricComparison {
  if (current === null || previous === null) {
    return { current, previous, delta: null, percentageChange: null };
  }
  return {
    current,
    previous,
    delta: current - previous,
    percentageChange: previous > 0 ? ((current - previous) / previous) * 100 : null,
  };
}

export function buildListeningShift(
  current: ListeningPeriodMetrics,
  previous: ListeningPeriodMetrics,
): ListeningShift {
  return {
    current,
    previous,
    comparisons: {
      capturedPlayCount: compareMetric(current.capturedPlayCount, previous.capturedPlayCount),
      uniqueTrackCount: compareMetric(current.uniqueTrackCount, previous.uniqueTrackCount),
      uniqueArtistCount: compareMetric(current.uniqueArtistCount, previous.uniqueArtistCount),
      activeDayCount: compareMetric(current.activeDayCount, previous.activeDayCount),
      repeatIntensity: compareMetric(current.repeatIntensity, previous.repeatIntensity),
      topTrackConcentration: compareMetric(
        current.topTrackConcentration,
        previous.topTrackConcentration,
      ),
      primaryArtistConcentration: compareMetric(
        current.primaryArtistConcentration,
        previous.primaryArtistConcentration,
      ),
    },
  };
}

export function rankMovement<T extends MovementCounts>(
  items: readonly T[],
  getId: (item: T) => string,
): MovementLists<T> {
  const withDelta = items.map((item) => ({
    ...item,
    delta: item.currentCapturedCount - item.previousCapturedCount,
  }));
  const byId = (left: T, right: T) => getId(left).localeCompare(getId(right));

  return {
    entering: withDelta
      .filter((item) => item.currentCapturedCount > 0 && item.previousCapturedCount === 0)
      .sort(
        (left, right) =>
          right.currentCapturedCount - left.currentCapturedCount || byId(left, right),
      )
      .slice(0, 5),
    leaving: withDelta
      .filter((item) => item.currentCapturedCount === 0 && item.previousCapturedCount > 0)
      .sort(
        (left, right) =>
          right.previousCapturedCount - left.previousCapturedCount || byId(left, right),
      )
      .slice(0, 5),
    increased: withDelta
      .filter(
        (item) =>
          item.currentCapturedCount > 0 && item.previousCapturedCount > 0 && item.delta >= 2,
      )
      .sort(
        (left, right) =>
          right.delta - left.delta ||
          right.currentCapturedCount - left.currentCapturedCount ||
          byId(left, right),
      )
      .slice(0, 5),
    decreased: withDelta
      .filter(
        (item) =>
          item.currentCapturedCount > 0 && item.previousCapturedCount >= 2 && item.delta <= -2,
      )
      .sort(
        (left, right) =>
          Math.abs(right.delta) - Math.abs(left.delta) ||
          right.previousCapturedCount - left.previousCapturedCount ||
          byId(left, right),
      )
      .slice(0, 5),
  };
}
