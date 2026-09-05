import { describe, expect, it } from 'vitest';
import { playlistExportResponseSchema, playlistNameSchema } from './export-contract';

describe('browser-safe playlist export contract', () => {
  it('trims names and accepts the application maximum', () => {
    expect(playlistNameSchema.parse('  MuseVault — High Energy  ')).toBe('MuseVault — High Energy');
    expect(playlistNameSchema.safeParse('a'.repeat(100)).success).toBe(true);
  });
  it.each(['', ' ', 'a'.repeat(101), '\tTitle', 'Title\u0085'])(
    'rejects invalid name %#',
    (name) => {
      expect(playlistNameSchema.safeParse(name).success).toBe(false);
    },
  );
  it.each([
    'javascript:alert(1)',
    'https://attacker.example/playlist/3cEYpjA9oz9GiPac4AsH4n',
    'https://open.spotify.com.evil/playlist/3cEYpjA9oz9GiPac4AsH4n',
    'https://user@open.spotify.com/playlist/3cEYpjA9oz9GiPac4AsH4n',
    'https://open.spotify.com:443/playlist/3cEYpjA9oz9GiPac4AsH4n',
    'https://open.spotify.com/playlist/3cEYpjA9oz9GiPac4AsH4n?redirect=evil',
    'https://open.spotify.com/playlist/3cEYpjA9oz9GiPac4AsH4n#evil',
    'https://open.spotify.com/playlist/0000000000000000000000',
  ])('rejects unsafe or mismatched Spotify URLs %s', (url) => {
    expect(
      playlistExportResponseSchema.safeParse({
        state: 'success',
        playlist: { id: '3cEYpjA9oz9GiPac4AsH4n', name: 'Name', url },
        trackCount: 1,
      }).success,
    ).toBe(false);
  });
});
