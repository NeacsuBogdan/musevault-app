import { afterEach, describe, expect, it, vi } from 'vitest';

import { parsePostgresDatabaseUrl } from '@/lib/database-environment';
import {
  EnvironmentConfigurationError,
  getDatabaseMigrationUrl,
  getDatabaseUrl,
  getServerEnv,
  getSpotifyTokenEncryptionKey,
} from '@/lib/env';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('database environment validation', () => {
  it('returns a pooled PostgreSQL runtime URL lazily', () => {
    const databaseUrl =
      'postgresql://musevault:password@example-pooler.neon.tech/musevault?sslmode=require';
    vi.stubEnv('DATABASE_URL', databaseUrl);

    expect(getDatabaseUrl()).toBe(databaseUrl);
  });

  it('reports only DATABASE_URL when the runtime URL is missing', () => {
    vi.stubEnv('DATABASE_URL', '');

    expect(() => getDatabaseUrl()).toThrowError(
      new EnvironmentConfigurationError(['DATABASE_URL']),
    );
  });

  it('rejects malformed URLs without exposing their contents', () => {
    const sensitiveInvalidValue = 'not-a-url-with-a-sensitive-password';
    vi.stubEnv('DATABASE_URL', sensitiveInvalidValue);

    try {
      getDatabaseUrl();
      expect.unreachable('Expected DATABASE_URL validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(EnvironmentConfigurationError);
      expect((error as EnvironmentConfigurationError).variables).toEqual(['DATABASE_URL']);
      expect((error as Error).message).not.toContain(sensitiveInvalidValue);
    }
  });

  it('requires the runtime URL to use the Neon pooler', () => {
    vi.stubEnv(
      'DATABASE_URL',
      'postgresql://musevault:password@example.neon.tech/musevault?sslmode=require',
    );

    expect(() => getDatabaseUrl()).toThrow(EnvironmentConfigurationError);
  });

  it('requires the migration URL to use a direct connection', () => {
    expect(
      parsePostgresDatabaseUrl(
        'postgresql://musevault:password@example.neon.tech/musevault?sslmode=require',
        'direct',
      ),
    ).toBeDefined();
    expect(
      parsePostgresDatabaseUrl(
        'postgresql://musevault:password@example-pooler.neon.tech/musevault?sslmode=require',
        'direct',
      ),
    ).toBeUndefined();
  });

  it('exposes a lazy direct migration accessor with a variable-name-only error', () => {
    const migrationUrl =
      'postgresql://musevault:password@example.neon.tech/musevault?sslmode=require';
    vi.stubEnv('DATABASE_MIGRATION_URL', migrationUrl);

    expect(getDatabaseMigrationUrl()).toBe(migrationUrl);

    vi.stubEnv('DATABASE_MIGRATION_URL', 'sensitive-invalid-migration-value');

    expect(() => getDatabaseMigrationUrl()).toThrowError(
      new EnvironmentConfigurationError(['DATABASE_MIGRATION_URL']),
    );
    expect(() => getDatabaseMigrationUrl()).not.toThrow('sensitive-invalid-migration-value');
  });

  it.each([
    'postgresql://musevault:password@localhost/musevault',
    'postgresql://musevault:password@127.0.0.1/musevault',
    'postgresql://musevault:password@[::1]/musevault',
  ])('rejects local database host %s', (databaseUrl) => {
    expect(parsePostgresDatabaseUrl(databaseUrl, 'direct')).toBeUndefined();
  });

  it('rejects non-PostgreSQL protocols and URLs without a database name', () => {
    expect(
      parsePostgresDatabaseUrl('https://example.neon.tech/musevault', 'direct'),
    ).toBeUndefined();
    expect(
      parsePostgresDatabaseUrl('postgresql://musevault:password@example.neon.tech', 'direct'),
    ).toBeUndefined();
  });
});

describe('Spotify token-encryption key validation', () => {
  it('decodes a canonical base64url-encoded 32-byte key', () => {
    const expectedKey = Buffer.alloc(32, 42);
    vi.stubEnv('SPOTIFY_TOKEN_ENCRYPTION_KEY', expectedKey.toString('base64url'));

    expect(getSpotifyTokenEncryptionKey()).toEqual(expectedKey);
  });

  it.each([
    Buffer.alloc(31, 42).toString('base64url'),
    Buffer.alloc(33, 42).toString('base64url'),
    `${Buffer.alloc(32, 42).toString('base64url')}=`,
    'not+canonical/base64',
  ])('rejects an invalid key without exposing it', (invalidKey) => {
    vi.stubEnv('SPOTIFY_TOKEN_ENCRYPTION_KEY', invalidKey);

    try {
      getSpotifyTokenEncryptionKey();
      expect.unreachable('Expected SPOTIFY_TOKEN_ENCRYPTION_KEY validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(EnvironmentConfigurationError);
      expect((error as EnvironmentConfigurationError).variables).toEqual([
        'SPOTIFY_TOKEN_ENCRYPTION_KEY',
      ]);
      expect((error as Error).message).not.toContain(invalidKey);
    }
  });
});

describe('existing Spotify environment validation', () => {
  it('does not require database variables on unrelated runtime paths', () => {
    vi.stubEnv('APP_URL', 'http://127.0.0.1:3000');
    vi.stubEnv('SESSION_SECRET', 'a-session-secret-containing-at-least-32-characters');
    vi.stubEnv('SPOTIFY_CLIENT_ID', 'client-id');
    vi.stubEnv('SPOTIFY_CLIENT_SECRET', 'client-secret');
    vi.stubEnv('SPOTIFY_REDIRECT_URI', 'http://127.0.0.1:3000/api/auth/spotify/callback');
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('SPOTIFY_TOKEN_ENCRYPTION_KEY', '');

    expect(getServerEnv()).toMatchObject({
      APP_URL: 'http://127.0.0.1:3000',
      SPOTIFY_CLIENT_ID: 'client-id',
    });
  });
});
