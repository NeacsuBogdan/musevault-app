import 'server-only';

import { z } from 'zod';

import type { SpotifySession } from '@/lib/auth/session';
import type { SavedTracksPage } from '@/types/spotify';

import { getSpotifySavedTracks } from './client';
import { SpotifyApiError } from './errors';
import { ensureFreshSpotifySession, shouldRefreshAccessToken } from './tokens';

export const SAVED_TRACKS_PAGE_MAX_LIMIT = 50;

const savedTracksPaginationSchema = z
  .object({
    limit: z.number().int().min(1).max(SAVED_TRACKS_PAGE_MAX_LIMIT),
    offset: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

export type SavedTracksPagination = z.infer<typeof savedTracksPaginationSchema>;

export type SavedTracksSessionRefreshMode = 'persist' | 'signal';

export type LoadSpotifySavedTracksPageOptions =
  | {
      forcedRefreshCompleted?: never;
      refreshMode?: 'persist';
    }
  | {
      forcedRefreshCompleted?: boolean;
      refreshMode: 'signal';
    };

/**
 * Signals that a caller without cookie-mutation access must hand refresh work to
 * a Route Handler or Server Action before retrying the saved-tracks load.
 */
export class SavedTracksSessionRefreshRequired extends Error {
  constructor(public readonly force: boolean) {
    super('The Spotify session must be refreshed in a cookie-mutable request context.');
    this.name = 'SavedTracksSessionRefreshRequired';
  }
}

/**
 * Loads one normalized saved-tracks page without exposing Spotify credentials.
 *
 * Route Handlers use the default mode, which refreshes and persists the session.
 * Server Components use signal mode so a required refresh is reported before
 * the token endpoint is called and before a session-cookie write is attempted.
 */
export async function loadSpotifySavedTracksPage(
  session: SpotifySession,
  paginationInput: SavedTracksPagination,
  options: LoadSpotifySavedTracksPageOptions = {},
): Promise<SavedTracksPage> {
  const pagination = savedTracksPaginationSchema.parse(paginationInput);
  const signalsRefresh = options.refreshMode === 'signal';
  let activeSession: SpotifySession;

  if (signalsRefresh) {
    if (shouldRefreshAccessToken(session)) {
      throw new SavedTracksSessionRefreshRequired(false);
    }

    activeSession = session;
  } else {
    activeSession = await ensureFreshSpotifySession(session);
  }

  try {
    return await getSpotifySavedTracks(activeSession.accessToken, pagination);
  } catch (error) {
    if (!(error instanceof SpotifyApiError) || error.kind !== 'unauthorized') {
      throw error;
    }

    if (signalsRefresh) {
      if (options.forcedRefreshCompleted) {
        throw error;
      }

      throw new SavedTracksSessionRefreshRequired(true);
    }

    activeSession = await ensureFreshSpotifySession(activeSession, { force: true });

    return getSpotifySavedTracks(activeSession.accessToken, pagination);
  }
}
