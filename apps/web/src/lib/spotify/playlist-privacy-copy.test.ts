import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

const documents = [
  ['README', '../../../../../README.md'],
  ['Smart Playlist guide', '../../../../../docs/smart-playlists.md'],
  ['Spotify export guide', '../../../../../docs/spotify-playlist-export.md'],
] as const;

describe('Spotify playlist privacy documentation', () => {
  it.each(documents)('%s describes publication separately from access control', (_name, path) => {
    const document = fs.readFileSync(new URL(path, import.meta.url), 'utf8');
    expect(document).toContain('public:false');
    expect(document).toMatch(/does not\s+provide access control/);
    expect(document).toMatch(/change (?:playlist )?access in Spotify itself/);
    expect(document).toContain('playlist-modify-private');
    expect(document).not.toContain('Create private playlist on Spotify');
    expect(document).not.toMatch(/export(?:ed|s|ing)?[^.]{0,80}private Spotify playlist/i);
  });
});
