const LOCAL_URL_BASE = 'https://musevault.local';

/** Only an absolute local path can be carried through an OAuth transaction. */
export function getSafeOAuthReturnPath(value: string | null | undefined): string | null {
  if (!value || value.length > 2_048 || value !== value.trim()) return null;

  let decoded = value;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (!decoded.startsWith('/') || decoded.startsWith('//') || /[\\\p{Cc}]/u.test(decoded)) {
      return null;
    }

    try {
      const parsed = new URL(decoded, LOCAL_URL_BASE);

      if (parsed.origin !== LOCAL_URL_BASE || parsed.pathname.startsWith('//')) return null;

      const next = decodeURIComponent(decoded);
      if (next === decoded) return value;
      decoded = next;
    } catch {
      return null;
    }
  }

  return null;
}
