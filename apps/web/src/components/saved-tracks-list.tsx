'use client';

import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import type { SavedTrack, SavedTracksPage } from '@/types/spotify';

type SavedTracksResponse = SavedTracksPage;

type ErrorCode =
  | 'AUTHORIZATION_EXPIRED'
  | 'UNAUTHENTICATED'
  | 'RATE_LIMITED'
  | 'FORBIDDEN'
  | 'UNKNOWN';

type RequestError = {
  code: ErrorCode;
  message: string;
  retryAfter: number | null;
};

type LoadState =
  | { status: 'loading' }
  | { status: 'success'; data: SavedTracksResponse }
  | { status: 'error'; error: RequestError };

const actionClasses =
  'inline-flex min-h-11 items-center justify-center rounded-full bg-emerald-300 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-300 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400';

const responseErrorCodes: Readonly<Record<string, ErrorCode>> = {
  AUTHORIZATION_EXPIRED: 'AUTHORIZATION_EXPIRED',
  spotify_authorization_expired: 'AUTHORIZATION_EXPIRED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  unauthenticated: 'UNAUTHENTICATED',
  RATE_LIMITED: 'RATE_LIMITED',
  spotify_rate_limited: 'RATE_LIMITED',
  FORBIDDEN: 'FORBIDDEN',
  spotify_forbidden: 'FORBIDDEN',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function errorCodeFromResponse(rawCode: string, status: number): ErrorCode {
  const mappedCode = responseErrorCodes[rawCode];

  if (mappedCode) {
    return mappedCode;
  }

  if (status === 401) {
    return 'UNAUTHENTICATED';
  }

  if (status === 429) {
    return 'RATE_LIMITED';
  }

  if (status === 403) {
    return 'FORBIDDEN';
  }

  return 'UNKNOWN';
}

function isSavedTrack(value: unknown): value is SavedTrack {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    typeof value.spotifyUrl === 'string' &&
    typeof value.name === 'string' &&
    Array.isArray(value.artistNames) &&
    value.artistNames.every((artistName) => typeof artistName === 'string') &&
    typeof value.albumName === 'string' &&
    (typeof value.albumImageUrl === 'string' || value.albumImageUrl === null) &&
    typeof value.durationMs === 'number' &&
    typeof value.explicit === 'boolean' &&
    typeof value.savedAt === 'string'
  );
}

function isSavedTracksResponse(value: unknown): value is SavedTracksResponse {
  if (!isRecord(value)) {
    return false;
  }

  return (
    Array.isArray(value.items) &&
    value.items.every(isSavedTrack) &&
    typeof value.total === 'number' &&
    typeof value.limit === 'number' &&
    typeof value.offset === 'number'
  );
}

function readError(
  payload: unknown,
  status: number,
  retryAfterHeader: string | null,
): RequestError {
  const root = isRecord(payload) ? payload : {};
  const nestedError = isRecord(root.error) ? root.error : root;
  const rawCode =
    typeof nestedError.code === 'string'
      ? nestedError.code
      : typeof root.error === 'string'
        ? root.error
        : '';
  const code = errorCodeFromResponse(rawCode, status);
  const rawRetryAfter =
    nestedError.retryAfter ??
    nestedError.retryAfterSeconds ??
    nestedError.retry_after ??
    root.retryAfter ??
    root.retryAfterSeconds ??
    root.retry_after ??
    retryAfterHeader;
  const retryAfter =
    typeof rawRetryAfter === 'number' && Number.isFinite(rawRetryAfter) && rawRetryAfter > 0
      ? Math.ceil(rawRetryAfter)
      : typeof rawRetryAfter === 'string' && Number(rawRetryAfter) > 0
        ? Math.ceil(Number(rawRetryAfter))
        : null;

  return {
    code,
    message:
      typeof nestedError.message === 'string'
        ? nestedError.message
        : 'MuseVault could not load your saved tracks.',
    retryAfter,
  };
}

function formatDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatSavedDate(savedAt: string) {
  const date = new Date(savedAt);

  if (Number.isNaN(date.getTime())) {
    return 'Unknown date';
  }

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function isAllowedSpotifyImage(imageUrl: string | null): imageUrl is string {
  if (!imageUrl) {
    return false;
  }

  try {
    const url = new URL(imageUrl);
    return url.protocol === 'https:' && url.hostname === 'i.scdn.co';
  } catch {
    return false;
  }
}

function isAllowedSpotifyTrackUrl(spotifyUrl: string) {
  try {
    const url = new URL(spotifyUrl);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'open.spotify.com' &&
      url.pathname.startsWith('/track/')
    );
  } catch {
    return false;
  }
}

