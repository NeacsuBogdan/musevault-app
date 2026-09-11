import 'server-only';

export {
  paginateRediscoverCandidates,
  REDISCOVER_CANDIDATE_POOL_SIZE,
  rerankRediscoverCandidates,
} from './diversity';
export { buildRediscoverReasons } from './explanations';
export {
  buildListeningWindowBoundaries,
  buildRotationExplanation,
  calculateListeningFreshness,
  calculateRecordedMomentum,
  calculateRecordedShare,
  calculateRepeatIntensity,
  calculateRotationEvidenceLevel,
  calculateRotationFrequency7,
  calculateRotationFrequency30,
  calculateRotationIntelligence,
  calculateRotationRecency,
  calculateTopTrackConcentration,
  classifyListeningWindow,
  collectListeningWindowSignals,
  collectRotationSignals,
} from './listening';
export { collectRediscoverSignals, MILLISECONDS_PER_DAY } from './signals';
export {
  calculateAffinityPressure,
  calculateAgeRelevance,
  calculateEvidenceLevel,
  calculateLibraryAgeDepth,
  calculateRecordedFrequencyPressure,
  calculateRecordedRecencyPressure,
  calculateRediscoverIntelligence,
  calculateVaultDepth,
} from './scoring';
export type {
  AffinityRange,
  AffinitySignal,
  DiversityCandidate,
  EvidenceLevel,
  IntelligenceReason,
  ListeningComparisonWindow,
  ListeningFreshnessState,
  ListeningWindowBoundaries,
  ListeningWindowSignals,
  RecordedMomentum,
  RecordedMomentumInput,
  RecordedMomentumItem,
  RediscoverComponentKey,
  RediscoverIntelligence,
  RediscoverSignals,
  RotationComponentKey,
  RotationExplanation,
  RotationIntelligence,
  RotationScoreComponent,
  RotationSignals,
  ScoreComponent,
  VaultDepthComponent,
  VaultDepthComponentKey,
} from './types';
