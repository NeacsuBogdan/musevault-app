import 'server-only';

/** Check the configured application origin, including the port, before any write. */
export function isSameOriginWrite(request: Request, applicationUrl: string): boolean {
  try {
    const expected = new URL(applicationUrl);
    const fetchSite = request.headers.get('sec-fetch-site');
    return (
      (expected.protocol === 'https:' || expected.protocol === 'http:') &&
      request.headers.get('origin') === expected.origin &&
      request.headers.get('host') === expected.host &&
      (fetchSite === null || fetchSite === 'same-origin')
    );
  } catch {
    return false;
  }
}
