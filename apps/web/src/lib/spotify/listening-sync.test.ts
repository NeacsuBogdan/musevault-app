import { describe, expect, it } from 'vitest';
import {
  INITIAL_BACKFILL_PAGE_LIMIT,
  LISTENING_PAGES_PER_REQUEST,
  RECENT_PLAY_LIMIT,
  TOP_ITEM_LIMIT,
  classifyListeningSyncFailure,
  getListeningContinuationCursor,
} from './listening-sync';
import { SpotifyApiError } from './errors';

describe('listening synchronization contracts', () => {
  it('keeps request and initial-backfill work bounded', () => {
    expect({
      pageLimit: RECENT_PLAY_LIMIT,
      pagesPerRequest: LISTENING_PAGES_PER_REQUEST,
      initialPages: INITIAL_BACKFILL_PAGE_LIMIT,
      topLimit: TOP_ITEM_LIMIT,
    }).toEqual({ pageLimit: 50, pagesPerRequest: 3, initialPages: 10, topLimit: 20 });
  });

  it('completes safely when no next page or cursor exists', () => {
    expect(
      getListeningContinuationCursor(
        { cursors: { after: null, before: null }, hasNext: false },
        'initial',
      ),
    ).toBeNull();
  });

  it('uses the direction-specific cursor when continuation is available', () => {
    const page = { cursors: { after: 200, before: 100 }, hasNext: true };
    expect(getListeningContinuationCursor(page, 'initial')).toBe(100);
    expect(getListeningContinuationCursor(page, 'incremental')).toBe(200);
  });

  it.each(['initial', 'incremental'] as const)(
    'fails %s continuation without a usable cursor instead of retrying or truncating',
    (mode) => {
      expect(() =>
        getListeningContinuationCursor(
          { cursors: { after: null, before: null }, hasNext: true },
          mode,
        ),
      ).toThrow(SpotifyApiError);
    },
  );
  it('maps Spotify authorization, rate limit, and availability failures safely', () => {
    expect(classifyListeningSyncFailure(new SpotifyApiError('forbidden', 403)).code).toBe(
      'authorization_required',
    );
    expect(classifyListeningSyncFailure(new SpotifyApiError('rate_limited', 429, 9))).toMatchObject(
      { code: 'rate_limited', retryAfter: 9 },
    );
    expect(classifyListeningSyncFailure(new SpotifyApiError('unavailable', 503)).code).toBe(
      'spotify_unavailable',
    );
  });
});
