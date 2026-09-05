import { describe, expect, it } from 'vitest';

import { getSafeOAuthReturnPath } from './oauth-return-path';

describe('OAuth local return paths', () => {
  it.each([
    '/smart-playlists?preset=high-energy&sort=energy-desc&limit=30',
    '/smart-playlists?energyMin=0.5&limit=20#preview',
    '/library',
    '/',
  ])('preserves an absolute local path %s', (path) => {
    expect(getSafeOAuthReturnPath(path)).toBe(path);
  });

  it.each([
    undefined,
    null,
    '',
    'smart-playlists',
    'https://attacker.example/smart-playlists',
    '//attacker.example',
    '/\\attacker.example',
    '/%5cattacker.example',
    '/%2fattacker.example',
    '/%252fattacker.example',
    '/..//attacker.example',
    '/%2e%2e//attacker.example',
    'javascript:alert(1)',
    ' /smart-playlists',
    '/smart-playlists\n',
    '/smart-playlists?value=%0d%0aLocation%3Ahttps%3A%2F%2Fattacker.example',
    '/smart-playlists?value=%250a',
    '/smart-playlists?value=%zz',
    `/${'a'.repeat(2_048)}`,
  ])('rejects external, malformed, or encoded hostile paths %#', (path) => {
    expect(getSafeOAuthReturnPath(path)).toBeNull();
  });
});
