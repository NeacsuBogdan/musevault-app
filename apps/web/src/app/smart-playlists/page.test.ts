import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  SmartPlaylistExport,
  type SmartPlaylistExportProps,
} from '@/components/smart-playlist-export';
import type { SmartPlaylistPreview } from '@/lib/db/repositories/smart-playlists';

const mocks = vi.hoisted(() => ({
  readSession: vi.fn(),
  redirect: vi.fn(),
  getSmartPlaylistPreview: vi.fn(),
  getSpotifyPlaylistExportCapability: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/lib/auth/session', () => ({ readSession: mocks.readSession }));
vi.mock('@/lib/db/repositories/smart-playlists', () => ({
  getSmartPlaylistPreview: mocks.getSmartPlaylistPreview,
}));
vi.mock('@/lib/db/repositories/spotify-playlist-export', () => ({
  getSpotifyPlaylistExportCapability: mocks.getSpotifyPlaylistExportCapability,
}));

import SmartPlaylistsPage from './page';

const preview: SmartPlaylistPreview = {
  state: 'success',
  definition: { filters: { energyMin: 0.7 }, sort: 'energy-desc', limit: 30 },
  preset: 'high-energy',
  summary: {
    currentSavedTrackCount: 100,
    audioFeatureCount: 42,
    coveragePercentage: 42,
    matchingTrackCount: 1,
    previewTrackCount: 1,
    previewDurationMs: 180_000,
  },
  tracks: [
    {
      trackId: 'a'.repeat(22),
      trackName: 'Cached track',
      spotifyUrl: `https://open.spotify.com/track/${'a'.repeat(22)}`,
      albumName: 'Saved album',
      albumImageUrl: null,
      artistNames: ['Saved artist'],
      durationMs: 180_000,
      explicit: false,
      savedAt: '2026-08-01T12:00:00.000Z',
      features: {
        tempo: 140,
        energy: 0.8,
        valence: null,
        danceability: 0.75,
        acousticness: null,
        instrumentalness: null,
      },
    },
  ],
  validation: null,
};

function findExport(node: ReactNode): ReactElement<SmartPlaylistExportProps> | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findExport(child);
      if (found) return found;
    }
    return undefined;
  }
  if (!isValidElement<{ children?: ReactNode }>(node)) return undefined;
  if (node.type === SmartPlaylistExport) return node as ReactElement<SmartPlaylistExportProps>;
  return findExport(node.props.children);
}

