import { describe, expect, it } from 'vitest';

import type { SavedTrack, SavedTracksPage, SpotifyProfile } from '@/types/spotify';

import {
  createDashboardProfile,
  createDashboardViewModel,
  formatDashboardDuration,
} from './dashboard-view-model';

const profile: SpotifyProfile = {
  accountId: 'account-123',
  displayName: 'Alex Morgan',
  imageUrl: 'https://i.scdn.co/image/profile',
};

function createTrack(index: number, overrides: Partial<SavedTrack> = {}): SavedTrack {
  return {
    id: `track-${index}`,
    albumId: `album-${index}`,
    spotifyUrl: `https://open.spotify.com/track/track-${index}`,
    name: `Track ${index}`,
    artistIds: [`artist-${index}`],
    artistNames: [`Artist ${index}`],
    albumName: `Album ${index}`,
    albumImageUrl: `https://i.scdn.co/image/album-${index}`,
    durationMs: 180_000,
    explicit: false,
    savedAt: '2026-07-01T12:34:56Z',
    ...overrides,
  };
}

function createPage(items: SavedTrack[], total = items.length): SavedTracksPage {
  return {
    items,
    total,
    limit: 50,
    offset: 0,
  };
}

function statisticValue(
  viewModel: ReturnType<typeof createDashboardViewModel>,
  label: string,
): string {
  const statistic = viewModel.statistics.find((candidate) => candidate.label === label);

  if (!statistic) {
    throw new Error(`Missing dashboard statistic: ${label}`);
  }

  return statistic.value;
}

describe('dashboard view-model mapping', () => {
  it('maps a full saved-tracks page into truthful statistics and five recent tracks', () => {
    const items = Array.from({ length: 50 }, (_, index) => createTrack(index));
    const viewModel = createDashboardViewModel(profile, createPage(items, 1_284));

    expect(viewModel.profile).toEqual({
      displayName: 'Alex Morgan',
      firstName: 'Alex',
      imageUrl: 'https://i.scdn.co/image/profile',
      initials: 'AM',
    });
    expect(viewModel.loadedTrackCount).toBe(50);
    expect(viewModel.statistics).toEqual([
      {
        accent: 'green',
        helper: 'Total saved tracks reported by Spotify',
        icon: 'heart',
        label: 'Liked Songs',
        value: '1,284',
      },
      {
        accent: 'purple',
        helper: 'Latest saved tracks loaded, up to 50',
        icon: 'music',
        label: 'Loaded Tracks',
        value: '50',
      },
      {
        accent: 'pink',
        helper: 'Based on the latest 50 saved tracks',
        icon: 'artists',
        label: 'Artists in Preview',
        value: '50',
      },
      {
        accent: 'blue',
        helper: 'Based on the latest 50 saved tracks',
        icon: 'clock',
        label: 'Preview Duration',
        value: '2h 30m',
      },
    ]);
    expect(viewModel.recentlySaved).toHaveLength(5);
    expect(viewModel.recentlySaved.map((track) => track.id)).toEqual([
      'track-0',
      'track-1',
      'track-2',
      'track-3',
      'track-4',
    ]);
  });

  it('counts unique artist IDs and labels statistics from fewer than 50 tracks honestly', () => {
    const items = [
      createTrack(1, {
        artistIds: ['artist-a', 'artist-b'],
        artistNames: ['Artist A', 'Artist B'],
        durationMs: 30 * 60_000,
      }),
      createTrack(2, {
        artistIds: ['artist-b'],
        artistNames: ['Artist B'],
        durationMs: 45 * 60_000,
      }),
      createTrack(3, {
        artistIds: ['artist-c'],
        artistNames: ['Artist C'],
        durationMs: 15 * 60_000,
      }),
    ];
    const viewModel = createDashboardViewModel(profile, createPage(items, 73));

    expect(statisticValue(viewModel, 'Artists in Preview')).toBe('3');
    expect(statisticValue(viewModel, 'Preview Duration')).toBe('1h 30m');
    expect(
      viewModel.statistics
        .filter((statistic) => ['Artists in Preview', 'Preview Duration'].includes(statistic.label))
        .every((statistic) => statistic.helper === 'Based on the latest 3 saved tracks'),
    ).toBe(true);
  });

  it('represents an empty library without inventing preview data', () => {
    const viewModel = createDashboardViewModel(profile, createPage([]));

    expect(viewModel.loadedTrackCount).toBe(0);
    expect(viewModel.recentlySaved).toEqual([]);
    expect(statisticValue(viewModel, 'Liked Songs')).toBe('0');
    expect(statisticValue(viewModel, 'Loaded Tracks')).toBe('0');
    expect(statisticValue(viewModel, 'Artists in Preview')).toBe('0');
    expect(statisticValue(viewModel, 'Preview Duration')).toBe('0m');
    expect(viewModel.statistics[2]?.helper).toBe('Based on an empty saved-tracks preview');
  });

  it('defensively caps loaded tracks at 50', () => {
    const items = Array.from({ length: 55 }, (_, index) => createTrack(index));
    const viewModel = createDashboardViewModel(profile, createPage(items, 55));

    expect(viewModel.loadedTrackCount).toBe(50);
    expect(statisticValue(viewModel, 'Loaded Tracks')).toBe('50');
    expect(statisticValue(viewModel, 'Artists in Preview')).toBe('50');
    expect(viewModel.recentlySaved).toHaveLength(5);
  });

  it('keeps unsafe image and track URLs out of the safe dashboard model', () => {
    const unsafeProfile = createDashboardProfile({
      displayName: '  ',
      imageUrl: 'https://example.com/profile.jpg',
    });
    const viewModel = createDashboardViewModel(
      profile,
      createPage([
        createTrack(1, {
          albumImageUrl: 'https://example.com/cover.jpg',
          spotifyUrl: 'https://example.com/track/track-1',
        }),
      ]),
    );

    expect(unsafeProfile).toEqual({
      displayName: 'Spotify listener',
      firstName: 'Spotify',
      imageUrl: null,
      initials: 'SL',
    });
    expect(viewModel.recentlySaved[0]).toMatchObject({
      albumImageUrl: null,
      spotifyUrl: null,
    });
  });

  it('does not expose mock analytics as real dashboard data', () => {
    const viewModel = createDashboardViewModel(profile, createPage([createTrack(1)]));
    const serializedViewModel = JSON.stringify(viewModel);

    expect(viewModel.statistics.map((statistic) => statistic.label)).toEqual([
      'Liked Songs',
      'Loaded Tracks',
      'Artists in Preview',
      'Preview Duration',
    ]);
    expect(serializedViewModel).not.toContain('Mood Distribution');
    expect(serializedViewModel).not.toContain('Library Health');
    expect(serializedViewModel).not.toContain('Hours Listened');
    expect(serializedViewModel).not.toContain('Generated for You');
  });
});

describe('dashboard duration formatting', () => {
  it.each([
    [0, '0m'],
    [59_999, '0m'],
    [60_000, '1m'],
    [3_600_000, '1h'],
    [3_660_000, '1h 1m'],
    [-1, '0m'],
    [Number.NaN, '0m'],
  ])('formats %s milliseconds as %s', (durationMs, expected) => {
    expect(formatDashboardDuration(durationMs)).toBe(expected);
  });
});
