export interface AudioEnrichmentStatus {
  currentSavedTrackCount: number;
  audioCoveredTrackCount: number;
  audioCoveragePercent: number | null;
  coverageQuality: 'LOW' | 'MEDIUM' | 'HIGH';
  currentlyEligibleRemainingCount: number;
  coolingDownCount: number;
}

export interface AudioEnrichmentBatchResult {
  provider: 'reccobeats';
  result: 'applied' | 'no_changes';
  attemptedTrackCount: number;
  enrichedTrackCount: number;
  notFoundTrackCount: number;
  retryAfter: null;
}
