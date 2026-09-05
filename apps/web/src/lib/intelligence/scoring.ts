import 'server-only';

import type {
  EvidenceLevel,
  RediscoverIntelligence,
  RediscoverSignals,
  ScoreComponent,
  VaultDepthComponent,
} from './types';

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

const REDISCOVER_AGE_ANCHORS = [
  [90, 25],
  [180, 35],
  [365, 50],
  [730, 65],
  [1_095, 78],
  [1_825, 90],
  [2_920, 100],
] as const;

const VAULT_AGE_ANCHORS = [
  [90, 15],
  [180, 25],
  [365, 35],
  [730, 45],
  [1_095, 55],
  [1_825, 65],
  [2_920, 70],
] as const;

function interpolateAgeAnchors(
  savedAgeDays: number,
  anchors: readonly (readonly [number, number])[],
): number {
  const days = Math.max(0, Math.floor(savedAgeDays));
  const first = anchors[0];
  const last = anchors.at(-1);
  if (!first || !last) return 0;
  if (days <= first[0]) return first[1];
  if (days >= last[0]) return last[1];

  for (let index = 1; index < anchors.length; index += 1) {
    const lower = anchors[index - 1];
    const upper = anchors[index];
    if (!lower || !upper || days > upper[0]) continue;
    const dayOffset = days - lower[0];
    const daySpan = upper[0] - lower[0];
    const scoreSpan = upper[1] - lower[1];
    // Integer half-up rounding keeps interpolation stable across runtimes.
    const scoreOffset = Math.floor((2 * dayOffset * scoreSpan + daySpan) / (2 * daySpan));
    return lower[1] + scoreOffset;
  }

  return last[1];
}

/** Library age is the only positive Rediscover component and is bounded to 0..100. */
export function calculateAgeRelevance(savedAgeDays: number): number {
  return savedAgeDays < 90 ? 0 : interpolateAgeAnchors(savedAgeDays, REDISCOVER_AGE_ANCHORS);
}

export function calculateLibraryAgeDepth(savedAgeDays: number): number {
  return savedAgeDays < 90 ? 0 : interpolateAgeAnchors(savedAgeDays, VAULT_AGE_ANCHORS);
}

/** Known recorded-play recency applies a bounded 0..38 pressure; unknown stays zero. */
export function calculateRecordedRecencyPressure(days: number | null): number {
  if (days === null) return 0;
  if (days <= 7) return 38;
  if (days <= 30) return 30;
  if (days <= 90) return 18;
  if (days <= 180) return 10;
  return 4;
}

/** Nested 7/30/90-day counts emphasize recent rotation and are capped at 30. */
export function calculateRecordedFrequencyPressure(input: {
  recordedPlayCount7d: number;
  recordedPlayCount30d: number;
  recordedPlayCount90d: number;
}): number {
  return clamp(
    input.recordedPlayCount7d * 6 + input.recordedPlayCount30d * 2 + input.recordedPlayCount90d,
    0,
    30,
  );
}

/** A captured rank is affinity evidence, never a play count. Rank 1 receives maximum pressure. */
export function calculateAffinityPressure(
  rank: number | null,
  range: 'shortTerm' | 'mediumTerm' | 'longTerm',
): number {
  if (rank === null) return 0;
  const bounds = {
    shortTerm: [18, 34],
    mediumTerm: [8, 16],
    longTerm: [3, 7],
  } as const;
  const [minimum, maximum] = bounds[range];
  const normalizedRank = clamp(rank, 1, 50);
  return clamp(maximum - ((normalizedRank - 1) * (maximum - minimum)) / 49, minimum, maximum);
}

export function calculateEvidenceLevel(signals: RediscoverSignals): EvidenceLevel {
  const contextualEvidenceCount =
    Number(signals.recordedListeningCoverage || signals.recentRecordedEventsAvailable) +
    Number(signals.affinity.shortTerm.snapshotAvailable) +
    Number(signals.affinity.mediumTerm.snapshotAvailable) +
    Number(signals.affinity.longTerm.snapshotAvailable);
  const recordedTrackEvidence = signals.latestRecordedPlayAt !== null;
  const shortTermTrackEvidence = signals.affinity.shortTerm.rank !== null;
  const directEvidenceCount =
    Number(recordedTrackEvidence) +
    Number(shortTermTrackEvidence) +
    Number(signals.affinity.mediumTerm.rank !== null) +
    Number(signals.affinity.longTerm.rank !== null);

  if (
    directEvidenceCount >= 2 ||
    (contextualEvidenceCount >= 3 && (recordedTrackEvidence || shortTermTrackEvidence))
  )
    return 'high';
  if (directEvidenceCount >= 1 || contextualEvidenceCount >= 2) return 'medium';
  return 'low';
}

