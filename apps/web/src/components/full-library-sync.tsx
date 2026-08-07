'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { runFullLibrarySync } from './full-library-sync-client';

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
  summary: {
    savedTrackCount: number;
    uniqueArtistCount: number;
    totalDurationMs: number;
  } | null;
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

  const synchronize = useCallback(async () => {
    if (active.current) return;
    active.current = true;
    setWorking(true);
    setError(null);

    try {
      await runFullLibrarySync(async () => {
        const response = await fetch('/api/spotify/library/sync', {
          method: 'POST',
          headers: { Accept: 'application/json' },
          credentials: 'same-origin',
        });
        const payload: unknown = await response.json().catch(() => null);

        if (!response.ok || !isSyncState(payload)) {
          const code =
            payload && typeof payload === 'object' && 'error' in payload
              ? (payload as { error?: { code?: string } }).error?.code
              : null;
          setError(
            code === 'authorization_expired'
              ? 'Reconnect required before synchronization can continue.'
              : code === 'rate_limited'
                ? 'Spotify is rate limiting requests. Wait, then retry.'
                : 'Synchronization was interrupted. Your previous complete snapshot is safe; retry to resume.',
          );
          await loadStatus();
          throw new Error('Synchronization step failed.');
        }

        return payload;
      }, setState);
    } catch (caughtError) {
      if (
        !(caughtError instanceof Error) ||
        caughtError.message !== 'Synchronization step failed.'
      ) {
        setError('Synchronization was interrupted. Check your connection and retry to resume.');
        await loadStatus();
      }
    } finally {
      active.current = false;
      setWorking(false);
    }
  }, [loadStatus]);

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
            Full library sync
          </h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400" aria-live="polite">
            {working || (state?.status === 'running' && !state.failureCode)
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
          <button
            type="button"
            onClick={() => void synchronize()}
            disabled={working || state === null}
            className="rounded-full bg-emerald-300 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
          >
            {working ? 'Syncing…' : state?.lastSuccessfulSyncAt ? 'Resync library' : 'Sync library'}
          </button>
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
