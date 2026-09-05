import 'server-only';

export {
  paginateRediscoverCandidates,
  REDISCOVER_CANDIDATE_POOL_SIZE,
  rerankRediscoverCandidates,
} from './diversity';
export { buildRediscoverReasons } from './explanations';
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
  RediscoverComponentKey,
  RediscoverIntelligence,
  RediscoverSignals,
  ScoreComponent,
  VaultDepthComponent,
  VaultDepthComponentKey,
} from './types';
