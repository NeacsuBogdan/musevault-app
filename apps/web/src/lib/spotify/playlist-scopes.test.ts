import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  hasRequiredSpotifyAuthorizationScopes,
  SPOTIFY_AUTHORIZATION_SCOPE,
} from '@/lib/auth/oauth';
import { hasSpotifyPlaylistExportScope } from './playlist-scopes';

describe('read-only page authorization boundary', () => {
  it('keeps the ordinary authorization gate usable without the write capability', () => {
    const readScopes = SPOTIFY_AUTHORIZATION_SCOPE.split(' ');
    expect(hasRequiredSpotifyAuthorizationScopes(readScopes)).toBe(true);
    expect(hasSpotifyPlaylistExportScope(readScopes)).toBe(false);
  });
  it.each(['dashboard', 'library', 'listening', 'audio-profile', 'rediscover'])(
    '%s has no export authorization gate',
    (page) => {
      const source = fs.readFileSync(
        new URL(`../../app/${page}/page.tsx`, import.meta.url),
        'utf8',
      );
      expect(source).not.toMatch(
        /playlist-modify-private|hasSpotifyPlaylistExportScope|getSpotifyPlaylistExportCapability/,
      );
    },
  );
  it('keeps the shared listening data gate limited to required read scopes', () => {
    const source = fs.readFileSync(
      new URL('../db/repositories/listening-intelligence.ts', import.meta.url),
      'utf8',
    );
    expect(source).toContain('hasRequiredSpotifyAuthorizationScopes(identity.scopes)');
    expect(source).not.toMatch(/playlist-modify-private|hasSpotifyPlaylistExportScope/);
  });
});
