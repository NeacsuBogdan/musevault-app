'use client';

import { useEffect, useRef, useState } from 'react';

import type {
  AudioEnrichmentBatchResult,
  AudioEnrichmentStatus,
} from '@/lib/audio-features/contracts';
import {
  BulkAudioEnrichmentOrchestrator,
  BulkEnrichmentRequestError,
  type BulkEnrichmentSnapshot,
} from '@/lib/audio-features/bulk-orchestrator';

import { AudioEnrichmentButton } from './audio-enrichment-button';

const initialSnapshot = (status: AudioEnrichmentStatus): BulkEnrichmentSnapshot => ({
  state:
    status.currentSavedTrackCount > 0 && status.currentlyEligibleRemainingCount === 0
      ? 'completed'
      : 'idle',
  status,
  batchesCompleted: 0,
  tracksNewlyEnriched: 0,
  retryAfterSeconds: null,
});

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function parseStatus(value: unknown): AudioEnrichmentStatus {
  if (!value || typeof value !== 'object') throw new BulkEnrichmentRequestError('provider_error');
  const candidate = value as Partial<AudioEnrichmentStatus>;
  if (
    !isCount(candidate.currentSavedTrackCount) ||
    !isCount(candidate.audioCoveredTrackCount) ||
    !isCount(candidate.currentlyEligibleRemainingCount) ||
    !isCount(candidate.coolingDownCount) ||
    !['LOW', 'MEDIUM', 'HIGH'].includes(candidate.coverageQuality ?? '') ||
    !(
      candidate.audioCoveragePercent === null ||
      (typeof candidate.audioCoveragePercent === 'number' &&
        Number.isFinite(candidate.audioCoveragePercent) &&
        candidate.audioCoveragePercent >= 0 &&
        candidate.audioCoveragePercent <= 100)
    )
  )
    throw new BulkEnrichmentRequestError('provider_error');
  return candidate as AudioEnrichmentStatus;
}

function parseBatch(value: unknown): AudioEnrichmentBatchResult {
  if (!value || typeof value !== 'object') throw new BulkEnrichmentRequestError('provider_error');
  const candidate = value as Partial<AudioEnrichmentBatchResult>;
  if (
    candidate.provider !== 'reccobeats' ||
    !['applied', 'no_changes'].includes(candidate.result ?? '') ||
    !isCount(candidate.attemptedTrackCount) ||
    !isCount(candidate.enrichedTrackCount) ||
    !isCount(candidate.notFoundTrackCount)
  )
    throw new BulkEnrichmentRequestError('provider_error');
  return candidate as AudioEnrichmentBatchResult;
}

export async function fetchPersistedStatus(): Promise<AudioEnrichmentStatus> {
  const response = await fetch('/api/audio-profile/enrichment-status', {
    method: 'GET',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) throw new BulkEnrichmentRequestError('provider_error');
  return parseStatus(await response.json().catch(() => null));
}

export function replacePersistedStatus(
  snapshot: BulkEnrichmentSnapshot,
  status: AudioEnrichmentStatus,
): BulkEnrichmentSnapshot {
  return {
    ...snapshot,
    state:
      status.currentlyEligibleRemainingCount === 0
        ? 'completed'
        : snapshot.state === 'completed'
          ? 'idle'
          : snapshot.state,
    status,
  };
}

async function enrichOneSavedBatch(): Promise<AudioEnrichmentBatchResult> {
  const response = await fetch('/api/audio-features/enrichment', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ scope: 'saved_library' }),
  });
  const payload = (await response.json().catch(() => null)) as {
    error?: { retryAfter?: unknown };
  } | null;
  if (!response.ok) {
    const retryAfter = payload?.error?.retryAfter;
    throw new BulkEnrichmentRequestError(
      response.status === 429 ? 'rate_limited' : 'provider_error',
      isCount(retryAfter) ? retryAfter : null,
    );
  }
  return parseBatch(payload);
}

const stateCopy = {
  idle: 'Ready for an explicit enrichment action.',
  running: 'Running the next bounded batch…',
  pause_requested: 'Finishing the active request before pausing…',
  paused: 'Paused. No new batch will begin until you resume.',
  completed: 'All currently eligible tracks have been processed.',
  rate_limited: 'Enrichment paused because the provider rate limit was reached.',
  provider_error: 'Enrichment stopped after a provider or server error. You can resume later.',
  no_progress:
    'No further currently eligible tracks could be enriched after two batches. You can retry later.',
} as const;

