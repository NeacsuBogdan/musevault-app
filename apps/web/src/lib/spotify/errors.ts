export type SpotifyApiErrorKind =
  | 'unauthorized'
  | 'forbidden'
  | 'rate_limited'
  | 'invalid_response'
  | 'unavailable';

export type SpotifyApiFailureCategory = 'http' | 'network' | 'json' | 'schema' | 'unknown';

export interface SafeSpotifySchemaIssue {
  path: string;
  code: string;
}

export function sanitizeSpotifySchemaIssues(
  issues: ReadonlyArray<{ path: readonly PropertyKey[]; code: string }>,
): SafeSpotifySchemaIssue[] {
  const unique = new Map<string, SafeSpotifySchemaIssue>();
  for (const issue of issues) {
    const path = issue.path
      .map((segment) => (typeof segment === 'number' ? '*' : String(segment)))
      .join('.');
    const key = `${path}\u0000${issue.code}`;
    if (!unique.has(key)) unique.set(key, { path, code: issue.code });
    if (unique.size === 10) break;
  }
  return [...unique.values()];
}

const ERROR_MESSAGES: Record<SpotifyApiErrorKind, string> = {
  unauthorized: 'Spotify authorization is no longer valid.',
  forbidden: 'Spotify denied access to this resource.',
  rate_limited: 'Spotify is receiving too many requests.',
  invalid_response: 'Spotify returned an unexpected response.',
  unavailable: 'Spotify is temporarily unavailable.',
};

export class SpotifyApiError extends Error {
  constructor(
    public readonly kind: SpotifyApiErrorKind,
    public readonly status: number | null,
    public readonly retryAfter: number | null = null,
    public readonly category: SpotifyApiFailureCategory = 'unknown',
    public readonly schemaIssues: readonly SafeSpotifySchemaIssue[] = [],
  ) {
    super(ERROR_MESSAGES[kind]);
    this.name = 'SpotifyApiError';
  }
}

export function parseRetryAfterSeconds(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value.trim())) {
    return null;
  }

  const seconds = Number(value);

  return Number.isSafeInteger(seconds) ? seconds : null;
}

export function spotifyApiErrorFromResponse(
  response: Pick<Response, 'headers' | 'status'>,
): SpotifyApiError {
  if (response.status === 401) {
    return new SpotifyApiError('unauthorized', response.status, null, 'http');
  }

  if (response.status === 403) {
    return new SpotifyApiError('forbidden', response.status, null, 'http');
  }

  if (response.status === 429) {
    return new SpotifyApiError(
      'rate_limited',
      response.status,
      parseRetryAfterSeconds(response.headers.get('retry-after')),
      'http',
    );
  }

  return new SpotifyApiError('unavailable', response.status, null, 'http');
}
