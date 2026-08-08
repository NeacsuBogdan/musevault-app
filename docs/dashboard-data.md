# Dashboard data

MuseVault's `/dashboard` route is authenticated and dynamically rendered. It reads the encrypted
Spotify session and saved tracks on the server, then passes only a safe dashboard view model to the
presentation components.

## Real dashboard fields

| Field              | Source and scope                                                     |
| ------------------ | -------------------------------------------------------------------- |
| Profile            | Display name and approved profile image from the encrypted session   |
| Liked Songs        | Spotify's `total` for the complete saved-tracks collection           |
| Loaded Tracks      | Number of tracks in the current page, never more than 50             |
| Artists in Preview | Unique Spotify artist IDs across only the loaded page                |
| Preview Duration   | Combined duration of only the loaded page                            |
| Recently Saved     | Up to five tracks from the beginning of the loaded saved-tracks page |

The artist and duration statistics are explicitly labelled as page-limited. They do not describe
the complete library unless the complete library contains no more than the loaded tracks.

## Preview-only sections

Music Evolution, Mood Distribution, Library Health, Rediscover concepts, Time Machine, Wrapped,
recommendations, and generated playlists are not derivable truthfully from one saved-tracks page.
Their retained cards are labelled as previews or as requiring a future full-library sync. They do
not display mock scores, percentages, dates, track counts, or listening-history claims.

## Server-side data flow

The dashboard and `GET /api/spotify/saved-tracks` call the same server-only saved-tracks service.
That service validates pagination, proactively refreshes expiring access tokens, and performs one
forced refresh and retry after an unexpected Spotify `401`.

The dashboard does not call MuseVault's API route over HTTP. Calling the service directly avoids an
unnecessary internal network request and keeps Spotify credentials and tokens out of browser code.
When a refresh is required during dashboard rendering, a tightly scoped authentication Route
Handler performs the cookie-writing step and redirects back. This boundary preserves rotated
refresh tokens because Next.js Server Components can read cookies but cannot update them.

HTTP status codes, public error payloads, `Retry-After`, and response headers remain concerns of the
saved-tracks API route. Dashboard errors are mapped separately to fixed, user-safe states.

## Current limitations

- MuseVault loads only the first saved-tracks page, with a maximum of 50 tracks.
- Full-library snapshots and conservative user-initiated incremental updates can now be persisted,
  but there is no background synchronization and the dashboard does not query the database yet.
- Page-limited artist and duration statistics cannot represent larger libraries.
- Recently Saved is limited to the tracks available in the current page.
- Listening analytics, recommendations, library health, and playlist generation are not connected.
- Refresh coordination is in-memory within one server process; multi-instance coordination needs a
  future persistence design.

## Manual verification

1. Open `/dashboard` while disconnected and confirm redirect to `/`.
2. Connect Spotify through the existing login flow.
3. Confirm `/library` still loads saved tracks.
4. Open `/dashboard`.
5. Confirm profile information is real.
6. Confirm the Liked Songs total matches the Spotify response.
7. Confirm page-limited statistics are labelled honestly.
8. Confirm recently saved tracks use real data.
9. Confirm preview-only cards are clearly labelled.
10. Confirm logout still works.
11. Confirm the dashboard remains responsive at 1440px, 1024px, and 390px.
