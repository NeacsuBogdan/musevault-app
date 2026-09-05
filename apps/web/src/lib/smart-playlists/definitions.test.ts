import { describe, expect, it } from 'vitest';
import {
  parseSmartPlaylistInput,
  SMART_PLAYLIST_PRESETS,
  SMART_PLAYLIST_SORTS,
  SMART_PLAYLIST_SORT_CHAINS,
} from './definitions';

describe('smart playlist presets', () => {
  it.each([
    ['high-energy', { energyMin: 0.7 }, 'energy-desc'],
    ['danceable', { danceabilityMin: 0.7 }, 'danceability-desc'],
    ['acoustic', { acousticnessMin: 0.65 }, 'acousticness-desc'],
    ['instrumental', { instrumentalnessMin: 0.5 }, 'instrumentalness-desc'],
    ['fast-pace', { tempoMin: 140 }, 'tempo-desc'],
  ] as const)('%s has its exact definition', (name, filters, sort) => {
    expect(SMART_PLAYLIST_PRESETS[name].definition).toEqual({ filters, sort, limit: 30 });
  });
});

describe('smart playlist input validation', () => {
  it('keeps the empty and unknown-only URL in builder state', () => {
    expect(parseSmartPlaylistInput({})).toEqual({ kind: 'builder' });
    expect(parseSmartPlaylistInput({ campaign: 'ignored' })).toEqual({ kind: 'builder' });
  });
  it.each([
    [{ energyMin: '50' }, { energyMin: 0.5 }],
    [{ energyMax: '50' }, { energyMax: 0.5 }],
    [
      { energyMin: '50', energyMax: '80' },
      { energyMin: 0.5, energyMax: 0.8 },
    ],
    [
      { energyMin: '50', energyMax: '50' },
      { energyMin: 0.5, energyMax: 0.5 },
    ],
    [
      { tempoMin: '0', tempoMax: '300' },
      { tempoMin: 0, tempoMax: 300 },
    ],
  ])('accepts valid bounds %#', (input, filters) => {
    expect(parseSmartPlaylistInput(input)).toMatchObject({
      kind: 'definition',
      definition: { filters, sort: 'saved-newest', limit: 30 },
    });
  });
  it.each([
    [{ energyMin: '80', energyMax: '20' }, 'energyMax'],
    [{ tempoMin: '-1' }, 'tempoMin'],
    [{ tempoMax: '301' }, 'tempoMax'],
    [{ valenceMin: '-1' }, 'valenceMin'],
    [{ acousticnessMax: '101' }, 'acousticnessMax'],
    [{ energyMin: 'wat' }, 'energyMin'],
    [{ energyMin: ['20', '30'] }, 'energyMin'],
    [{ preset: ['acoustic', 'danceable'] }, 'preset'],
    [{ limit: '10' }, 'limit'],
    [{ sort: 'random' }, 'sort'],
    [{ preset: 'mystery' }, 'preset'],
    [{ preset: '__proto__' }, 'preset'],
    [{ preset: 'constructor' }, 'preset'],
    [{ preset: 'toString' }, 'preset'],
  ] as const)('rejects invalid input %#', (input, field) => {
    const result = parseSmartPlaylistInput(
      input as unknown as Record<string, string | string[] | undefined>,
    );
    expect(result.kind).toBe('invalid_definition');
    if (result.kind === 'invalid_definition') expect(result.validation.fields[field]).toBeTruthy();
  });
  it.each([20, 30, 50])('accepts limit %i', (limit) => {
    expect(parseSmartPlaylistInput({ limit: String(limit) })).toMatchObject({
      kind: 'definition',
      definition: { limit },
    });
  });
  it.each(SMART_PLAYLIST_SORTS)('accepts %s with a deterministic track ID tie-breaker', (sort) => {
    expect(parseSmartPlaylistInput({ sort })).toMatchObject({
      kind: 'definition',
      definition: { sort },
    });
    expect(SMART_PLAYLIST_SORT_CHAINS[sort].at(-1)).toBe('trackId ASC');
  });
  it('ignores unknown parameters without changing a valid definition', () => {
    expect(parseSmartPlaylistInput({ energyMin: '70', surprise: 'true' })).toEqual(
      parseSmartPlaylistInput({ energyMin: '70' }),
    );
  });
});
