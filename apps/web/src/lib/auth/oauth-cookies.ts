import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

import type { NextResponse } from 'next/server';
import { z } from 'zod';

import type { OAuthTransaction } from '@/lib/auth/oauth';
import { getSafeOAuthReturnPath } from '@/lib/auth/oauth-return-path';

export const OAUTH_STATE_COOKIE_NAME = 'musevault_oauth_state';
export const OAUTH_CODE_VERIFIER_COOKIE_NAME = 'musevault_oauth_code_verifier';
export const OAUTH_EXPORT_CONTEXT_COOKIE_NAME = 'musevault_oauth_export_context';

const OAUTH_COOKIE_PATH = '/api/auth/spotify/callback';
const OAUTH_COOKIE_MAX_AGE_SECONDS = 10 * 60;

const exportContextSchema = z
  .object({
    accountId: z.string().min(1),
    capability: z.literal('playlist-export'),
    expiresAt: z.number().int().positive(),
    returnTo: z.string().refine((value) => getSafeOAuthReturnPath(value) !== null),
    state: z.string(),
  })
  .strict();

export type OAuthExportContext = z.infer<typeof exportContextSchema>;

function signExportContext(payload: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(`spotify-export:${payload}`, 'utf8').digest();
}

export function readOAuthExportContext(
  value: string,
  state: string,
  secret: string,
): OAuthExportContext | null {
  const parts = value.split('.');
  const [payload, signature] = parts;
  if (parts.length !== 2 || !payload || !signature) return null;

  try {
    const expectedSignature = signExportContext(payload, secret);
    const receivedSignature = Buffer.from(signature, 'base64url');
    if (
      receivedSignature.length !== expectedSignature.length ||
      !timingSafeEqual(receivedSignature, expectedSignature)
    ) {
      return null;
    }

    const context = exportContextSchema.safeParse(
      JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')),
    );
    if (!context.success || context.data.state !== state || context.data.expiresAt <= Date.now()) {
      return null;
    }

    return context.data;
  } catch {
    return null;
  }
}

function oauthCookieOptions() {
  return {
    httpOnly: true,
    path: OAUTH_COOKIE_PATH,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
  };
}

export function setOAuthTransactionCookies(
  response: NextResponse,
  transaction: OAuthTransaction,
  exportContext?: { accountId: string; returnTo: string; secret: string },
): void {
  const expires = new Date(Date.now() + OAUTH_COOKIE_MAX_AGE_SECONDS * 1_000);
  const options = {
    ...oauthCookieOptions(),
    expires,
    maxAge: OAUTH_COOKIE_MAX_AGE_SECONDS,
  };

  response.cookies.set(OAUTH_STATE_COOKIE_NAME, transaction.state, options);
  response.cookies.set(OAUTH_CODE_VERIFIER_COOKIE_NAME, transaction.codeVerifier, options);

  if (exportContext) {
    const context = exportContextSchema.parse({
      accountId: exportContext.accountId,
      capability: 'playlist-export',
      expiresAt: expires.getTime(),
      returnTo: exportContext.returnTo,
      state: transaction.state,
    });
    const payload = Buffer.from(JSON.stringify(context), 'utf8').toString('base64url');
    const signature = signExportContext(payload, exportContext.secret).toString('base64url');
    response.cookies.set(OAUTH_EXPORT_CONTEXT_COOKIE_NAME, `${payload}.${signature}`, options);
  } else {
    response.cookies.set(OAUTH_EXPORT_CONTEXT_COOKIE_NAME, '', {
      ...oauthCookieOptions(),
      expires: new Date(0),
      maxAge: 0,
    });
  }
}

export function clearOAuthTransactionCookies(response: NextResponse): void {
  const options = {
    ...oauthCookieOptions(),
    expires: new Date(0),
    maxAge: 0,
  };

  response.cookies.set(OAUTH_STATE_COOKIE_NAME, '', options);
  response.cookies.set(OAUTH_CODE_VERIFIER_COOKIE_NAME, '', options);
  response.cookies.set(OAUTH_EXPORT_CONTEXT_COOKIE_NAME, '', options);
}
