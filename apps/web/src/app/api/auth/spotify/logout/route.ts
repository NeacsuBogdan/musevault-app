import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { deleteSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function getBrowserFacingOrigin(request: NextRequest): string | null {
  const host = request.headers.get('host')?.trim();
  const forwardedProtocol = request.headers
    .get('x-forwarded-proto')
    ?.split(',', 1)[0]
    ?.trim()
    .toLowerCase();
  const protocol = forwardedProtocol ?? request.nextUrl.protocol.replace(/:$/, '');

  if (!host || (protocol !== 'http' && protocol !== 'https')) {
    return null;
  }

  try {
    return new URL(`${protocol}://${host}`).origin;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  const browserFacingOrigin = getBrowserFacingOrigin(request);

  if (
    fetchSite === 'cross-site' ||
    !origin ||
    !browserFacingOrigin ||
    origin !== browserFacingOrigin
  ) {
    return NextResponse.json(
      {
        error: 'Invalid logout request.',
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
        status: 403,
      },
    );
  }

  await deleteSession();

  return new NextResponse(null, {
    headers: {
      'Cache-Control': 'no-store',
      Location: '/',
    },
    status: 303,
  });
}
