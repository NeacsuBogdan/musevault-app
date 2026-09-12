import 'server-only';

export type EvidenceLevel = 'low' | 'medium' | 'high';

export interface ListeningWindowBoundaries {
  now: Date;
  current7StartedAt: Date;
  previous7StartedAt: Date;
  current30StartedAt: Date;
}

export type ListeningComparisonWindow = 'current7' | 'previous7' | 'current30_only' | null;

export interface ListeningWindowSignals {
  current7RecordedCount: number;
  previous7RecordedCount: number;
  current30RecordedCount: number;
}

export type ListeningFreshnessState =
  | 'never_synced'
  | 'refreshed_within_current7'
  | 'stale_for_current7';

export interface RotationSignals {
  latestRecordedPlayAt: Date | null;
  recordedPlayCount7d: number;
  recordedPlayCount30d: number;
  activeRecordedDays30d: number;
  recordedCoverageStartedAt: Date | null;
}

export type RotationComponentKey = 'recency' | 'frequency_30d' | 'frequency_7d';

export interface RotationScoreComponent {
  key: RotationComponentKey;
  value: number;
  range: readonly [number, number];
}

export interface RotationExplanation {
  code:
    | 'recorded_frequency_7d'
    | 'latest_recorded_play_today'
    | 'recorded_presence_days'
    | 'recorded_frequency_30d';
  text: string;
  evidenceSource: 'recorded_listening';
}

export interface RotationIntelligence {
  rotationScore: number;
  scoreComponents: RotationScoreComponent[];
  evidenceLevel: EvidenceLevel;
  explanation: RotationExplanation | null;
}

export interface RecordedMomentumInput {
  artistId: string;
  artistName: string;
  current7RecordedCount: number;
  previous7RecordedCount: number;
}

export interface RecordedMomentumItem extends RecordedMomentumInput {
  delta: number;
}

export type RecordedMomentum =
  | { state: 'insufficient_coverage'; increased: []; decreased: [] }
  | { state: 'stale_data'; increased: []; decreased: [] }
  | {
      state: 'available';
      increased: RecordedMomentumItem[];
      decreased: RecordedMomentumItem[];
    };

export type AffinityRange = 'shortTerm' | 'mediumTerm' | 'longTerm';

export interface AffinitySignal {
  snapshotAvailable: boolean;
  rank: number | null;
}

export interface RediscoverSignals {
  savedAt: Date;
  savedAgeDays: number;
  latestRecordedPlayAt: Date | null;
  daysSinceLatestRecordedPlay: number | null;
  recordedPlayCount7d: number;
  recordedPlayCount30d: number;
  recordedPlayCount90d: number;
  recordedListeningCoverage: boolean;
  recentRecordedEventsAvailable: boolean;
  affinity: Record<AffinityRange, AffinitySignal>;
}

export type RediscoverComponentKey =
  | 'age_relevance'
  | 'recorded_recency_pressure'
  | 'recorded_frequency_pressure'
  | 'short_term_affinity_pressure'
  | 'medium_term_affinity_pressure'
  | 'long_term_affinity_pressure';

export interface ScoreComponent {
  key: RediscoverComponentKey;
  label: string;
  kind: 'relevance' | 'pressure';
  value: number;
  range: readonly [number, number];
}

export type VaultDepthComponentKey =
  | 'library_age_depth'
  | 'recorded_inactivity_depth'
  | 'captured_affinity_depth';

export interface VaultDepthComponent {
  key: VaultDepthComponentKey;
  value: number;
  range: readonly [number, number];
}

export interface IntelligenceReason {
  code:
    | 'saved_age'
    | 'recorded_play_recency'
    | 'outside_short_term_affinity'
    | 'longer_term_affinity_transition'
    | 'medium_term_affinity'
    | 'long_term_affinity';
  text: string;
  evidenceSource: 'library' | 'recorded_listening' | 'captured_affinity';
}

export interface RediscoverIntelligence {
  rediscoverScore: number;
  scoreComponents: ScoreComponent[];
  vaultDepth: number;
  vaultDepthComponents: VaultDepthComponent[];
  evidenceLevel: EvidenceLevel;
  reasons: IntelligenceReason[];
}

export interface DiversityCandidate {
  trackId: string;
  rediscoverScore: number;
  albumId: string;
  artistIds: string[];
}

export type BoundedSoundFeature =
  | 'acousticness'
  | 'danceability'
  | 'energy'
  | 'instrumentalness'
  | 'liveness'
  | 'speechiness'
  | 'valence';

export type SoundProfileAvailability = 'NO_DATA' | 'LIMITED_SAMPLE' | 'PROFILE_AVAILABLE';

export type SoundCoverageQuality = 'LOW' | 'MEDIUM' | 'HIGH';

export interface SoundProfileCoverage {
  currentSavedTrackCount: number;
  audioCoveredTrackCount: number;
  audioCoveragePercent: number | null;
  profileAvailability: SoundProfileAvailability;
  coverageQuality: SoundCoverageQuality;
}

export interface SoundDistribution {
  p25: number | null;
  p50: number | null;
  p75: number | null;
}

export type SoundCenter = Record<BoundedSoundFeature, SoundDistribution> & {
  tempo: SoundDistribution;
  loudness: SoundDistribution;
};

export type CompleteBoundedSoundValues = Record<BoundedSoundFeature, number>;

export interface SoundDistanceReason {
  feature: BoundedSoundFeature;
  trackValue: number;
  centerValue: number;
  absoluteDifference: number;
}

export interface SoundDistanceCandidate {
  trackId: string;
  soundDistance: number;
}
