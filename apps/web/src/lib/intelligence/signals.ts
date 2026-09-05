import 'server-only';

import type { RediscoverSignals } from './types';

export const MILLISECONDS_PER_DAY = 86_400_000;

function elapsedDays(earlier: Date, later: Date): number {
  return Math.max(0, Math.floor((later.getTime() - earlier.getTime()) / MILLISECONDS_PER_DAY));
}

function count(value: number): number {
  return Math.max(0, Math.floor(value));
}

function rank(value: number | null): number | null {
  return value === null ? null : Math.max(1, Math.floor(value));
}

export function collectRediscoverSignals(input: {
  savedAt: Date;
  now: Date;
  latestRecordedPlayAt: Date | null;
  recordedPlayCount7d: number;
  recordedPlayCount30d: number;
  recordedPlayCount90d: number;
  recordedListeningCoverage: boolean;
  recentRecordedEventsAvailable: boolean;
  affinity: {
    shortTerm: { snapshotAvailable: boolean; rank: number | null };
    mediumTerm: { snapshotAvailable: boolean; rank: number | null };
    longTerm: { snapshotAvailable: boolean; rank: number | null };
  };
}): RediscoverSignals {
  return {
    savedAt: input.savedAt,
    savedAgeDays: elapsedDays(input.savedAt, input.now),
    latestRecordedPlayAt: input.latestRecordedPlayAt,
    daysSinceLatestRecordedPlay: input.latestRecordedPlayAt
      ? elapsedDays(input.latestRecordedPlayAt, input.now)
      : null,
    recordedPlayCount7d: count(input.recordedPlayCount7d),
    recordedPlayCount30d: count(input.recordedPlayCount30d),
    recordedPlayCount90d: count(input.recordedPlayCount90d),
    recordedListeningCoverage: input.recordedListeningCoverage,
    recentRecordedEventsAvailable: input.recentRecordedEventsAvailable,
    affinity: {
      shortTerm: { ...input.affinity.shortTerm, rank: rank(input.affinity.shortTerm.rank) },
      mediumTerm: { ...input.affinity.mediumTerm, rank: rank(input.affinity.mediumTerm.rank) },
      longTerm: { ...input.affinity.longTerm, rank: rank(input.affinity.longTerm.rank) },
    },
  };
}
