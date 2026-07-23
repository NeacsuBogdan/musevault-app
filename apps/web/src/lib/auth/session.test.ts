import { describe, expect, it } from 'vitest';

import {
  decryptSession,
  encryptSession,
  parseSpotifySession,
  safeSession,
  type SpotifySession,
} from '@/lib/auth/session';

const validSession: SpotifySession = {
  accessToken: 'access-token',
  accountId: 'account-123',
  displayName: 'MuseVault listener',
  expiresAt: 1_800_000_000_000,
  imageUrl: 'https://i.scdn.co/image/example',
  refreshToken: 'refresh-token',
  version: 1,
};

describe('Spotify session validation', () => {
  it('rejects malformed encrypted-session payload data', () => {
    expect(() =>
      parseSpotifySession({
        ...validSession,
        accountId: '',
        expiresAt: 'tomorrow',
      }),
    ).toThrow();
  });

  it('omits credentials from the safe session shape', () => {
    expect(safeSession(validSession)).toEqual({
      accountId: 'account-123',
      authenticated: true,
      displayName: 'MuseVault listener',
      imageUrl: 'https://i.scdn.co/image/example',
    });
    expect(safeSession(validSession)).not.toHaveProperty('accessToken');
    expect(safeSession(validSession)).not.toHaveProperty('refreshToken');
  });

  it('round-trips a valid session through authenticated JWE encryption', async () => {
    const secret = 'a-secure-session-secret-with-32-characters';
    const encryptedSession = await encryptSession(validSession, secret);

    await expect(decryptSession(encryptedSession, secret)).resolves.toEqual(validSession);
    expect(encryptedSession).not.toContain(validSession.accessToken);
    expect(encryptedSession).not.toContain(validSession.refreshToken);
  });

  it('rejects a tampered encrypted session', async () => {
    const secret = 'a-secure-session-secret-with-32-characters';
    const encryptedSession = await encryptSession(validSession, secret);
    const segments = encryptedSession.split('.');
    const ciphertext = segments[3];

    if (!ciphertext) {
      throw new Error('Expected compact JWE ciphertext.');
    }

    segments[3] = `${ciphertext[0] === 'a' ? 'b' : 'a'}${ciphertext.slice(1)}`;

    await expect(decryptSession(segments.join('.'), secret)).rejects.toThrow();
  });
});
