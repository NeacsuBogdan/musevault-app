import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  OAUTH_EXPORT_CONTEXT_COOKIE_NAME,
  OAUTH_STATE_COOKIE_NAME,
  readOAuthExportContext,
} from '@/lib/auth/oauth-cookies';
import { SPOTIFY_AUTHORIZATION_SCOPE } from '@/lib/auth/oauth';
import type { ServerEnvironment } from '@/lib/env';

const mocks = vi.hoisted(() => ({ getServerEnv: vi.fn(), readSession: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ readSession: mocks.readSession }));
vi.mock('@/lib/env', () => ({ getServerEnv: mocks.getServerEnv }));

import { GET } from './route';

const environment: ServerEnvironment = {
  APP_URL: 'http://127.0.0.1:3000',
  SESSION_SECRET: 'test-session-secret-with-at-least-32-characters',
  SPOTIFY_CLIENT_ID: 'test-client-id',
  SPOTIFY_CLIENT_SECRET: 'test-client-secret',
  SPOTIFY_REDIRECT_URI: 'http://127.0.0.1:3000/api/auth/spotify/callback',
};

function request(parameters: Record<string, string> = {}) {
  const url = new URL('/api/auth/spotify/login', environment.APP_URL);
  url.search = new URLSearchParams(parameters).toString();
  return new NextRequest(url);
}

beforeEach(() => {
  mocks.getServerEnv.mockReturnValue(environment);
  mocks.readSession.mockResolvedValue({ accountId: 'original-account' });
});

describe('Spotify login optional playlist export authorization', () => {
  it('keeps ordinary login read-only without requiring an existing session', async () => {
    const response = await GET(request());
    const destination = new URL(response.headers.get('location') ?? '');
    expect(destination.searchParams.get('scope')).toBe(SPOTIFY_AUTHORIZATION_SCOPE);
    expect(mocks.readSession).not.toHaveBeenCalled();
    expect(response.cookies.get(OAUTH_EXPORT_CONTEXT_COOKIE_NAME)?.maxAge).toBe(0);
  });

  it('requests only the additional private-playlist scope and carries the exact local preview URL', async () => {
    const returnTo = '/smart-playlists?preset=high-energy&sort=energy-desc&limit=30';
    const response = await GET(request({ capability: 'playlist-export', returnTo }));
    const destination = new URL(response.headers.get('location') ?? '');
    expect(destination.origin).toBe('https://accounts.spotify.com');
    expect(destination.searchParams.get('scope')).toBe(
      `${SPOTIFY_AUTHORIZATION_SCOPE} playlist-modify-private`,
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(
      readOAuthExportContext(
        response.cookies.get(OAUTH_EXPORT_CONTEXT_COOKIE_NAME)?.value ?? '',
        response.cookies.get(OAUTH_STATE_COOKIE_NAME)?.value ?? '',
        environment.SESSION_SECRET,
      ),
    ).toMatchObject({ accountId: 'original-account', returnTo });
  });

  it.each(['https://attacker.example', '//attacker.example', '/%255cattacker.example'])(
    'replaces hostile returnTo with the safe Smart Playlist page: %s',
    async (returnTo) => {
      const response = await GET(request({ capability: 'playlist-export', returnTo }));
      expect(
        readOAuthExportContext(
          response.cookies.get(OAUTH_EXPORT_CONTEXT_COOKIE_NAME)?.value ?? '',
          response.cookies.get(OAUTH_STATE_COOKIE_NAME)?.value ?? '',
          environment.SESSION_SECRET,
        ),
      ).toMatchObject({ returnTo: '/smart-playlists' });
    },
  );

  it('requires a current MuseVault session before starting capability reauthorization', async () => {
    mocks.readSession.mockResolvedValue(null);
    const response = await GET(request({ capability: 'playlist-export' }));
    expect(response.status).toBe(401);
    expect(response.headers.has('location')).toBe(false);
    expect(response.cookies.get(OAUTH_EXPORT_CONTEXT_COOKIE_NAME)).toBeUndefined();
  });

  it('rejects unsupported and duplicate capabilities without requesting any OAuth scope', async () => {
    const unsupported = await GET(request({ capability: 'playlist-modify-public' }));
    const duplicateRequest = request({ capability: 'playlist-export' });
    duplicateRequest.nextUrl.searchParams.append('capability', 'playlist-export');
    const duplicate = await GET(duplicateRequest);
    expect(unsupported.status).toBe(400);
    expect(duplicate.status).toBe(400);
    expect(mocks.readSession).not.toHaveBeenCalled();
  });
});
