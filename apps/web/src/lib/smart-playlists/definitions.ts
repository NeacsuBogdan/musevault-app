export const SMART_PLAYLIST_LIMITS = [20, 30, 50] as const;
export const SMART_PLAYLIST_SORTS = [
  'saved-newest',
  'saved-oldest',
  'tempo-asc',
  'tempo-desc',
  'energy-desc',
  'danceability-desc',
  'valence-desc',
  'acousticness-desc',
  'instrumentalness-desc',
] as const;

export type SmartPlaylistSort = (typeof SMART_PLAYLIST_SORTS)[number];
export type SmartPlaylistLimit = (typeof SMART_PLAYLIST_LIMITS)[number];
export type SmartPlaylistFilterName =
  | 'tempoMin'
  | 'tempoMax'
  | 'energyMin'
  | 'energyMax'
  | 'valenceMin'
  | 'valenceMax'
  | 'danceabilityMin'
  | 'danceabilityMax'
  | 'acousticnessMin'
  | 'acousticnessMax'
  | 'instrumentalnessMin'
  | 'instrumentalnessMax';

export type SmartPlaylistFilters = Partial<Record<SmartPlaylistFilterName, number>>;
export interface SmartPlaylistDefinition {
  filters: SmartPlaylistFilters;
  sort: SmartPlaylistSort;
  limit: SmartPlaylistLimit;
}

export const SMART_PLAYLIST_PRESETS = {
  'high-energy': {
    displayName: 'High Energy',
    rule: 'Energy ≥ 70%',
    definition: { filters: { energyMin: 0.7 }, sort: 'energy-desc', limit: 30 },
  },
  danceable: {
    displayName: 'Danceable',
    rule: 'Danceability ≥ 70%',
    definition: { filters: { danceabilityMin: 0.7 }, sort: 'danceability-desc', limit: 30 },
  },
  acoustic: {
    displayName: 'Acoustic Leaning',
    rule: 'Acousticness ≥ 65%',
    definition: { filters: { acousticnessMin: 0.65 }, sort: 'acousticness-desc', limit: 30 },
  },
  instrumental: {
    displayName: 'Instrumental',
    rule: 'Instrumentalness ≥ 50%',
    definition: {
      filters: { instrumentalnessMin: 0.5 },
      sort: 'instrumentalness-desc',
      limit: 30,
    },
  },
  'fast-pace': {
    displayName: 'Fast Pace',
    rule: 'Tempo ≥ 140 BPM',
    definition: { filters: { tempoMin: 140 }, sort: 'tempo-desc', limit: 30 },
  },
} as const satisfies Record<
  string,
  { displayName: string; rule: string; definition: SmartPlaylistDefinition }
>;

export type SmartPlaylistPreset = keyof typeof SMART_PLAYLIST_PRESETS;
export type SmartPlaylistInput = Record<string, string | string[] | undefined>;
export type ParsedSmartPlaylistInput =
  | { kind: 'builder' }
  | {
      kind: 'invalid_definition';
      validation: { fields: Partial<Record<string, string>>; message: string };
    }
  | {
      kind: 'definition';
      definition: SmartPlaylistDefinition;
      preset: SmartPlaylistPreset | null;
    };

const filterNames: SmartPlaylistFilterName[] = [
  'tempoMin',
  'tempoMax',
  'energyMin',
  'energyMax',
  'valenceMin',
  'valenceMax',
  'danceabilityMin',
  'danceabilityMax',
  'acousticnessMin',
  'acousticnessMax',
  'instrumentalnessMin',
  'instrumentalnessMax',
];

function invalid(fields: Partial<Record<string, string>>): ParsedSmartPlaylistInput {
  return {
    kind: 'invalid_definition',
    validation: { fields, message: Object.values(fields)[0] ?? 'Invalid filter definition.' },
  };
}

export function parseSmartPlaylistInput(input: SmartPlaylistInput): ParsedSmartPlaylistInput {
  const presetValue = input.preset;
  if (Array.isArray(presetValue)) return invalid({ preset: 'Choose exactly one preset.' });
  if (presetValue !== undefined) {
    if (!(presetValue in SMART_PLAYLIST_PRESETS)) return invalid({ preset: 'Unknown preset.' });
    const preset = presetValue as SmartPlaylistPreset;
    return { kind: 'definition', definition: SMART_PLAYLIST_PRESETS[preset].definition, preset };
  }

  const recognized = [...filterNames, 'sort', 'limit'];
  if (!recognized.some((name) => input[name] !== undefined)) return { kind: 'builder' };
  const fields: Partial<Record<string, string>> = {};
  for (const name of recognized) {
    if (Array.isArray(input[name])) fields[name] = 'Provide this value only once.';
  }
  if (Object.keys(fields).length) return invalid(fields);

  const filters: SmartPlaylistFilters = {};
  for (const name of filterNames) {
    const raw = input[name];
    if (raw === undefined || raw === '') continue;
    const value = Number(raw);
    const tempo = name.startsWith('tempo');
    if (!Number.isFinite(value)) fields[name] = 'Enter a finite number.';
    else if (value < 0 || value > (tempo ? 300 : 100))
      fields[name] = tempo ? 'Tempo must be between 0 and 300 BPM.' : 'Percentage must be 0–100.';
    else filters[name] = tempo ? value : value / 100;
  }
  for (const feature of [
    'tempo',
    'energy',
    'valence',
    'danceability',
    'acousticness',
    'instrumentalness',
  ] as const) {
    const min = filters[`${feature}Min`];
    const max = filters[`${feature}Max`];
    if (min !== undefined && max !== undefined && min > max)
      fields[`${feature}Max`] =
        `${feature[0]?.toUpperCase()}${feature.slice(1)} maximum must be greater than or equal to its minimum.`;
  }
  const sortRaw = input.sort ?? 'saved-newest';
  if (!SMART_PLAYLIST_SORTS.includes(sortRaw as SmartPlaylistSort))
    fields.sort = 'Unsupported sort.';
  const limitRaw = input.limit ?? '30';
  const limit = Number(limitRaw);
  if (!SMART_PLAYLIST_LIMITS.includes(limit as SmartPlaylistLimit))
    fields.limit = 'Limit must be 20, 30, or 50.';
  if (Object.keys(fields).length) return invalid(fields);
  return {
    kind: 'definition',
    definition: { filters, sort: sortRaw as SmartPlaylistSort, limit: limit as SmartPlaylistLimit },
    preset: null,
  };
}

export const SMART_PLAYLIST_SORT_CHAINS: Record<SmartPlaylistSort, readonly string[]> = {
  'saved-newest': ['savedAt DESC', 'trackId ASC'],
  'saved-oldest': ['savedAt ASC', 'trackId ASC'],
  'tempo-asc': ['tempo ASC NULLS LAST', 'savedAt DESC', 'trackId ASC'],
  'tempo-desc': ['tempo DESC NULLS LAST', 'savedAt DESC', 'trackId ASC'],
  'energy-desc': ['energy DESC NULLS LAST', 'tempo DESC NULLS LAST', 'savedAt DESC', 'trackId ASC'],
  'danceability-desc': [
    'danceability DESC NULLS LAST',
    'energy DESC NULLS LAST',
    'savedAt DESC',
    'trackId ASC',
  ],
  'valence-desc': ['valence DESC NULLS LAST', 'savedAt DESC', 'trackId ASC'],
  'acousticness-desc': ['acousticness DESC NULLS LAST', 'savedAt DESC', 'trackId ASC'],
  'instrumentalness-desc': ['instrumentalness DESC NULLS LAST', 'savedAt DESC', 'trackId ASC'],
};