export function enrichmentStateMessage(snapshot: BulkEnrichmentSnapshot): string {
  return snapshot.state === 'completed' &&
    snapshot.status.audioCoveredTrackCount === snapshot.status.currentSavedTrackCount
    ? 'Every current saved track has available cached audio features.'
    : stateCopy[snapshot.state];
}

export function coolingDownMessage(status: AudioEnrichmentStatus): string | null {
  if (status.currentlyEligibleRemainingCount !== 0 || status.coolingDownCount === 0) return null;
  const tracks = status.coolingDownCount === 1 ? 'track is' : 'tracks are';
  return `${status.coolingDownCount.toLocaleString()} ${tracks} currently cooling down after repeated provider omissions.`;
}

const qualityLabels = { LOW: 'Low coverage', MEDIUM: 'Medium coverage', HIGH: 'High coverage' };

function formatPercent(value: number | null): string {
  return value === null ? '—' : `${Math.round(value)}%`;
}

export function AudioEnrichmentControls({
  initialStatus,
}: {
  initialStatus: AudioEnrichmentStatus;
}) {
  const [snapshot, setSnapshot] = useState(() => initialSnapshot(initialStatus));
  const [singleBatchWorking, setSingleBatchWorking] = useState(false);
  const [statusRefreshWorking, setStatusRefreshWorking] = useState(false);
  const [statusRefreshError, setStatusRefreshError] = useState(false);
  const mounted = useRef(true);
  const [orchestrator] = useState(
    () =>
      new BulkAudioEnrichmentOrchestrator(initialStatus, {
        getStatus: fetchPersistedStatus,
        enrichOneBatch: enrichOneSavedBatch,
        onSnapshot: (next) => {
          if (mounted.current) setSnapshot(next);
        },
      }),
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      orchestrator.pause();
    };
  }, [orchestrator]);

  const bulkActive = snapshot.state === 'running' || snapshot.state === 'pause_requested';
  const canResume = ['paused', 'rate_limited', 'provider_error', 'no_progress'].includes(
    snapshot.state,
  );
  const hasEligibleTracks = snapshot.status.currentlyEligibleRemainingCount > 0;
  const coverageWidth = Math.max(0, Math.min(100, snapshot.status.audioCoveragePercent ?? 0));
  const cooldownCopy = coolingDownMessage(snapshot.status);

  async function refreshStatus() {
    setStatusRefreshWorking(true);
    setStatusRefreshError(false);
    try {
      const status = await fetchPersistedStatus();
      if (mounted.current) setSnapshot((current) => replacePersistedStatus(current, status));
    } catch {
      if (mounted.current) setStatusRefreshError(true);
    } finally {
      if (mounted.current) setStatusRefreshWorking(false);
    }
  }

  function startBulkEnrichment() {
    if (!hasEligibleTracks || bulkActive || singleBatchWorking || statusRefreshWorking) return;
    void orchestrator.start();
  }

  function resumeBulkEnrichment() {
    if (!hasEligibleTracks || bulkActive || singleBatchWorking || statusRefreshWorking) return;
    void orchestrator.resume();
  }

  function pauseBulkEnrichment() {
    orchestrator.pause();
  }

  const noSavedTracks = snapshot.status.currentSavedTrackCount === 0;

  return (
    <section className="mt-10 rounded-panel border border-border-subtle bg-surface p-7">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-section-title font-semibold">Audio enrichment</h2>
            <span className="rounded-pill border border-border-strong px-3 py-1 text-caption font-semibold uppercase tracking-wide text-text-secondary">
              {qualityLabels[snapshot.status.coverageQuality]}
            </span>
          </div>
          <p className="mt-3 text-lg font-semibold">
            {snapshot.status.audioCoveredTrackCount.toLocaleString()} /{' '}
            {snapshot.status.currentSavedTrackCount.toLocaleString()} covered ·{' '}
            {formatPercent(snapshot.status.audioCoveragePercent)}
          </p>
          <p className="mt-2 max-w-3xl text-body-sm text-text-secondary">
            Current saved-library coverage excludes removed tracks even when their global cached
            features remain available.
          </p>
          <div
            className="mt-3 h-2 max-w-2xl overflow-hidden rounded-pill bg-border-subtle"
            role="progressbar"
            aria-label="Saved-library audio coverage"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(coverageWidth)}
          >
            <div
              className="h-full rounded-pill bg-accent-green"
              style={{ width: `${coverageWidth}%` }}
            />
          </div>
          <dl className="mt-5 grid gap-3 text-body-sm sm:grid-cols-2 lg:grid-cols-4">
            <ProgressFact
              label="Currently eligible"
              value={snapshot.status.currentlyEligibleRemainingCount}
            />
            <ProgressFact label="Cooling down" value={snapshot.status.coolingDownCount} />
            <ProgressFact label="Batches this run" value={snapshot.batchesCompleted} />
            <ProgressFact label="Newly enriched this run" value={snapshot.tracksNewlyEnriched} />
          </dl>
        </div>
        <div className="flex flex-wrap gap-3">
          {!noSavedTracks ? (
            <AudioEnrichmentButton
              disabled={bulkActive || !hasEligibleTracks || statusRefreshWorking}
              hasCoverage={snapshot.status.audioCoveredTrackCount > 0}
              onWorkingChange={setSingleBatchWorking}
            />
          ) : null}
          <button
            type="button"
            disabled={bulkActive || singleBatchWorking || statusRefreshWorking}
            onClick={() => void refreshStatus()}
            className="rounded-control border border-border-strong px-5 py-2.5 text-body-sm font-semibold text-text-primary disabled:opacity-60"
          >
            {statusRefreshWorking ? 'Refreshing status…' : 'Refresh status'}
          </button>
          {bulkActive ? (
            <button
              type="button"
              disabled={snapshot.state === 'pause_requested'}
              onClick={pauseBulkEnrichment}
              className="rounded-control border border-border-strong px-5 py-2.5 text-body-sm font-semibold text-text-primary disabled:opacity-60"
            >
              {snapshot.state === 'pause_requested' ? 'Pause requested' : 'Pause'}
            </button>
          ) : hasEligibleTracks && canResume ? (
            <button
              type="button"
              disabled={singleBatchWorking || statusRefreshWorking}
              onClick={resumeBulkEnrichment}
              className="rounded-control border border-border-strong px-5 py-2.5 text-body-sm font-semibold text-text-primary disabled:opacity-60"
            >
              Resume
            </button>
          ) : hasEligibleTracks ? (
            <button
              type="button"
              disabled={singleBatchWorking || statusRefreshWorking}
              onClick={startBulkEnrichment}
              className="rounded-control border border-border-strong px-5 py-2.5 text-body-sm font-semibold text-text-primary disabled:opacity-60"
            >
              Enrich all remaining
            </button>
          ) : null}
        </div>
      </div>

      {statusRefreshError ? (
        <p role="alert" className="mt-4 text-body-sm text-amber-200">
          Current enrichment status could not be refreshed. Try again later.
        </p>
      ) : null}

      <div className="mt-6 rounded-card border border-border-subtle bg-page p-4">
        <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
          Current state
        </p>
        <p role="status" className="mt-2 text-body-sm text-text-secondary">
          {enrichmentStateMessage(snapshot)}
        </p>
        {snapshot.state === 'rate_limited' && snapshot.retryAfterSeconds !== null ? (
          <p className="mt-2 text-caption text-text-muted">
            Provider response requested waiting {snapshot.retryAfterSeconds} seconds before trying
            again.
          </p>
        ) : null}
        {cooldownCopy ? <p className="mt-2 text-caption text-text-muted">{cooldownCopy}</p> : null}
        {snapshot.state !== 'idle' && snapshot.state !== 'running' ? (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-3 text-body-sm font-semibold text-accent-green"
          >
            Reload sound profile
          </button>
        ) : null}
      </div>

      <p className="mt-4 max-w-4xl text-caption text-text-muted">
        Bulk enrichment runs one existing bounded server batch at a time. Closing this tab or
        navigating away stops the browser loop; completed batches remain saved.
      </p>
    </section>
  );
}

function ProgressFact({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-card border border-border-subtle bg-page p-3">
      <dt className="text-text-muted">{label}</dt>
      <dd className="mt-1 text-lg font-semibold text-text-primary">{value.toLocaleString()}</dd>
    </div>
  );
}
