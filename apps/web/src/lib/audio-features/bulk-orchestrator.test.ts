import { describe, expect, it, vi } from 'vitest';

import type { AudioEnrichmentBatchResult, AudioEnrichmentStatus } from './contracts';
import {
  BULK_ENRICHMENT_DELAY_MS,
  BulkAudioEnrichmentOrchestrator,
  BulkEnrichmentRequestError,
  MAX_CONSECUTIVE_NO_PROGRESS_BATCHES,
  type BulkEnrichmentSnapshot,
} from './bulk-orchestrator';

const status = (overrides: Partial<AudioEnrichmentStatus> = {}): AudioEnrichmentStatus => ({
  currentSavedTrackCount: 100,
  audioCoveredTrackCount: 20,
  audioCoveragePercent: 20,
  coverageQuality: 'LOW',
  currentlyEligibleRemainingCount: 80,
  coolingDownCount: 0,
  ...overrides,
});

const batch = (
  overrides: Partial<AudioEnrichmentBatchResult> = {},
): AudioEnrichmentBatchResult => ({
  provider: 'reccobeats',
  result: 'applied',
  attemptedTrackCount: 1,
  enrichedTrackCount: 1,
  notFoundTrackCount: 0,
  retryAfter: null,
  ...overrides,
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
};

function harness({
  statuses,
  enrichOneBatch = vi.fn().mockResolvedValue(batch()),
}: {
  statuses: AudioEnrichmentStatus[];
  enrichOneBatch?: () => Promise<AudioEnrichmentBatchResult>;
}) {
  const snapshots: BulkEnrichmentSnapshot[] = [];
  const calls: string[] = [];
  let statusIndex = 0;
  const getStatus = vi.fn(async () => {
    calls.push('GET');
    const next = statuses[Math.min(statusIndex, statuses.length - 1)];
    statusIndex += 1;
    if (!next) throw new Error('Missing test status');
    return next;
  });
  const wrappedEnrich = vi.fn(async () => {
    calls.push('POST');
    return enrichOneBatch();
  });
  const wait = vi.fn(async (milliseconds: number) => {
    calls.push(`WAIT:${milliseconds}`);
  });
  const orchestrator = new BulkAudioEnrichmentOrchestrator(statuses[0] ?? status(), {
    getStatus,
    enrichOneBatch: wrappedEnrich,
    wait,
    onSnapshot: (snapshot) => snapshots.push(snapshot),
  });
  return { calls, enrichOneBatch: wrappedEnrich, getStatus, orchestrator, snapshots, wait };
}

describe('bulk audio enrichment orchestration', () => {
  it('does nothing until an explicit start and prevents duplicate active loops', async () => {
    const pending = deferred<AudioEnrichmentBatchResult>();
    const enrich = vi.fn(() => pending.promise);
    const setup = harness({
      statuses: [
        status({ currentlyEligibleRemainingCount: 2 }),
        status({ audioCoveredTrackCount: 21, currentlyEligibleRemainingCount: 1 }),
      ],
      enrichOneBatch: enrich,
    });
    expect(setup.getStatus).not.toHaveBeenCalled();
    expect(setup.enrichOneBatch).not.toHaveBeenCalled();

    const first = setup.orchestrator.start();
    const duplicate = setup.orchestrator.start();
    expect(duplicate).toBe(first);
    await vi.waitFor(() => expect(setup.enrichOneBatch).toHaveBeenCalledTimes(1));
    setup.orchestrator.pause();
    pending.resolve(batch());
    await first;
    expect(setup.enrichOneBatch).toHaveBeenCalledTimes(1);
  });

  it('runs POSTs sequentially, refreshes status after every batch, and waits two seconds', async () => {
    let activePosts = 0;
    let maximumActivePosts = 0;
    const enrich = vi.fn(async () => {
      activePosts += 1;
      maximumActivePosts = Math.max(maximumActivePosts, activePosts);
      await Promise.resolve();
      activePosts -= 1;
      return batch();
    });
    const setup = harness({
      statuses: [
        status({ currentlyEligibleRemainingCount: 2 }),
        status({ audioCoveredTrackCount: 21, currentlyEligibleRemainingCount: 1 }),
        status({ audioCoveredTrackCount: 22, currentlyEligibleRemainingCount: 0 }),
      ],
      enrichOneBatch: enrich,
    });

    await setup.orchestrator.start();

    expect(maximumActivePosts).toBe(1);
    expect(setup.calls).toEqual(['GET', 'POST', 'GET', 'WAIT:2000', 'POST', 'GET']);
    expect(setup.wait).toHaveBeenCalledExactlyOnceWith(BULK_ENRICHMENT_DELAY_MS);
    expect(setup.orchestrator.getSnapshot()).toMatchObject({
      state: 'completed',
      batchesCompleted: 2,
      tracksNewlyEnriched: 2,
    });
  });

  it('finishes the active request after Pause and starts no subsequent batch', async () => {
    const pending = deferred<AudioEnrichmentBatchResult>();
    const setup = harness({
      statuses: [
        status({ currentlyEligibleRemainingCount: 2 }),
        status({ audioCoveredTrackCount: 21, currentlyEligibleRemainingCount: 1 }),
      ],
      enrichOneBatch: vi.fn(() => pending.promise),
    });
    const running = setup.orchestrator.start();
    await vi.waitFor(() => expect(setup.enrichOneBatch).toHaveBeenCalledTimes(1));

    setup.orchestrator.pause();
    expect(setup.orchestrator.getSnapshot().state).toBe('pause_requested');
    pending.resolve(batch());
    await running;

    expect(setup.orchestrator.getSnapshot()).toMatchObject({
      state: 'paused',
      batchesCompleted: 1,
      tracksNewlyEnriched: 1,
    });
    expect(setup.enrichOneBatch).toHaveBeenCalledTimes(1);
    expect(setup.wait).not.toHaveBeenCalled();
  });

  it('fetches fresh persisted status before Resume and skips already completed work', async () => {
    const order: string[] = [];
    const statuses = [
      status({ currentlyEligibleRemainingCount: 2 }),
      status({ currentlyEligibleRemainingCount: 2 }),
      status({ audioCoveredTrackCount: 21, currentlyEligibleRemainingCount: 1 }),
      status({ audioCoveredTrackCount: 22, currentlyEligibleRemainingCount: 0 }),
    ];
    const getStatus = vi.fn(async () => {
      order.push('GET');
      return statuses.shift() ?? status({ currentlyEligibleRemainingCount: 0 });
    });
    let attempt = 0;
    const enrichOneBatch = vi.fn(async () => {
      order.push('POST');
      attempt += 1;
      if (attempt === 1) throw new BulkEnrichmentRequestError('rate_limited', 30);
      return batch();
    });
    const orchestrator = new BulkAudioEnrichmentOrchestrator(status(), {
      getStatus,
      enrichOneBatch,
      wait: vi.fn().mockResolvedValue(undefined),
      onSnapshot: vi.fn(),
    });

    await orchestrator.start();
    expect(orchestrator.getSnapshot()).toMatchObject({
      state: 'rate_limited',
      retryAfterSeconds: 30,
    });
    expect(enrichOneBatch).toHaveBeenCalledTimes(1);

    await orchestrator.resume();
    expect(order).toEqual(['GET', 'POST', 'GET', 'GET', 'POST', 'GET']);
    expect(orchestrator.getSnapshot()).toMatchObject({ state: 'completed' });
  });

  it('stops a 429 immediately without automatic retry and retains refreshed progress', async () => {
    const setup = harness({
      statuses: [
        status({ audioCoveredTrackCount: 20, currentlyEligibleRemainingCount: 3 }),
        status({ audioCoveredTrackCount: 21, currentlyEligibleRemainingCount: 2 }),
      ],
      enrichOneBatch: vi.fn().mockRejectedValue(new BulkEnrichmentRequestError('rate_limited', 45)),
    });

    await setup.orchestrator.start();

    expect(setup.enrichOneBatch).toHaveBeenCalledTimes(1);
    expect(setup.wait).not.toHaveBeenCalled();
    expect(setup.orchestrator.getSnapshot()).toMatchObject({
      state: 'rate_limited',
      tracksNewlyEnriched: 1,
      retryAfterSeconds: 45,
      status: { audioCoveredTrackCount: 21, currentlyEligibleRemainingCount: 2 },
    });
  });

  it('stops a generic provider/server error without retrying', async () => {
    const setup = harness({
      statuses: [status({ currentlyEligibleRemainingCount: 3 })],
      enrichOneBatch: vi.fn().mockRejectedValue(new BulkEnrichmentRequestError('provider_error')),
    });

    await setup.orchestrator.start();

    expect(setup.orchestrator.getSnapshot().state).toBe('provider_error');
    expect(setup.enrichOneBatch).toHaveBeenCalledTimes(1);
    expect(setup.wait).not.toHaveBeenCalled();
  });

  it('stops after two consecutive successful batches with no meaningful progress', async () => {
    const unchanged = status({ audioCoveredTrackCount: 20, currentlyEligibleRemainingCount: 3 });
    const setup = harness({
      statuses: [unchanged, unchanged, unchanged],
      enrichOneBatch: vi.fn().mockResolvedValue(
        batch({
          result: 'no_changes',
          attemptedTrackCount: 0,
          enrichedTrackCount: 0,
          notFoundTrackCount: 0,
        }),
      ),
    });

    await setup.orchestrator.start();

    expect(MAX_CONSECUTIVE_NO_PROGRESS_BATCHES).toBe(2);
    expect(setup.enrichOneBatch).toHaveBeenCalledTimes(2);
    expect(setup.wait).toHaveBeenCalledTimes(1);
    expect(setup.orchestrator.getSnapshot()).toMatchObject({
      state: 'no_progress',
      batchesCompleted: 2,
      tracksNewlyEnriched: 0,
    });
  });

  it('completes from persisted eligibility without implying full coverage or sending a POST', async () => {
    const incompleteCoverage = status({
      currentSavedTrackCount: 100,
      audioCoveredTrackCount: 80,
      audioCoveragePercent: 80,
      coverageQuality: 'MEDIUM',
      currentlyEligibleRemainingCount: 0,
      coolingDownCount: 20,
    });
    const setup = harness({ statuses: [incompleteCoverage] });

    await setup.orchestrator.start();

    expect(setup.orchestrator.getSnapshot()).toMatchObject({
      state: 'completed',
      status: incompleteCoverage,
    });
    expect(setup.enrichOneBatch).not.toHaveBeenCalled();
  });
});
