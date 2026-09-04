import 'server-only';

import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import { withDatabase } from '@/lib/db/client';
import { spotifyLibrarySyncs, users } from '@/lib/db/schema';
import {
  parseSmartPlaylistInput,
  type SmartPlaylistDefinition,
  type SmartPlaylistInput,
  type SmartPlaylistPreset,
  type SmartPlaylistSort,
} from '@/lib/smart-playlists/definitions';

export type SmartPlaylistState =
  | 'builder'
  | 'success'
  | 'invalid_definition'
  | 'sync_required'
  | 'sync_in_progress'
  | 'empty_library'
  | 'no_audio_coverage'
  | 'no_matches';
export interface SmartPlaylistTrack {
  trackId: string;
  trackName: string;
  spotifyUrl: string;
  albumName: string;
  albumImageUrl: string | null;
  artistNames: string[];
  durationMs: number;
  explicit: boolean;
  savedAt: string;
  features: Record<
    'tempo' | 'energy' | 'valence' | 'danceability' | 'acousticness' | 'instrumentalness',
    number | null
  >;
}
export interface SmartPlaylistPreview {
  state: SmartPlaylistState;
  definition: SmartPlaylistDefinition | null;
  preset: SmartPlaylistPreset | null;
  summary: {
    currentSavedTrackCount: number;
    audioFeatureCount: number;
    coveragePercentage: number;
    matchingTrackCount: number;
    previewTrackCount: number;
    previewDurationMs: number;
  };
  tracks: SmartPlaylistTrack[];
  validation: { fields: Partial<Record<string, string>>; message: string } | null;
}

interface SummaryRow {
  current_count: number | string;
  audio_count: number | string;
  matching_count: number | string;
}
interface TrackRow {
  track_id: string;
  track_name: string;
  spotify_url: string;
  album_name: string;
  album_image_url: string | null;
  artist_names: unknown;
  duration_ms: number;
  explicit: boolean;
  saved_at: Date | string;
  tempo: number | string | null;
  energy: number | string | null;
  valence: number | string | null;
  danceability: number | string | null;
  acousticness: number | string | null;
  instrumentalness: number | string | null;
}
const emptySummary = {
  currentSavedTrackCount: 0,
  audioFeatureCount: 0,
  coveragePercentage: 0,
  matchingTrackCount: 0,
  previewTrackCount: 0,
  previewDurationMs: 0,
};

export function smartPlaylistSummaryFromRow(
  row: SummaryRow | undefined,
  includeMatchingCount: boolean,
): SmartPlaylistPreview['summary'] {
  const currentSavedTrackCount = Number(row?.current_count ?? 0);
  const audioFeatureCount = Number(row?.audio_count ?? 0);
  return {
    ...emptySummary,
    currentSavedTrackCount,
    audioFeatureCount,
    coveragePercentage: currentSavedTrackCount
      ? (audioFeatureCount / currentSavedTrackCount) * 100
      : 0,
    matchingTrackCount: includeMatchingCount ? Number(row?.matching_count ?? 0) : 0,
  };
}
function rows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return result && typeof result === 'object' && 'rows' in result
    ? (result as { rows: T[] }).rows
    : [];
}
const value = (input: number | string | null) => (input === null ? null : Number(input));

export function smartPlaylistFilterSql(definition: SmartPlaylistDefinition): SQL {
  const conditions: SQL[] = [];
  const columns = {
    tempo: sql.raw('af.tempo'),
    energy: sql.raw('af.energy'),
    valence: sql.raw('af.valence'),
    danceability: sql.raw('af.danceability'),
    acousticness: sql.raw('af.acousticness'),
    instrumentalness: sql.raw('af.instrumentalness'),
  };
  for (const feature of Object.keys(columns) as Array<keyof typeof columns>) {
    const min = definition.filters[`${feature}Min`];
    const max = definition.filters[`${feature}Max`];
    if (min !== undefined) conditions.push(sql`${columns[feature]} >= ${min}`);
    if (max !== undefined) conditions.push(sql`${columns[feature]} <= ${max}`);
  }
  return conditions.length ? sql`and ${sql.join(conditions, sql` and `)}` : sql``;
}

export function smartPlaylistOrderSql(sort: SmartPlaylistSort): SQL {
  const orders: Record<SmartPlaylistSort, SQL> = {
    'saved-newest': sql`s.saved_at desc, t.id asc`,
    'saved-oldest': sql`s.saved_at asc, t.id asc`,
    'tempo-asc': sql`af.tempo asc nulls last, s.saved_at desc, t.id asc`,
    'tempo-desc': sql`af.tempo desc nulls last, s.saved_at desc, t.id asc`,
    'energy-desc': sql`af.energy desc nulls last, af.tempo desc nulls last, s.saved_at desc, t.id asc`,
    'danceability-desc': sql`af.danceability desc nulls last, af.energy desc nulls last, s.saved_at desc, t.id asc`,
    'valence-desc': sql`af.valence desc nulls last, s.saved_at desc, t.id asc`,
    'acousticness-desc': sql`af.acousticness desc nulls last, s.saved_at desc, t.id asc`,
    'instrumentalness-desc': sql`af.instrumentalness desc nulls last, s.saved_at desc, t.id asc`,
  };
  return orders[sort];
}