function LoadingState() {
  return (
    <div role="status" className="mt-7">
      <span className="sr-only">Loading saved tracks</span>
      <div className="space-y-3" aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="grid grid-cols-[4rem_1fr] gap-4 rounded-2xl border border-white/5 bg-white/[0.025] p-3 motion-safe:animate-pulse"
          >
            <div className="h-16 w-16 rounded-xl bg-white/10" />
            <div className="flex flex-col justify-center gap-3">
              <div className="h-4 w-3/5 rounded bg-white/10" />
              <div className="h-3 w-2/5 rounded bg-white/5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mt-7 rounded-2xl border border-dashed border-white/15 bg-white/[0.025] px-6 py-14 text-center">
      <h3 className="text-lg font-semibold text-white">Your saved library is empty</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-400">
        Save a track in Spotify, then return here and try again. MuseVault does not add or change
        tracks for you.
      </p>
    </div>
  );
}

type RateLimitedStateProps = {
  retryAfter: number | null;
  onRetry: () => void;
};

function RateLimitedState({ retryAfter, onRetry }: RateLimitedStateProps) {
  const [remainingSeconds, setRemainingSeconds] = useState(retryAfter ?? 0);

  useEffect(() => {
    if (!retryAfter) {
      return;
    }

    const interval = window.setInterval(() => {
      setRemainingSeconds((current) => {
        if (current <= 1) {
          window.clearInterval(interval);
          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [retryAfter]);

  return (
    <ErrorPanel
      title="Spotify needs a short pause"
      message={
        remainingSeconds > 0
          ? `Spotify has limited requests temporarily. You can try again in ${remainingSeconds} second${remainingSeconds === 1 ? '' : 's'}.`
          : 'Spotify limited requests temporarily. You can try loading your library again now.'
      }
    >
      <button
        type="button"
        className={actionClasses}
        onClick={onRetry}
        disabled={remainingSeconds > 0}
      >
        {remainingSeconds > 0 ? `Try again in ${remainingSeconds}s` : 'Try again'}
      </button>
    </ErrorPanel>
  );
}

type ErrorPanelProps = {
  title: string;
  message: string;
  children: React.ReactNode;
};

function ErrorPanel({ title, message, children }: ErrorPanelProps) {
  return (
    <div
      className="mt-7 rounded-2xl border border-amber-300/20 bg-amber-300/[0.055] px-6 py-10 text-center"
      role="alert"
    >
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-zinc-300">{message}</p>
      <div className="mt-6">{children}</div>
    </div>
  );
}

type ErrorStateProps = {
  error: RequestError;
  onRetry: () => void;
};

function ErrorState({ error, onRetry }: ErrorStateProps) {
  if (error.code === 'RATE_LIMITED') {
    return <RateLimitedState retryAfter={error.retryAfter} onRetry={onRetry} />;
  }

  if (error.code === 'AUTHORIZATION_EXPIRED' || error.code === 'UNAUTHENTICATED') {
    return (
      <ErrorPanel
        title="Reconnect Spotify to continue"
        message="Your Spotify authorization is missing or has expired. Reconnect to restore read-only access to your saved tracks."
      >
        <a href="/api/auth/spotify/login" className={actionClasses}>
          Reconnect Spotify
        </a>
      </ErrorPanel>
    );
  }

  return (
    <ErrorPanel
      title={error.code === 'FORBIDDEN' ? 'Saved tracks are unavailable' : 'Library unavailable'}
      message={error.message}
    >
      <button type="button" className={actionClasses} onClick={onRetry}>
        Try again
      </button>
    </ErrorPanel>
  );
}

type TrackRowProps = {
  track: SavedTrack;
};

function TrackRow({ track }: TrackRowProps) {
  const savedDate = formatSavedDate(track.savedAt);
  const trackTitle = isAllowedSpotifyTrackUrl(track.spotifyUrl) ? (
    <a
      href={track.spotifyUrl}
      target="_blank"
      rel="noreferrer"
      className="line-clamp-2 font-semibold text-white transition hover:text-emerald-200 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-300"
      aria-label={`${track.name} — open on Spotify`}
    >
      {track.name}
    </a>
  ) : (
    <span className="line-clamp-2 font-semibold text-white">{track.name}</span>
  );

  return (
    <li className="grid grid-cols-[4rem_minmax(0,1fr)] gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3 transition hover:border-white/15 hover:bg-white/[0.04] sm:grid-cols-[4rem_minmax(0,1.4fr)_minmax(10rem,0.8fr)_auto] sm:items-center">
      {isAllowedSpotifyImage(track.albumImageUrl) ? (
        <Image
          src={track.albumImageUrl}
          alt={`Cover artwork for ${track.albumName}`}
          width={64}
          height={64}
          className="h-16 w-16 rounded-xl object-cover"
        />
      ) : (
        <div
          className="flex h-16 w-16 items-center justify-center rounded-xl bg-white/[0.07] text-xl text-zinc-500"
          aria-label="No album artwork"
          role="img"
        >
          ♪
        </div>
      )}

      <div className="min-w-0 self-center">
        <div className="flex min-w-0 items-center gap-2">
          {trackTitle}
          {track.explicit ? (
            <span className="shrink-0 rounded bg-zinc-700 px-1.5 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide text-zinc-300">
              <span className="sr-only">Explicit</span>
              <span aria-hidden="true">E</span>
            </span>
          ) : null}
        </div>
        <p className="mt-1 truncate text-sm text-zinc-400">{track.artistNames.join(', ')}</p>
      </div>

      <p className="col-start-2 min-w-0 truncate text-sm text-zinc-400 sm:col-auto">
        <span className="sr-only">Album: </span>
        {track.albumName}
      </p>

      <div className="col-start-2 flex items-center gap-3 text-xs text-zinc-500 sm:col-auto sm:justify-end">
        <span>
          <span className="sr-only">Duration: </span>
          {formatDuration(track.durationMs)}
        </span>
        <span aria-hidden="true">·</span>
        <time dateTime={track.savedAt}>
          <span className="sr-only">Saved </span>
          {savedDate}
        </time>
      </div>
    </li>
  );
}

export function SavedTracksList() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((current) => current + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadSavedTracks() {
      try {
        const response = await fetch('/api/spotify/saved-tracks?limit=50&offset=0', {
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
          cache: 'no-store',
          credentials: 'same-origin',
          signal: controller.signal,
        });
        const payload: unknown = await response.json().catch(() => null);

        if (!response.ok) {
          setState({
            status: 'error',
            error: readError(payload, response.status, response.headers.get('Retry-After')),
          });
          return;
        }

        if (!isSavedTracksResponse(payload)) {
          setState({
            status: 'error',
            error: {
              code: 'UNKNOWN',
              message: 'Spotify returned saved-track data in an unexpected format.',
              retryAfter: null,
            },
          });
          return;
        }

        setState({ status: 'success', data: payload });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }

        setState({
          status: 'error',
          error: {
            code: 'UNKNOWN',
            message:
              'MuseVault could not reach the library service. Check your connection and retry.',
            retryAfter: null,
          },
        });
      }
    }

    void loadSavedTracks();

    return () => {
      controller.abort();
    };
  }, [attempt]);

  return (
    <section className="py-10" aria-labelledby="saved-tracks-heading">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2
            id="saved-tracks-heading"
            className="text-2xl font-semibold tracking-tight text-white"
          >
            First page
          </h2>
          <p className="mt-1 text-sm text-zinc-400" aria-live="polite">
            {state.status === 'success'
              ? `${state.data.total.toLocaleString()} saved track${state.data.total === 1 ? '' : 's'} total`
              : 'Loading your saved-track count'}
          </p>
        </div>
        {state.status === 'success' && state.data.items.length > 0 ? (
          <p className="text-sm text-zinc-500">
            Showing {state.data.offset + 1}–
            {Math.min(state.data.offset + state.data.items.length, state.data.total)}
          </p>
        ) : null}
      </div>

      {state.status === 'loading' ? <LoadingState /> : null}
      {state.status === 'error' ? <ErrorState error={state.error} onRetry={retry} /> : null}
      {state.status === 'success' && state.data.items.length === 0 ? <EmptyState /> : null}
      {state.status === 'success' && state.data.items.length > 0 ? (
        <ol className="mt-7 space-y-3">
          {state.data.items.map((track) => (
            <TrackRow key={`${track.id}-${track.savedAt}`} track={track} />
          ))}
        </ol>
      ) : null}
    </section>
  );
}
