import { describe, expect, it } from 'vitest';

import { parseRetryAfterSeconds, SpotifyApiError, spotifyApiErrorFromResponse } from './errors';

describe('Spotify API error mapping', () => {
  it('maps a 429 response and forwards a valid Retry-After value', () => {
    const error = spotifyApiErrorFromResponse({
      headers: new Headers({ 'Retry-After': '17' }),
      status: 429,
    });

    expect(error).toBeInstanceOf(SpotifyApiError);
    expect(error).toMatchObject({
      kind: 'rate_limited',
      retryAfter: 17,
      status: 429,
    });
  });

  it('does not forward malformed Retry-After values', () => {
    expect(parseRetryAfterSeconds('not-a-number')).toBeNull();
    expect(parseRetryAfterSeconds('-1')).toBeNull();
    expect(parseRetryAfterSeconds(null)).toBeNull();
  });
});