export async function getSmartPlaylistPreview(
  spotifyAccountId: string,
  input: SmartPlaylistInput,
): Promise<SmartPlaylistPreview> {
  const parsed = parseSmartPlaylistInput(input);
  const base = (state: SmartPlaylistState): SmartPlaylistPreview => ({
    state,
    definition: parsed.kind === 'definition' ? parsed.definition : null,
    preset: parsed.kind === 'definition' ? parsed.preset : null,
    summary: { ...emptySummary },
    tracks: [],
    validation: parsed.kind === 'invalid_definition' ? parsed.validation : null,
  });
  return withDatabase((database) =>
    database.transaction(async (tx) => {
      const [user] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.spotifyAccountId, spotifyAccountId))
        .limit(1);
      if (!user) return base('sync_required');
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${user.id}))`);
      const [running] = await tx
        .select({ id: spotifyLibrarySyncs.id })
        .from(spotifyLibrarySyncs)
        .where(
          and(
            eq(spotifyLibrarySyncs.userId, user.id),
            eq(spotifyLibrarySyncs.syncKind, 'full'),
            eq(spotifyLibrarySyncs.status, 'running'),
          ),
        )
        .limit(1);
      if (running) return base('sync_in_progress');
      const [baseline] = await tx
        .select({ completedAt: spotifyLibrarySyncs.completedAt })
        .from(spotifyLibrarySyncs)
        .where(
          and(
            eq(spotifyLibrarySyncs.userId, user.id),
            eq(spotifyLibrarySyncs.syncKind, 'full'),
            eq(spotifyLibrarySyncs.status, 'completed'),
          ),
        )
        .orderBy(desc(spotifyLibrarySyncs.completedAt))
        .limit(1);
      if (!baseline?.completedAt) return base('sync_required');
      const filter =
        parsed.kind === 'definition' ? smartPlaylistFilterSql(parsed.definition) : sql``;
      const hasAudioFilters =
        parsed.kind === 'definition' && Object.keys(parsed.definition.filters).length > 0;
      const summaryResult = await tx.execute(sql`
      select count(*)::int as current_count,
        count(af.track_id) filter (where af.provider = 'reccobeats' and af.status = 'available')::int as audio_count,
          count(*) filter (where ${parsed.kind === 'invalid_definition' ? sql`false` : hasAudioFilters ? sql`af.provider = 'reccobeats' and af.status = 'available' ${filter}` : sql`true`})::int as matching_count
      from user_saved_tracks s join spotify_tracks t on t.id=s.track_id
      left join track_audio_features af on af.track_id=s.track_id and af.provider='reccobeats'
      where s.user_id=${user.id}`);
      const summaryRow = rows<SummaryRow>(summaryResult)[0];
      const summary = smartPlaylistSummaryFromRow(summaryRow, parsed.kind === 'definition');
      const current = summary.currentSavedTrackCount;
      const audio = summary.audioFeatureCount;
      if (parsed.kind === 'invalid_definition') return { ...base('invalid_definition'), summary };
      if (!current) return { ...base('empty_library'), summary };
      if (!audio && (parsed.kind === 'builder' || hasAudioFilters))
        return { ...base('no_audio_coverage'), summary };
      if (parsed.kind === 'builder') return { ...base('builder'), summary };
      if (!summary.matchingTrackCount) return { ...base('no_matches'), summary };
      const trackResult = await tx.execute(sql`
      select t.id track_id, t.name track_name, t.spotify_url, a.name album_name, a.image_url album_image_url,
        jsonb_agg(ar.name order by ta.position) artist_names, t.duration_ms, t.explicit, s.saved_at,
        af.tempo, af.energy, af.valence, af.danceability, af.acousticness, af.instrumentalness
      from user_saved_tracks s join spotify_tracks t on t.id=s.track_id join spotify_albums a on a.id=t.album_id
      join spotify_track_artists ta on ta.track_id=t.id join spotify_artists ar on ar.id=ta.artist_id
      left join track_audio_features af on af.track_id=t.id and af.provider='reccobeats' and af.status='available'
      where s.user_id=${user.id} ${hasAudioFilters ? sql`and af.track_id is not null ${filter}` : sql``}
      group by t.id, a.id, s.saved_at, af.track_id, af.provider
      order by ${smartPlaylistOrderSql(parsed.definition.sort)} limit ${parsed.definition.limit}`);
      const tracks = rows<TrackRow>(trackResult).map((row) => ({
        trackId: row.track_id,
        trackName: row.track_name,
        spotifyUrl: row.spotify_url,
        albumName: row.album_name,
        albumImageUrl: row.album_image_url,
        artistNames: Array.isArray(row.artist_names)
          ? row.artist_names.filter((name): name is string => typeof name === 'string')
          : [],
        durationMs: Number(row.duration_ms),
        explicit: row.explicit,
        savedAt: new Date(row.saved_at).toISOString(),
        features: {
          tempo: value(row.tempo),
          energy: value(row.energy),
          valence: value(row.valence),
          danceability: value(row.danceability),
          acousticness: value(row.acousticness),
          instrumentalness: value(row.instrumentalness),
        },
      }));
      return {
        ...base('success'),
        summary: {
          ...summary,
          previewTrackCount: tracks.length,
          previewDurationMs: tracks.reduce((total, track) => total + track.durationMs, 0),
        },
        tracks,
      };
    }),
  );
}