export function calculateVaultDepth(signals: RediscoverSignals): {
  score: number;
  components: VaultDepthComponent[];
} {
  const ageDepth = calculateLibraryAgeDepth(signals.savedAgeDays);
  const recordedInactivityDepth =
    !signals.recordedListeningCoverage || signals.daysSinceLatestRecordedPlay === null
      ? 0
      : signals.daysSinceLatestRecordedPlay > 365
        ? 15
        : signals.daysSinceLatestRecordedPlay > 180
          ? 11
          : signals.daysSinceLatestRecordedPlay > 90
            ? 7
            : signals.daysSinceLatestRecordedPlay > 30
              ? 3
              : 0;
  const capturedAffinityDepth =
    (signals.affinity.shortTerm.snapshotAvailable && signals.affinity.shortTerm.rank === null
      ? 8
      : 0) +
    (signals.affinity.mediumTerm.snapshotAvailable && signals.affinity.mediumTerm.rank === null
      ? 4
      : 0) +
    (signals.affinity.longTerm.snapshotAvailable && signals.affinity.longTerm.rank === null
      ? 3
      : 0);
  const components: VaultDepthComponent[] = [
    { key: 'library_age_depth', value: ageDepth, range: [0, 70] },
    {
      key: 'recorded_inactivity_depth',
      value: recordedInactivityDepth,
      range: [0, 15],
    },
    { key: 'captured_affinity_depth', value: capturedAffinityDepth, range: [0, 15] },
  ];
  return {
    score: clamp(ageDepth + recordedInactivityDepth + capturedAffinityDepth, 0, 100),
    components,
  };
}

export function calculateRediscoverIntelligence(
  signals: RediscoverSignals,
): Omit<RediscoverIntelligence, 'reasons'> {
  const age = calculateAgeRelevance(signals.savedAgeDays);
  const recency = calculateRecordedRecencyPressure(signals.daysSinceLatestRecordedPlay);
  const frequency = calculateRecordedFrequencyPressure(signals);
  const shortTerm = calculateAffinityPressure(signals.affinity.shortTerm.rank, 'shortTerm');
  const mediumTerm = calculateAffinityPressure(signals.affinity.mediumTerm.rank, 'mediumTerm');
  const longTerm = calculateAffinityPressure(signals.affinity.longTerm.rank, 'longTerm');
  const scoreComponents: ScoreComponent[] = [
    { key: 'age_relevance', label: 'Library age', kind: 'relevance', value: age, range: [0, 100] },
    {
      key: 'recorded_recency_pressure',
      label: 'Recorded listening recency',
      kind: 'pressure',
      value: recency,
      range: [0, 38],
    },
    {
      key: 'recorded_frequency_pressure',
      label: 'Recorded recent rotation',
      kind: 'pressure',
      value: frequency,
      range: [0, 30],
    },
    {
      key: 'short_term_affinity_pressure',
      label: 'Captured short-term affinity',
      kind: 'pressure',
      value: shortTerm,
      range: [0, 34],
    },
    {
      key: 'medium_term_affinity_pressure',
      label: 'Captured medium-term affinity',
      kind: 'pressure',
      value: mediumTerm,
      range: [0, 16],
    },
    {
      key: 'long_term_affinity_pressure',
      label: 'Captured long-term affinity',
      kind: 'pressure',
      value: longTerm,
      range: [0, 7],
    },
  ];
  const pressure = recency + frequency + shortTerm + mediumTerm + longTerm;
  const vaultDepth = calculateVaultDepth(signals);
  return {
    rediscoverScore: clamp(age - pressure, 0, 100),
    scoreComponents,
    vaultDepth: vaultDepth.score,
    vaultDepthComponents: vaultDepth.components,
    evidenceLevel: calculateEvidenceLevel(signals),
  };
}
