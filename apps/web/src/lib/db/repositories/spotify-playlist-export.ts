import 'server-only';

import { eq } from 'drizzle-orm';
import { withDatabase } from '@/lib/db/client';
import { spotifyConnections, users } from '@/lib/db/schema';
import { hasSpotifyPlaylistExportScope } from '@/lib/spotify/playlist-scopes';

export async function getSpotifyPlaylistExportCapability(accountId: string): Promise<boolean> {
  return withDatabase(async (database) => {
    const [connection] = await database
      .select({ scopes: spotifyConnections.scopes })
      .from(users)
      .innerJoin(spotifyConnections, eq(spotifyConnections.userId, users.id))
      .where(eq(users.spotifyAccountId, accountId))
      .limit(1);
    return hasSpotifyPlaylistExportScope(connection?.scopes ?? []);
  });
}