beforeEach(() => {
  mocks.readSession.mockResolvedValue({ accountId: 'account-1' });
  mocks.redirect.mockImplementation(() => {
    throw new Error('redirect');
  });
  mocks.getSmartPlaylistPreview.mockResolvedValue(preview);
  mocks.getSpotifyPlaylistExportCapability.mockResolvedValue(true);
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => vi.unstubAllGlobals());

describe('Smart Playlist export page', () => {
  it('requires the existing session before querying preview or scope data', async () => {
    mocks.readSession.mockResolvedValue(null);
    await expect(SmartPlaylistsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      'redirect',
    );
    expect(mocks.redirect).toHaveBeenCalledWith('/');
    expect(mocks.getSmartPlaylistPreview).not.toHaveBeenCalled();
    expect(mocks.getSpotifyPlaylistExportCapability).not.toHaveBeenCalled();
  });

  it('renders a useful read-only preview and optional reconnect action without any network writes', async () => {
    mocks.getSpotifyPlaylistExportCapability.mockResolvedValue(false);
    const params = { preset: 'high-energy', campaign: 'ignored' };
    const element = await SmartPlaylistsPage({ searchParams: Promise.resolve(params) });
    const html = renderToStaticMarkup(element);
    expect(mocks.getSmartPlaylistPreview).toHaveBeenCalledWith('account-1', params);
    expect(mocks.getSpotifyPlaylistExportCapability).toHaveBeenCalledWith('account-1');
    expect(html).toContain('Cached track');
    expect(html).toContain('Reconnect Spotify to enable export');
    expect(html).toContain('You can keep using');
    expect(html).not.toContain('Create playlist on Spotify');
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
    const props = findExport(element)?.props;
    expect(props?.definition).toEqual({ preset: 'high-energy' });
    expect(props?.initialName).toBe('MuseVault — High Energy');
    expect(JSON.stringify(props)).not.toContain(preview.tracks[0]!.trackId);
  });

  it('enables explicit export after the stored optional scope has been granted without exporting on GET', async () => {
    const element = await SmartPlaylistsPage({
      searchParams: Promise.resolve({ preset: 'high-energy' }),
    });
    const html = renderToStaticMarkup(element);
    expect(html).toContain('Create playlist on Spotify');
    expect(html).not.toContain('Create private playlist on Spotify');
    expect(html).toContain('without publishing it publicly');
    expect(html).toContain('Spotify manages private access separately in its app');
    expect(html).not.toContain('Reconnect Spotify to enable export');
    expect(findExport(element)?.props.hasExportScope).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends the recognized custom query with original percentage units and a local return URL', async () => {
    mocks.getSmartPlaylistPreview.mockResolvedValue({ ...preview, preset: null });
    const params = {
      energyMin: '70',
      tempoMax: '160',
      sort: 'tempo-desc',
      limit: '20',
      spotifyError: 'access_denied',
      campaign: 'ignored',
    };
    const element = await SmartPlaylistsPage({ searchParams: Promise.resolve(params) });
    const props = findExport(element)?.props;
    expect(props?.definition).toEqual({
      energyMin: '70',
      tempoMax: '160',
      sort: 'tempo-desc',
      limit: '20',
    });
    expect(props?.initialName).toBe('MuseVault — Smart Playlist');
    const returned = new URL(props!.returnTo, 'https://musevault.test');
    expect(returned.pathname).toBe('/smart-playlists');
    expect(Object.fromEntries(returned.searchParams)).toEqual(props?.definition);
    expect(props?.authorizationFailed).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps the preview available if the optional capability lookup fails', async () => {
    mocks.getSpotifyPlaylistExportCapability.mockRejectedValue(new Error('private database error'));
    const element = await SmartPlaylistsPage({
      searchParams: Promise.resolve({ preset: 'high-energy' }),
    });
    const html = renderToStaticMarkup(element);
    expect(html).toContain('Cached track');
    expect(html).toContain('Export permission could not be checked');
    expect(html).not.toContain('private database error');
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    'builder',
    'invalid_definition',
    'sync_required',
    'sync_in_progress',
    'empty_library',
    'no_audio_coverage',
    'no_matches',
    'success',
  ] as const)('does not offer export for %s without a nonempty valid preview', async (state) => {
    mocks.getSmartPlaylistPreview.mockResolvedValue({ ...preview, state, tracks: [] });
    const element = await SmartPlaylistsPage({ searchParams: Promise.resolve({}) });
    expect(findExport(element)).toBeUndefined();
    expect(mocks.getSpotifyPlaylistExportCapability).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('preserves real saved-library and coverage context for an invalid definition', async () => {
    mocks.getSmartPlaylistPreview.mockResolvedValue({
      ...preview,
      state: 'invalid_definition',
      tracks: [],
      definition: null,
      preset: null,
      validation: {
        fields: { energyMin: 'Percentage must be 0–100.' },
        message: 'Percentage must be 0–100.',
      },
    });
    const params = { energyMin: '999' };
    const html = renderToStaticMarkup(
      await SmartPlaylistsPage({ searchParams: Promise.resolve(params) }),
    );
    expect(mocks.getSmartPlaylistPreview).toHaveBeenCalledWith('account-1', params);
    expect(html).toContain('Invalid filter definition');
    expect(html).toContain('42 / 100');
    expect(html).toContain('Audio filters can currently evaluate 42');
    expect(html).toContain('of 100 saved tracks');
    expect(mocks.getSpotifyPlaylistExportCapability).not.toHaveBeenCalled();
  });
});
