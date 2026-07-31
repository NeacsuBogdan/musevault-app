import 'server-only';

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { getSpotifyTokenEncryptionKey } from '@/lib/env';

export const SPOTIFY_TOKEN_ENCRYPTION_VERSION = 1;

const SERIALIZATION_VERSION = `v${SPOTIFY_TOKEN_ENCRYPTION_VERSION}`;
const KEY_LENGTH_BYTES = 32;
const IV_LENGTH_BYTES = 12;
const AUTHENTICATION_TAG_LENGTH_BYTES = 16;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

export type SpotifyTokenEncryptionErrorCode =
  | 'empty_token'
  | 'invalid_key'
  | 'invalid_payload'
  | 'unsupported_version';

export class SpotifyTokenEncryptionError extends Error {
  constructor(public readonly code: SpotifyTokenEncryptionErrorCode) {
    const messages: Record<SpotifyTokenEncryptionErrorCode, string> = {
      empty_token: 'The Spotify refresh token is empty.',
      invalid_key: 'The Spotify token encryption key is invalid.',
      invalid_payload: 'The encrypted Spotify refresh token is invalid.',
      unsupported_version: 'The encrypted Spotify refresh token version is unsupported.',
    };

    super(messages[code]);
    this.name = 'SpotifyTokenEncryptionError';
  }
}

function validatedKey(key: Uint8Array): Buffer {
  if (key.byteLength !== KEY_LENGTH_BYTES) {
    throw new SpotifyTokenEncryptionError('invalid_key');
  }

  return Buffer.from(key);
}

function decodeBase64UrlSection(value: string): Buffer {
  if (!BASE64URL_PATTERN.test(value)) {
    throw new SpotifyTokenEncryptionError('invalid_payload');
  }

  const decoded = Buffer.from(value, 'base64url');

  if (decoded.length === 0 || decoded.toString('base64url') !== value) {
    throw new SpotifyTokenEncryptionError('invalid_payload');
  }

  return decoded;
}

export function encryptSpotifyRefreshToken(
  plaintext: string,
  key: Uint8Array = getSpotifyTokenEncryptionKey(),
): string {
  if (plaintext.trim().length === 0) {
    throw new SpotifyTokenEncryptionError('empty_token');
  }

  const encryptionKey = validatedKey(key);
  const initializationVector = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey, initializationVector);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authenticationTag = cipher.getAuthTag();

  return [
    SERIALIZATION_VERSION,
    initializationVector.toString('base64url'),
    ciphertext.toString('base64url'),
    authenticationTag.toString('base64url'),
  ].join('.');
}

export function decryptSpotifyRefreshToken(
  serialized: string,
  key: Uint8Array = getSpotifyTokenEncryptionKey(),
): string {
  const sections = serialized.split('.');

  if (sections.length !== 4) {
    throw new SpotifyTokenEncryptionError('invalid_payload');
  }

  const [version, encodedInitializationVector, encodedCiphertext, encodedAuthenticationTag] =
    sections;

  if (version !== SERIALIZATION_VERSION) {
    throw new SpotifyTokenEncryptionError('unsupported_version');
  }

  if (!encodedInitializationVector || !encodedCiphertext || !encodedAuthenticationTag) {
    throw new SpotifyTokenEncryptionError('invalid_payload');
  }

  const encryptionKey = validatedKey(key);
  const initializationVector = decodeBase64UrlSection(encodedInitializationVector);
  const ciphertext = decodeBase64UrlSection(encodedCiphertext);
  const authenticationTag = decodeBase64UrlSection(encodedAuthenticationTag);

  if (
    initializationVector.length !== IV_LENGTH_BYTES ||
    authenticationTag.length !== AUTHENTICATION_TAG_LENGTH_BYTES
  ) {
    throw new SpotifyTokenEncryptionError('invalid_payload');
  }

  try {
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey, initializationVector);

    decipher.setAuthTag(authenticationTag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    throw new SpotifyTokenEncryptionError('invalid_payload');
  }
}
