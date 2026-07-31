import { describe, expect, it } from 'vitest';

import {
  decryptSpotifyRefreshToken,
  encryptSpotifyRefreshToken,
  SpotifyTokenEncryptionError,
} from './token-encryption';

const encryptionKey = Buffer.alloc(32, 17);
const differentKey = Buffer.alloc(32, 29);
const refreshToken = 'spotify-refresh-token-for-testing';

function replaceFirstCharacter(value: string): string {
  return `${value[0] === 'A' ? 'B' : 'A'}${value.slice(1)}`;
}

describe('Spotify refresh-token encryption', () => {
  it('round-trips a refresh token through AES-256-GCM', () => {
    const encrypted = encryptSpotifyRefreshToken(refreshToken, encryptionKey);

    expect(decryptSpotifyRefreshToken(encrypted, encryptionKey)).toBe(refreshToken);
    expect(encrypted).not.toContain(refreshToken);
    expect(encrypted.split('.')[0]).toBe('v1');
  });

  it('uses a fresh random initialization vector for every encryption', () => {
    const first = encryptSpotifyRefreshToken(refreshToken, encryptionKey);
    const second = encryptSpotifyRefreshToken(refreshToken, encryptionKey);

    expect(first).not.toBe(second);
    expect(decryptSpotifyRefreshToken(first, encryptionKey)).toBe(refreshToken);
    expect(decryptSpotifyRefreshToken(second, encryptionKey)).toBe(refreshToken);
  });

  it('rejects decryption with the wrong key', () => {
    const encrypted = encryptSpotifyRefreshToken(refreshToken, encryptionKey);

    expect(() => decryptSpotifyRefreshToken(encrypted, differentKey)).toThrow(
      SpotifyTokenEncryptionError,
    );
  });

  it('rejects modified ciphertext', () => {
    const sections = encryptSpotifyRefreshToken(refreshToken, encryptionKey).split('.');

    if (!sections[2]) {
      throw new Error('Expected an encrypted ciphertext section.');
    }

    sections[2] = replaceFirstCharacter(sections[2]);

    expect(() => decryptSpotifyRefreshToken(sections.join('.'), encryptionKey)).toThrow(
      SpotifyTokenEncryptionError,
    );
  });

  it('rejects a modified authentication tag', () => {
    const sections = encryptSpotifyRefreshToken(refreshToken, encryptionKey).split('.');

    if (!sections[3]) {
      throw new Error('Expected an authentication-tag section.');
    }

    sections[3] = replaceFirstCharacter(sections[3]);

    expect(() => decryptSpotifyRefreshToken(sections.join('.'), encryptionKey)).toThrow(
      SpotifyTokenEncryptionError,
    );
  });

  it.each([
    'v1.too-few.sections',
    'v1.***.ciphertext.authentication-tag',
    `v1.${Buffer.alloc(11).toString('base64url')}.${Buffer.from('ciphertext').toString('base64url')}.${Buffer.alloc(16).toString('base64url')}`,
    `v1.${Buffer.alloc(12).toString('base64url')}.${Buffer.from('ciphertext').toString('base64url')}.${Buffer.alloc(15).toString('base64url')}`,
  ])('rejects malformed payload %s', (payload) => {
    expect(() => decryptSpotifyRefreshToken(payload, encryptionKey)).toThrow(
      SpotifyTokenEncryptionError,
    );
  });

  it('rejects unsupported serialization versions', () => {
    const encrypted = encryptSpotifyRefreshToken(refreshToken, encryptionKey);
    const unsupported = encrypted.replace(/^v1\./, 'v2.');

    expect(() => decryptSpotifyRefreshToken(unsupported, encryptionKey)).toThrowError(
      expect.objectContaining({ code: 'unsupported_version' }),
    );
  });

  it.each(['', '   '])('rejects an empty token', (token) => {
    expect(() => encryptSpotifyRefreshToken(token, encryptionKey)).toThrowError(
      expect.objectContaining({ code: 'empty_token' }),
    );
  });

  it.each([Buffer.alloc(0), Buffer.alloc(16), Buffer.alloc(31), Buffer.alloc(33)])(
    'rejects an invalid encryption-key length',
    (invalidKey) => {
      expect(() => encryptSpotifyRefreshToken(refreshToken, invalidKey)).toThrowError(
        expect.objectContaining({ code: 'invalid_key' }),
      );
    },
  );

  it('validates the key length before attempting decryption', () => {
    const encrypted = encryptSpotifyRefreshToken(refreshToken, encryptionKey);

    expect(() => decryptSpotifyRefreshToken(encrypted, Buffer.alloc(31))).toThrowError(
      expect.objectContaining({ code: 'invalid_key' }),
    );
  });
});
