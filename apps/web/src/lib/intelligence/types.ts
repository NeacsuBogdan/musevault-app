import 'server-only';

export type EvidenceLevel = 'low' | 'medium' | 'high';

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
