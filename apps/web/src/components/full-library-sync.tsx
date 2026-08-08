'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { runFullLibrarySync, runIncrementalThenFullSync } from './full-library-sync-client';

type SyncState = {
  status: 'never_synced' | 'running' | 'completed' | 'failed';
  processedTrackCount: number;
  spotifyTotal: number | null;
  failureCode:
    | 'authorization_expired'
    | 'rate_limited'
    | 'temporarily_unavailable'
    | 'database_failure'
    | 'unexpected_failure'
    | null;
  lastSuccessfulSyncAt: string | null;
  summary: { savedTrackCount: number; uniqueArtistCount: number; totalDurationMs: number } | null;
};

function isSyncState(value: unknown): value is SyncState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Record<string, unknown>;
  return (
    ['never_synced', 'running', 'completed', 'failed'].includes(String(state.status)) &&
    typeof state.processedTrackCount === 'number' &&
    (typeof state.spotifyTotal === 'number' || state.spotifyTotal === null)
  );
}

function formatDuration(milliseconds: number): string {
  const hours = Math.floor(milliseconds / 3_600_000);
  return `${hours.toLocaleString()} hour${hours === 1 ? '' : 's'}`;
}

export function FullLibrarySync() {
  const [state, setState] = useState<SyncState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const active = useRef(false);

  const loadStatus = useCallback(async () => {
    const response = await fetch('/api/spotify/library/sync', {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    const payload: unknown = await response.json().catch(() => null);
    if (response.ok && isSyncState(payload)) setState(payload);
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const post = useCallback(async (url: string): Promise<unknown> => {
    for (;;) {
      const response = await fetch(url, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });
      const payload: unknown = await response.json().catch(() => null);
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get('retry-after'));
        if (Number.isFinite(retryAfter) && retryAfter >= 0) {
          await new Promise((resolve) => window.setTimeout(resolve, retryAfter * 1000));
          continue;
        }
      }
      if (!response.ok) {
        const code =
          payload && typeof payload === 'object' && 'error' in payload
            ? (payload as { error?: { code?: string } }).error?.code
            : null;
        throw new Error(code ?? 'sync_failed');
      }
      return payload;
    }
  }, []);

  const fullStep = useCallback(async () => {
    const payload = await post('/api/spotify/library/sync');
    if (!isSyncState(payload)) throw new Error('sync_failed');
    return payload;
  }, [post]);

  const synchronize = useCallback(
    async (forceFull: boolean) => {
      if (active.current) return;
      active.current = true;
      setWorking(true);
      setError(null);
      setMessage(forceFull ? 'Full reconciliation required...' : 'Checking recent changes...');
      try {
        if (forceFull || !state?.lastSuccessfulSyncAt) {
          await runFullLibrarySync(fullStep, setState);
        } else {
          const result = await runIncrementalThenFullSync(
            async () => {
              const payload = await post('/api/spotify/library/sync/incremental');
              if (!payload || typeof payload !== 'object' || !('result' in payload))
                throw new Error('sync_failed');
              return payload as { result: string };
            },
            fullStep,
            (incremental) =>
              setMessage(
                incremental.result === 'applied'
                  ? 'Changes synced.'
                  : incremental.result === 'no_changes'
                    ? 'Library is up to date.'
                    : incremental.result === 'sync_in_progress'
                      ? 'Another sync is already running.'
                      : 'Full reconciliation required...',
              ),
            setState,
          );
          if ('result' in result && result.result === 'sync_in_progress') return;
          setMessage(
            'result' in result
              ? result.result === 'applied'
                ? 'Changes synced.'
                : 'Library is up to date.'
              : 'Library fully synced.',
          );
          await loadStatus();
          return;
        }
        setMessage('Library fully synced.');
        await loadStatus();
      } catch (caught) {
        setMessage(null);
        setError(
          caught instanceof Error && caught.message === 'authorization_expired'
            ? 'Reconnect required before synchronization can continue.'
            : 'Synchronization was interrupted. Your previous complete snapshot is safe; retry to resume.',
        );
        await loadStatus();
      } finally {
        active.current = false;
        setWorking(false);
      }
    },
    [fullStep, loadStatus, post, state?.lastSuccessfulSyncAt],
  );

  const reconnectRequired = state?.failureCode === 'authorization_expired';
  const progress = state
    ? `${state.processedTrackCount.toLocaleString()}${state.spotifyTotal === null ? '' : ` of ${state.spotifyTotal.toLocaleString()}`} tracks processed`
    : 'Loading synchronization status';

  return (
    <section
      className="mt-10 rounded-2xl border border-white/10 bg-white/[0.025] p-6 sm:p-8"
      aria-labelledby="full-sync-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-300">
            Persistent library
          </p>
          <h2 id="full-sync-heading" className="mt-2 text-2xl font-semibold text-white">
            Library synchronization
          </h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400" aria-live="polite">
            {message
              ? message
              : state?.status === 'running' && !state.failureCode
                ? `Syncing · ${progress}`
                : state?.failureCode === 'authorization_expired'
                  ? 'Reconnect required'
                  : state?.failureCode === 'rate_limited'
                    ? 'Temporarily rate limited · retry available'
                    : state?.failureCode
                      ? 'Sync interrupted · retry available'
                      : state?.status === 'completed'
                        ? `Synced · ${progress}`
                        : state?.status === 'failed'
                          ? 'Sync interrupted · retry available'
                          : 'Never synced'}
          </p>
          {state?.lastSuccessfulSyncAt ? (
            <p className="mt-1 text-xs text-zinc-500">
              Last successful sync {new Date(state.lastSuccessfulSyncAt).toLocaleString()}
            </p>
          ) : null}
        </div>
        {reconnectRequired ? (
          <a
            href="/api/auth/spotify/login"
            className="rounded-full bg-emerald-300 px-5 py-2.5 text-sm font-semibold text-zinc-950"
          >
            Reconnect Spotify
          </a>
        ) : (
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void synchronize(false)}
              disabled={working || state === null}
              className="rounded-full bg-emerald-300 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
            >
              {working ? 'Syncing…' : state?.lastSuccessfulSyncAt ? 'Sync changes' : 'Sync library'}
            </button>
            {state?.lastSuccessfulSyncAt ? (
              <button
                type="button"
                onClick={() => void synchronize(true)}
                disabled={working}
                className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:text-zinc-500"
              >
                Full resync
              </button>
            ) : null}
          </div>
        )}
      </div>
      {error ? (
        <p className="mt-5 text-sm text-amber-200" role="alert">
          {error}
        </p>
      ) : null}
      {state?.summary && state.lastSuccessfulSyncAt ? (
        <dl className="mt-6 grid gap-4 border-t border-white/10 pt-6 sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-wide text-zinc-500">Saved tracks</dt>
            <dd className="mt-1 text-lg font-semibold text-white">
              {state.summary.savedTrackCount.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-zinc-500">Unique artists</dt>
            <dd className="mt-1 text-lg font-semibold text-white">
              {state.summary.uniqueArtistCount.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-zinc-500">Total duration</dt>
            <dd className="mt-1 text-lg font-semibold text-white">
              {formatDuration(state.summary.totalDurationMs)}
            </dd>
          </div>
        </dl>
      ) : null}
    </section>
  );
}
