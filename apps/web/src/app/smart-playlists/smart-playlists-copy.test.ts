import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
const page = fs.readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
describe('Smart Playlists presentation', () => {
  it.each([
    'SMART PLAYLISTS',
    'Spotify playlists are created only when you choose export',
    'features are unknown',
    'Enrich more tracks in Audio Profile',
    'Open in Spotify',
    'Saved ',
    'Explicit',
  ])('contains truthful copy or metadata: %s', (text) => expect(page).toContain(text));
  it.each([
    'albumImageUrl',
    'albumName',
    'artistNames',
    'spotifyUrl',
    'savedAt',
    'durationMs',
    'features',
  ])('renders %s', (field) => expect(page).toContain(`track.${field}`));
  it('does not present missing features as zero', () =>
    expect(page).toContain('track.features.tempo === null ? null'));
  it('renders coverage from the repository summary even for invalid definitions', () => {
    expect(page).toContain('preview.summary.audioFeatureCount.toLocaleString()');
    expect(page).toContain('preview.summary.currentSavedTrackCount.toLocaleString()');
    expect(page).not.toContain("state === 'invalid_definition' ? 0");
  });
  it('does not promise Spotify client-level access control', () => {
    expect(page).not.toContain('Create private playlist on Spotify');
  });
});
