export type DatabaseConnectionMode = 'direct' | 'pooled';

const POSTGRES_PROTOCOLS = new Set(['postgres:', 'postgresql:']);

function isLocalDatabaseHostname(hostname: string): boolean {
  const normalizedHostname = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');

  if (
    normalizedHostname === 'localhost' ||
    normalizedHostname.endsWith('.localhost') ||
    normalizedHostname === '::1' ||
    normalizedHostname === '0.0.0.0'
  ) {
    return true;
  }

  const ipv4Octets = normalizedHostname.split('.');

  return (
    ipv4Octets.length === 4 &&
    ipv4Octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255) &&
    ipv4Octets[0] === '127'
  );
}

/**
 * Validates a PostgreSQL connection string without including its value in errors.
 *
 * Returning `undefined` keeps public error construction at the call site, where
 * only the relevant environment-variable name is known and safe to disclose.
 */
export function parsePostgresDatabaseUrl(
  value: unknown,
  mode: DatabaseConnectionMode,
): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const candidate = value.trim();

  if (!candidate) {
    return undefined;
  }

  let url: URL;

  try {
    url = new URL(candidate);
  } catch {
    return undefined;
  }

  if (
    !POSTGRES_PROTOCOLS.has(url.protocol) ||
    !url.hostname ||
    url.pathname.length <= 1 ||
    isLocalDatabaseHostname(url.hostname)
  ) {
    return undefined;
  }

  const usesNeonPooler = url.hostname.toLowerCase().includes('-pooler');

  if ((mode === 'pooled' && !usesNeonPooler) || (mode === 'direct' && usesNeonPooler)) {
    return undefined;
  }

  return candidate;
}
