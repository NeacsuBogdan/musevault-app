import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/auth/spotify/logout/route';
import { deleteSession, SESSION_COOKIE_NAME } from '@/lib/auth/session';

const { setCookie } = vi.hoisted(() => ({
  setCookie: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    set: setCookie,
  }),
}));

function createLogoutRequest(
  origin: string,
  fetchSite: 'cross-site' | 'same-origin' = 'same-origin',
): NextRequest {
  return new NextRequest('http://localhost:3000/api/auth/spotify/logout', {
    headers: {
      host: '127.0.0.1:3000',
      origin,
      'sec-fetch-site': fetchSite,
    },
    method: 'POST',
  });
}

describe('Spotify logout route', () => {
  it('accepts a same-origin POST using the browser-facing development host', async () => {
    const response = await POST(createLogoutRequest('http://127.0.0.1:3000'));

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/');
    expect(setCookie).toHaveBeenCalledOnce();
  });

  it('rejects a cross-origin POST without deleting the session', async () => {
    const response = await POST(createLogoutRequest('https://attacker.example'));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid logout request.',
    });
    expect(setCookie).not.toHaveBeenCalled();
  });

  it('rejects a cross-site Fetch Metadata signal even with a matching origin', async () => {
    const response = await POST(createLogoutRequest('http://127.0.0.1:3000', 'cross-site'));

    expect(response.status).toBe(403);
    expect(setCookie).not.toHaveBeenCalled();
  });

  it('deletes the session cookie with the same identity and security attributes', async () => {
    await deleteSession();

    expect(setCookie).toHaveBeenCalledWith(SESSION_COOKIE_NAME, '', {
      expires: new Date(0),
      httpOnly: true,
      maxAge: 0,
      path: '/',
      sameSite: 'lax',
      secure: false,
    });
  });
});
