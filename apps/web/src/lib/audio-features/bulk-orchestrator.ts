import type { AudioEnrichmentBatchResult, AudioEnrichmentStatus } from './contracts';

export const BULK_ENRICHMENT_DELAY_MS = 2_000;
export const MAX_CONSECUTIVE_NO_PROGRESS_BATCHES = 2;

export type BulkEnrichmentState =
  | 'idle'
  | 'running'
  | 'pause_requested'
  | 'paused'
  | 'completed'
  | 'rate_limited'
  | 'provider_error'
  | 'no_progress';

export interface BulkEnrichmentSnapshot {
  state: BulkEnrichmentState;
  status: AudioEnrichmentStatus;
  batchesCompleted: number;
  tracksNewlyEnriched: number;
  retryAfterSeconds: number | null;
}

export class BulkEnrichmentRequestError extends Error {
  constructor(
    public readonly kind: 'rate_limited' | 'provider_error',
    public readonly retryAfterSeconds: number | null = null,
  ) {
    super('Bulk audio enrichment request failed.');
    this.name = 'BulkEnrichmentRequestError';
  }
}

interface BulkEnrichmentDependencies {
  getStatus: () => Promise<AudioEnrichmentStatus>;
  enrichOneBatch: () => Promise<AudioEnrichmentBatchResult>;
  wait?: (milliseconds: number) => Promise<void>;
  onSnapshot: (snapshot: BulkEnrichmentSnapshot) => void;
}

const defaultWait = (milliseconds: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });

export class BulkAudioEnrichmentOrchestrator {
  private activeRun: Promise<void> | null = null;
  private pauseRequested = false;
  private consecutiveNoProgressBatches = 0;
  private snapshot: BulkEnrichmentSnapshot;
  private readonly wait: (milliseconds: number) => Promise<void>;

  constructor(
    initialStatus: AudioEnrichmentStatus,
    private readonly dependencies: BulkEnrichmentDependencies,
  ) {
    this.wait = dependencies.wait ?? defaultWait;
    this.snapshot = {
      state: 'idle',
      status: initialStatus,
      batchesCompleted: 0,
      tracksNewlyEnriched: 0,
      retryAfterSeconds: null,
    };
  }

  getSnapshot(): BulkEnrichmentSnapshot {
    return this.snapshot;
  }

  start(): Promise<void> {
    if (this.activeRun) return this.activeRun;
    this.snapshot = {
      ...this.snapshot,
      state: 'idle',
      batchesCompleted: 0,
      tracksNewlyEnriched: 0,
      retryAfterSeconds: null,
    };
    this.consecutiveNoProgressBatches = 0;
    return this.launch();
  }

  resume(): Promise<void> {
    if (this.activeRun) return this.activeRun;
    this.consecutiveNoProgressBatches = 0;
    this.snapshot = { ...this.snapshot, retryAfterSeconds: null };
    return this.launch();
  }

  pause(): void {
    if (this.snapshot.state !== 'running') return;
    this.pauseRequested = true;
    this.update({ state: 'pause_requested' });
  }

  private launch(): Promise<void> {
    this.pauseRequested = false;
    const run = this.run().finally(() => {
      if (this.activeRun === run) this.activeRun = null;
    });
    this.activeRun = run;
    return run;
  }

  private async run(): Promise<void> {
    this.update({ state: 'running' });
    let status: AudioEnrichmentStatus;
    try {
      status = await this.dependencies.getStatus();
    } catch {
      this.update({ state: 'provider_error' });
      return;
    }
    this.update({ status });
    if (this.stopForPause()) return;
    if (status.currentlyEligibleRemainingCount === 0) {
      this.update({ state: 'completed' });
      return;
    }

    while (status.currentlyEligibleRemainingCount > 0) {
      const before = status;
      let batch: AudioEnrichmentBatchResult;
      try {
        batch = await this.dependencies.enrichOneBatch();
      } catch (error) {
        status = await this.refreshAfterFailure(before);
        this.snapshot = {
          ...this.snapshot,
          tracksNewlyEnriched:
            this.snapshot.tracksNewlyEnriched +
            Math.max(0, status.audioCoveredTrackCount - before.audioCoveredTrackCount),
        };
        if (error instanceof BulkEnrichmentRequestError && error.kind === 'rate_limited') {
          this.update({
            state: 'rate_limited',
            status,
            retryAfterSeconds: error.retryAfterSeconds,
          });
        } else {
          this.update({ state: 'provider_error', status });
        }
        return;
      }

      this.snapshot = {
        ...this.snapshot,
        batchesCompleted: this.snapshot.batchesCompleted + 1,
        tracksNewlyEnriched:
          this.snapshot.tracksNewlyEnriched + Math.max(0, batch.enrichedTrackCount),
      };
      try {
        status = await this.dependencies.getStatus();
      } catch {
        this.update({ state: 'provider_error' });
        return;
      }
      this.update({ status });

      if (status.currentlyEligibleRemainingCount === 0) {
        this.update({ state: 'completed' });
        return;
      }

      const madeProgress =
        status.audioCoveredTrackCount > before.audioCoveredTrackCount ||
        status.currentlyEligibleRemainingCount < before.currentlyEligibleRemainingCount ||
        batch.enrichedTrackCount > 0 ||
        batch.notFoundTrackCount > 0;
      this.consecutiveNoProgressBatches = madeProgress ? 0 : this.consecutiveNoProgressBatches + 1;
      if (this.consecutiveNoProgressBatches >= MAX_CONSECUTIVE_NO_PROGRESS_BATCHES) {
        this.update({ state: 'no_progress' });
        return;
      }
      if (this.stopForPause()) return;

      await this.wait(BULK_ENRICHMENT_DELAY_MS);
      if (this.stopForPause()) return;
    }
  }

  private async refreshAfterFailure(
    fallback: AudioEnrichmentStatus,
  ): Promise<AudioEnrichmentStatus> {
    try {
      return await this.dependencies.getStatus();
    } catch {
      return fallback;
    }
  }

  private stopForPause(): boolean {
    if (!this.pauseRequested) return false;
    this.update({ state: 'paused' });
    return true;
  }

  private update(changes: Partial<BulkEnrichmentSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...changes };
    this.dependencies.onSnapshot(this.snapshot);
  }
}
