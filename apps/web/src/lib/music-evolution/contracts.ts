import 'server-only';

import type { BoundedSoundFeature } from '@/lib/intelligence';

export const EVOLUTION_PERIOD_DAYS = [7, 30, 90] as const;

export type EvolutionPeriodDays = (typeof EVOLUTION_PERIOD_DAYS)[number];

export interface EvolutionPeriodRange {
  start: Date;
  end: Date;
}

export interface EvolutionPeriodComparison {
  periodDays: EvolutionPeriodDays;
  now: Date;
  current: EvolutionPeriodRange;
  previous: EvolutionPeriodRange;
}

export type EvolutionUnavailableReason =
  | 'NO_CAPTURED_HISTORY'
  | 'NO_SUCCESSFUL_SYNC'
  | 'INSUFFICIENT_HISTORY_SPAN'
  | 'STALE_LISTENING_DATA'
  | 'NO_EVENTS_IN_COMPARISON';

export type EvolutionAvailability =
  | { available: true; reason: null }
  | { available: false; reason: EvolutionUnavailableReason };

export type EvolutionEvidenceLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface EvolutionPeriodObservation {
  capturedEventCount: number;
  activeDayCount: number;
}

export interface EvolutionHistorySummary {
  capturedHistoryStartedAt: Date | null;
  latestCapturedPlayAt: Date | null;
  latestSuccessfulListeningSyncAt: Date | null;
  current: EvolutionPeriodObservation;
  previous: EvolutionPeriodObservation;
}

export interface MetricComparison {
  current: number | null;
  previous: number | null;
  delta: number | null;
  percentageChange: number | null;
}

export interface ListeningPeriodMetrics {
  capturedPlayCount: number;
  uniqueTrackCount: number;
  uniqueArtistCount: number;
  activeDayCount: number;
  repeatIntensity: number | null;
  topTrackConcentration: number | null;
  primaryArtistConcentration: number | null;
}

export interface ListeningShift {
  current: ListeningPeriodMetrics;
  previous: ListeningPeriodMetrics;
  comparisons: {
    capturedPlayCount: MetricComparison;
    uniqueTrackCount: MetricComparison;
    uniqueArtistCount: MetricComparison;
    activeDayCount: MetricComparison;
    repeatIntensity: MetricComparison;
    topTrackConcentration: MetricComparison;
    primaryArtistConcentration: MetricComparison;
  };
}

export interface MovementCounts {
  currentCapturedCount: number;
  previousCapturedCount: number;
  delta: number;
}

export interface TrackMovementItem extends MovementCounts {
  trackId: string;
  trackName: string;
  primaryArtistName: string | null;
  albumImageUrl: string | null;
}

export interface ArtistMovementItem extends MovementCounts {
  artistId: string;
  artistName: string;
}

export interface MovementLists<T extends MovementCounts> {
  entering: T[];
  leaving: T[];
  increased: T[];
  decreased: T[];
}

export interface CurrentLibraryAdditionExample {
  trackId: string;
  trackName: string;
  primaryArtistName: string | null;
  albumImageUrl: string | null;
  savedAt: Date;
}

export interface CurrentLibraryAdditionPeriod {
  count: number;
  examples: CurrentLibraryAdditionExample[];
}

export interface CurrentLibraryAdditions {
  current: CurrentLibraryAdditionPeriod;
  previous: CurrentLibraryAdditionPeriod;
  disclosure: string;
}

export type CapturedListeningSoundCenter = Record<BoundedSoundFeature, number>;

export interface SoundPeriodEvidence {
  totalCapturedEvents: number;
  coveredCapturedEvents: number;
  eventCoveragePercentage: number | null;
  totalUniqueCapturedTracks: number;
  coveredUniqueCapturedTracks: number;
  uniqueTrackCoveragePercentage: number | null;
  activeCapturedListeningDays: number;
  center: CapturedListeningSoundCenter | null;
}

export type SoundUnavailableReason =
  | 'COMPARISON_UNAVAILABLE'
  | 'CURRENT_TOO_FEW_COVERED_EVENTS'
  | 'PREVIOUS_TOO_FEW_COVERED_EVENTS'
  | 'CURRENT_TOO_FEW_COVERED_TRACKS'
  | 'PREVIOUS_TOO_FEW_COVERED_TRACKS'
  | 'CURRENT_TOO_FEW_ACTIVE_DAYS'
  | 'PREVIOUS_TOO_FEW_ACTIVE_DAYS'
  | 'CURRENT_EVENT_COVERAGE_TOO_LOW'
  | 'PREVIOUS_EVENT_COVERAGE_TOO_LOW';

export interface SoundDimensionShift {
  feature: BoundedSoundFeature;
  current: number;
  previous: number;
  delta: number;
  direction: 'higher' | 'lower';
}

export type SoundEvolution =
  | {
      available: false;
      reasons: SoundUnavailableReason[];
      current: SoundPeriodEvidence | null;
      previous: SoundPeriodEvidence | null;
      movement: null;
      strongestShifts: [];
    }
  | {
      available: true;
      reasons: [];
      current: SoundPeriodEvidence;
      previous: SoundPeriodEvidence;
      movement: number;
      strongestShifts: SoundDimensionShift[];
    };

export interface MusicEvolutionSnapshot {
  period: EvolutionPeriodComparison;
  availability: EvolutionAvailability;
  evidenceLevel: EvolutionEvidenceLevel | null;
  history: EvolutionHistorySummary;
  listeningShift: ListeningShift | null;
  rotationMovement: MovementLists<TrackMovementItem> | null;
  artistMovement: MovementLists<ArtistMovementItem> | null;
  currentLibraryAdditions: CurrentLibraryAdditions;
  soundEvolution: SoundEvolution;
}
