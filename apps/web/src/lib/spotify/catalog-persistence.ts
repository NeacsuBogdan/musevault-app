import 'server-only';

import { inArray, sql } from 'drizzle-orm';
import type { Database } from '@/lib/db/client';
import { spotifyAlbums, spotifyArtists, spotifyTrackArtists, spotifyTracks } from '@/lib/db/schema';
import type { SpotifyCatalogTrack } from '@/types/spotify';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
function unique<T extends { id: string }>(items: readonly T[]) {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

export function prepareSpotifyCatalog(items: readonly SpotifyCatalogTrack[], now: Date) {
  return {
    albums: unique(
      items.map((track) => ({
        id: track.albumId,
        imageUrl: track.albumImageUrl,
        name: track.albumName,
        updatedAt: now,
      })),
    ),
    artists: unique(
      items.flatMap((track) =>
        track.artistIds.map((id, position) => ({
          id,
          name: track.artistNames[position] ?? '',
          updatedAt: now,
        })),
      ),
    ),
    relationships: items.flatMap((track) =>
      track.artistIds.map((artistId, position) => ({ artistId, position, trackId: track.id })),
    ),
    tracks: unique(
      items.map((track) => ({
        albumId: track.albumId,
        durationMs: track.durationMs,
        explicit: track.explicit,
        id: track.id,
        name: track.name,
        spotifyUrl: track.spotifyUrl,
        updatedAt: now,
      })),
    ),
  };
}

export async function persistSpotifyCatalog(
  transaction: Transaction,
  prepared: ReturnType<typeof prepareSpotifyCatalog>,
  now: Date,
) {
  if (prepared.albums.length)
    await transaction
      .insert(spotifyAlbums)
      .values(prepared.albums)
      .onConflictDoUpdate({
        target: spotifyAlbums.id,
        set: { imageUrl: sql`excluded.image_url`, name: sql`excluded.name`, updatedAt: now },
      });
  if (prepared.artists.length)
    await transaction
      .insert(spotifyArtists)
      .values(prepared.artists)
      .onConflictDoUpdate({
        target: spotifyArtists.id,
        set: { name: sql`excluded.name`, updatedAt: now },
      });
  if (!prepared.tracks.length) return;
  await transaction
    .insert(spotifyTracks)
    .values(prepared.tracks)
    .onConflictDoUpdate({
      target: spotifyTracks.id,
      set: {
        albumId: sql`excluded.album_id`,
        durationMs: sql`excluded.duration_ms`,
        explicit: sql`excluded.explicit`,
        name: sql`excluded.name`,
        spotifyUrl: sql`excluded.spotify_url`,
        updatedAt: now,
      },
    });
  const trackIds = prepared.tracks.map((track) => track.id);
  await transaction
    .delete(spotifyTrackArtists)
    .where(inArray(spotifyTrackArtists.trackId, trackIds));
  if (prepared.relationships.length)
    await transaction
      .insert(spotifyTrackArtists)
      .values(prepared.relationships)
      .onConflictDoNothing();
}
