import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  createOAuthTransaction,
  oauthValuesMatch,
  SPOTIFY_AUTHORIZATION_SCOPE,
} from '@/lib/auth/oauth';

describe('Spotify OAuth transaction', () => {
  it('creates a valid S256 challenge from a random verifier', () => {
    const transaction = createOAuthTransaction();
    const expectedChallenge = createHash('sha256')
      .update(transaction.codeVerifier, 'ascii')
      .digest('base64url');

    expect(transaction.codeChallenge).toBe(expectedChallenge);
    expect(transaction.codeVerifier).toMatch(/^[A-Za-z0-9_-]{32,128}$/);
    expect(transaction.state).toMatch(/^[A-Za-z0-9_-]{32,128}$/);
    expect(SPOTIFY_AUTHORIZATION_SCOPE).toBe('user-library-read user-read-private');
  });

  it('accepts only the original well-formed state value', () => {
    const { state } = createOAuthTransaction();

    expect(oauthValuesMatch(state, state)).toBe(true);
    expect(oauthValuesMatch(state, createOAuthTransaction().state)).toBe(false);
    expect(oauthValuesMatch(state, 'not valid state')).toBe(false);
  });
});
