export const SPOTIFY_PLAYLIST_EXPORT_SCOPE = 'playlist-modify-private';

export function hasSpotifyPlaylistExportScope(scopes: readonly string[]): boolean {
  return scopes.includes(SPOTIFY_PLAYLIST_EXPORT_SCOPE);
}
