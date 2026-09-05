import { NextResponse } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createOAuthTransaction } from './oauth';
import {
  clearOAuthTransactionCookies,
  OAUTH_CODE_VERIFIER_COOKIE_NAME,
  OAUTH_EXPORT_CONTEXT_COOKIE_NAME,
  OAUTH_STATE_COOKIE_NAME,
  readOAuthExportContext,
  setOAuthTransactionCookies,
} from './oauth-cookies';

const secret = 'test-session-secret-with-at-least-32-characters';
const returnTo = '/smart-playlists?preset=high-energy&limit=30';

function exportTransaction() {
  const transaction = createOAuthTransaction('playlist-export');
  const response = NextResponse.json({});
  setOAuthTransactionCookies(response, transaction, {
    accountId: 'original-account',
    returnTo,
    secret,
  });
  const context = response.cookies.get(OAUTH_EXPORT_CONTEXT_COOKIE_NAME)?.value;
  if (!context) throw new Error('Expected signed OAuth export context.');
  return { context, response, transaction };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('Spotify OAuth export context cookies', () => {
  it('binds a local return path and original account to the OAuth state', () => {
    const { context, transaction } = exportTransaction();
    expect(readOAuthExportContext(context, transaction.state, secret)).toMatchObject({
      accountId: 'original-account',
      capability: 'playlist-export',
      returnTo,
      state: transaction.state,
    });
    expect(readOAuthExportContext(context, createOAuthTransaction().state, secret)).toBeNull();
    expect(readOAuthExportContext(context, transaction.state, 'different-secret')).toBeNull();
  });

  it('rejects context tampering and expired transactions', () => {
    vi.useFakeTimers();
    const { context, transaction } = exportTransaction();
    const [payload, signature] = context.split('.');
    const tampered = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8')),
        returnTo: 'https://attacker.example',
      }),
    ).toString('base64url');
    expect(
      readOAuthExportContext(`${tampered}.${signature}`, transaction.state, secret),
    ).toBeNull();
    vi.advanceTimersByTime(10 * 60 * 1_000);
    expect(readOAuthExportContext(context, transaction.state, secret)).toBeNull();
  });

  it('keeps all OAuth cookies HttpOnly, callback-scoped, SameSite=Lax and secure in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { response } = exportTransaction();
    for (const name of [
      OAUTH_STATE_COOKIE_NAME,
      OAUTH_CODE_VERIFIER_COOKIE_NAME,
      OAUTH_EXPORT_CONTEXT_COOKIE_NAME,
    ]) {
      expect(response.cookies.get(name)).toMatchObject({
        httpOnly: true,
        maxAge: 600,
        path: '/api/auth/spotify/callback',
        sameSite: 'lax',
        secure: true,
      });
    }
    clearOAuthTransactionCookies(response);
    for (const cookie of response.cookies.getAll()) {
      expect(cookie).toMatchObject({
        httpOnly: true,
        maxAge: 0,
        path: '/api/auth/spotify/callback',
        sameSite: 'lax',
        secure: true,
        value: '',
      });
    }
  });

  it('clears a stale export context when starting an ordinary login', () => {
    const { response } = exportTransaction();
    setOAuthTransactionCookies(response, createOAuthTransaction());
    expect(response.cookies.get(OAUTH_EXPORT_CONTEXT_COOKIE_NAME)).toMatchObject({
      maxAge: 0,
      value: '',
    });
  });
});
