'use client';

import { useRef, useState, type FormEvent } from 'react';
import {
  PLAYLIST_NAME_MAX_LENGTH,
  playlistExportResponseSchema,
  playlistNameSchema,
  type PlaylistExportResponse,
} from '@/lib/smart-playlists/export-contract';

export interface SmartPlaylistExportProps {
  definition: Record<string, string>;
  initialName: string;
  hasExportScope: boolean | null;
  returnTo: string;
  authorizationFailed: boolean;
}

const uncertainMessage =
  'MuseVault could not confirm the export result. Check your Spotify playlists before creating another playlist to avoid duplicates.';

function exportErrorMessage(error: { code: string; retryAfter: number | null }) {
  switch (error.code) {
    case 'unauthenticated':
      return 'Your session has expired. Sign in to MuseVault again before exporting.';
    case 'reauthorization_required':
      return 'Spotify permission is required only to export without publishing the playlist publicly. Your preview is still available.';
    case 'invalid_name':
      return `Enter a playlist name of 1–${PLAYLIST_NAME_MAX_LENGTH} characters without control characters.`;
    case 'invalid_definition':
    case 'invalid_body':
    case 'invalid_request':
      return 'The export request could not be accepted. Generate a valid preview and try again.';
    case 'empty_preview':
      return 'No tracks are available for this export. Generate a new preview from your current library.';
    case 'preview_unavailable':
      return 'The current library preview is unavailable. Check your library sync and generate a new preview.';
    case 'rate_limited':
      return error.retryAfter === null
        ? 'Spotify is rate limited. Wait before trying another export.'
        : `Spotify is rate limited. Wait at least ${error.retryAfter} seconds before trying another export.`;
    case 'spotify_unavailable':
      return 'Spotify could not complete the export. Check Spotify before creating another playlist.';
    default:
      return uncertainMessage;
  }
}

export function SmartPlaylistExport({
  definition,
  initialName,
  hasExportScope,
  returnTo,
  authorizationFailed,
}: SmartPlaylistExportProps) {
  const [name, setName] = useState(initialName);
  const [working, setWorking] = useState(false);
  const inFlight = useRef(false);
  const [result, setResult] = useState<PlaylistExportResponse | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const needsAuthorization =
    hasExportScope === false ||
    (result?.state !== 'success' && result?.error.code === 'reauthorization_required');
  const reconnectUrl = `/api/auth/spotify/login?${new URLSearchParams({
    capability: 'playlist-export',
    returnTo,
  })}`;

  async function createPlaylist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || hasExportScope !== true || needsAuthorization) return;
    const parsedName = playlistNameSchema.safeParse(name);
    if (!parsedName.success) {
      setLocalError(exportErrorMessage({ code: 'invalid_name', retryAfter: null }));
      return;
    }
    inFlight.current = true;
    setWorking(true);
    setResult(null);
    setLocalError(null);
    try {
      const response = await fetch('/api/spotify/playlists', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: parsedName.data, definition }),
      });
      const parsed = playlistExportResponseSchema.safeParse(await response.json());
      if (!parsed.success || (parsed.data.state === 'success' && !response.ok)) {
        setLocalError(uncertainMessage);
        return;
      }
      setResult(parsed.data);
    } catch {
      setLocalError(uncertainMessage);
    } finally {
      inFlight.current = false;
      setWorking(false);
    }
  }

  return (
    <section
      aria-label="Export Smart Playlist"
      className="mt-8 rounded-panel border border-border-subtle bg-surface p-6"
    >
      <h2 className="text-section-title font-semibold">Export to Spotify</h2>
      <p className="mt-2 text-body-sm text-text-secondary">
        MuseVault checks your current saved library again before exporting and preserves the preview
        order. It creates the playlist without publishing it publicly. Spotify manages private
        access separately in its app. Each completed export creates a separate playlist; playlists
        are not updated automatically.
      </p>
      {authorizationFailed ? (
        <p role="alert" className="mt-3 text-body-sm text-text-secondary">
          Spotify export authorization was not completed. Your preview is still available.
        </p>
      ) : null}
      {hasExportScope === null ? (
        <p role="status" className="mt-4 text-body-sm text-text-secondary">
          Export permission could not be checked. Refresh this page to try again. Your preview is
          still available.
        </p>
      ) : needsAuthorization ? (
        <div className="mt-4">
          <p className="text-body-sm text-text-secondary">
            Spotify permission is required only to export without publishing the playlist publicly.
            You can keep using MuseVault and generating previews without it.
          </p>
          <a
            href={reconnectUrl}
            className="mt-3 inline-block rounded-control bg-accent-green px-5 py-2.5 text-body-sm font-semibold text-page"
          >
            Reconnect Spotify to enable export
          </a>
        </div>
      ) : (
        <form onSubmit={(event) => void createPlaylist(event)} className="mt-4">
          <label className="block text-body-sm text-text-secondary">
            Playlist name
            <input
              name="playlistName"
              type="text"
              required
              maxLength={PLAYLIST_NAME_MAX_LENGTH}
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={working}
              className="mt-1 block w-full max-w-lg rounded-control border border-border-strong bg-page px-3 py-2 text-text-primary"
            />
          </label>
          <button
            type="submit"
            disabled={working}
            className="mt-4 rounded-control bg-accent-green px-5 py-2.5 text-body-sm font-semibold text-page disabled:opacity-60"
          >
            {working ? 'Creating playlist…' : 'Create playlist on Spotify'}
          </button>
        </form>
      )}
      {localError ? (
        <p role="alert" className="mt-4 text-body-sm text-text-secondary">
          {localError}
        </p>
      ) : null}
      {result ? (
        <div
          role={result.state === 'success' ? 'status' : 'alert'}
          className="mt-4 text-body-sm text-text-secondary"
        >
          {result.state === 'success' ? (
            <>
              <p className="font-semibold text-text-primary">Playlist created on Spotify</p>
              <p>
                {result.trackCount} {result.trackCount === 1 ? 'track' : 'tracks'} added to{' '}
                {result.playlist.name}.
              </p>
            </>
          ) : result.state === 'partial_failure' ? (
            result.error.code === 'wrong_visibility' ? (
              <>
                <p className="font-semibold text-text-primary">Playlist published unexpectedly</p>
                <p>
                  Spotify reported that the playlist was published publicly. MuseVault did not add
                  any tracks. Open it in Spotify to inspect, change, or delete it.
                </p>
              </>
            ) : (
              <>
                <p className="font-semibold text-text-primary">
                  Playlist created; tracks unconfirmed
                </p>
                <p>
                  The playlist was created, but MuseVault could not confirm that all preview tracks
                  were added. Open it in Spotify to inspect it before creating another playlist.
                </p>
                {result.error.code === 'rate_limited' ? (
                  <p>{exportErrorMessage(result.error)}</p>
                ) : null}
              </>
            )
          ) : (
            <p>{exportErrorMessage(result.error)}</p>
          )}
          {result.state !== 'error' ? (
            <a
              href={result.playlist.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block font-semibold text-accent-green"
            >
              Open in Spotify
            </a>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
