import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AudioEnrichmentStatus } from '@/lib/audio-features/contracts';
import type { BulkEnrichmentSnapshot } from '@/lib/audio-features/bulk-orchestrator';

import {
  coolingDownMessage,
  enrichmentStateMessage,
  fetchPersistedStatus,
  replacePersistedStatus,
} from './audio-enrichment-controls';

const controls = readFileSync(new URL('./audio-enrichment-controls.tsx', import.meta.url), 'utf8');
const button = readFileSync(new URL('./audio-enrichment-button.tsx', import.meta.url), 'utf8');
const normalized = `${controls} ${button}`.replace(/\s+/g, ' ');

const status = (overrides: Partial<AudioEnrichmentStatus> = {}): AudioEnrichmentStatus => ({
  currentSavedTrackCount: 3_009,
  audioCoveredTrackCount: 2_363,
  audioCoveragePercent: 78.53,
  coverageQuality: 'HIGH',
  currentlyEligibleRemainingCount: 0,
  coolingDownCount: 646,
  ...overrides,
});

const snapshot = (current: AudioEnrichmentStatus): BulkEnrichmentSnapshot => ({
  state: 'completed',
  status: current,
  batchesCompleted: 0,
  tracksNewlyEnriched: 0,
  retryAfterSeconds: null,
});

afterEach(() => vi.restoreAllMocks());

describe('bulk audio enrichment controls', () => {
  it('provides separate refresh, single-batch, bulk, Pause, and Resume actions', () => {
    for (const text of [
      'Refresh status',
      'Enrich next batch',
      'Enrich all remaining',
      'Pause',
      'Resume',
    ])
      expect(normalized).toContain(text);
    expect(normalized).not.toContain('Check again');
  });

  it('shows factual persisted progress and per-run counters', () => {
    for (const text of [
      'Currently eligible',
      'Cooling down',
      'Batches this run',
      'Newly enriched this run',
      'Current state',
      'Saved-library audio coverage',
    ])
      expect(normalized).toContain(text);
  });

  it('uses database status around saved-library POSTs without starting on mount', () => {
    expect(controls).toContain("fetch('/api/audio-profile/enrichment-status'");
    expect(controls).toContain("fetch('/api/audio-features/enrichment'");
    expect(controls).toContain("JSON.stringify({ scope: 'saved_library' })");
    const effect = controls.slice(
      controls.indexOf('useEffect('),
      controls.indexOf('const bulkActive'),
    );
    expect(effect).not.toContain('.start(');
    expect(effect).not.toContain('.resume(');
    expect(effect).not.toContain('fetch(');
  });

  it.each([status(), status({ currentlyEligibleRemainingCount: 4, coolingDownCount: 642 })])(
    'refreshes stale client status with one database GET and no enrichment request: %#',
    async (freshStatus) => {
      const fetch = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(JSON.stringify(freshStatus), { status: 200 }));

      const returned = await fetchPersistedStatus();
      const refreshed = replacePersistedStatus(snapshot(status()), returned);

      expect(refreshed.status).toEqual(freshStatus);
      expect(refreshed.state).toBe(
        freshStatus.currentlyEligibleRemainingCount === 0 ? 'completed' : 'idle',
      );
      expect(fetch).toHaveBeenCalledExactlyOnceWith(
        '/api/audio-profile/enrichment-status',
        expect.objectContaining({ method: 'GET', cache: 'no-store' }),
      );
      expect(fetch.mock.calls.some(([url]) => String(url).includes('audio-features'))).toBe(false);
    },
  );

  it('keeps Refresh status isolated from bulk start, Resume, POST, Spotify, and providers', () => {
    const refreshHandler = controls.slice(
      controls.indexOf('async function refreshStatus()'),
      controls.indexOf('function startBulkEnrichment()'),
    );
    expect(refreshHandler).toContain('fetchPersistedStatus()');
    expect(refreshHandler).toContain('replacePersistedStatus(current, status)');
    expect(refreshHandler).not.toMatch(
      /orchestrator|\.start\(|\.resume\(|enrichOneSavedBatch|method: 'POST'|spotify|reccobeats/i,
    );
    expect(controls).toContain('onClick={() => void refreshStatus()}');
  });

  it('shows provider-backed bulk controls only for eligible work with distinct handlers', () => {
    expect(controls).toContain('hasEligibleTracks && canResume');
    expect(controls).toContain(') : hasEligibleTracks ? (');
    expect(controls).toContain('onClick={startBulkEnrichment}');
    expect(controls).toContain('onClick={resumeBulkEnrichment}');
    expect(controls).toContain('onClick={pauseBulkEnrichment}');
    expect(controls).toContain('void orchestrator.start()');
    expect(controls).toContain('void orchestrator.resume()');
  });

  it('disables single-batch enrichment when bulk is active or no saved tracks are eligible', () => {
    expect(controls).toContain(
      'disabled={bulkActive || !hasEligibleTracks || statusRefreshWorking}',
    );
  });

  it('states pause, rate-limit, error, no-progress, and completion semantics truthfully', () => {
    for (const text of [
      'Finishing the active request before pausing',
      'provider rate limit was reached',
      'provider or server error',
      'after two batches',
      'All currently eligible tracks have been processed',
      'Every current saved track has available cached audio features',
    ])
      expect(normalized).toContain(text);
    expect(normalized).not.toMatch(
      /permanently unavailable|missing from Spotify|impossible to enrich|full library complete/i,
    );
  });

  it('renders the real incomplete-coverage cooldown state without permanent or full-coverage claims', () => {
    const current = snapshot(status());
    expect(enrichmentStateMessage(current)).toBe(
      'All currently eligible tracks have been processed.',
    );
    expect(coolingDownMessage(current.status)).toBe(
      '646 tracks are currently cooling down after repeated provider omissions.',
    );
    expect(enrichmentStateMessage(current)).not.toMatch(/every current saved track|full/i);
  });

  it('documents navigation stop semantics and uses no background/unload mechanism', () => {
    expect(normalized).toContain('Closing this tab or navigating away stops the browser loop');
    expect(controls).toContain('orchestrator.pause()');
    expect(controls).not.toMatch(/beforeunload|serviceWorker|new Worker|SharedWorker/);
  });
});
