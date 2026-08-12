# Dashboard data

MuseVault's `/dashboard` route is authenticated, dynamically rendered, and read-only over the latest successfully synchronized PostgreSQL library snapshot. Normal dashboard rendering no longer calls Spotify's saved-tracks API or an internal MuseVault HTTP route.

## Server-side data flow

The encrypted session supplies authentication, Spotify account identity, display name, and the approved profile image. The server resolves `users.spotify_account_id`, then reads the persisted library in one database transaction:

`session → Spotify account identity/profile → PostgreSQL persisted library → SQL aggregates plus five recent tracks → safe dashboard view model`

The transaction takes the existing per-user advisory lock briefly. A running authoritative full sync returns `sync_in_progress`, preventing page-by-page mutations from appearing as a completed snapshot. Without a completed `full` sync baseline, including for a known user with no baseline, the dashboard returns `sync_required` and links to `/library`. A completed full sync with zero tracks is a valid dashboard.

## Dashboard fields

| Field                 | Persisted source and scope                                        |
| --------------------- | ----------------------------------------------------------------- |
| Profile               | Safe display name and image from the encrypted session            |
| Liked Songs           | Complete `user_saved_tracks` count                                |
| Artists               | Distinct artists across the complete persisted library            |
| Library Duration      | SQL sum of persisted track duration                               |
| Average Track Length  | Aggregate duration divided by saved count, zero-safe              |
| Recently Saved        | Five newest persisted memberships with normalized track metadata  |
| Top artists           | Five artists with the most credited tracks in the current library |
| Top albums            | Five albums with the most tracks in the current library           |
| Saved timeline        | Current memberships grouped by the UTC year of `saved_at`         |
| Explicit composition  | SQL counts of explicit and non-explicit current memberships       |
| Duration distribution | SQL counts in `<2m`, `2–3m`, `3–4m`, `4–5m`, and `5m+` buckets    |
| Saved-date facts      | Earliest and latest `saved_at` among current memberships          |

All large-library analytics are reduced in SQL inside the same coherent dashboard transaction; the application does not load the full library into memory. Top-artist counts use distinct saved track IDs per credited artist, so a collaboration counts once for every credited artist but never twice for the same artist. Album memberships count once toward the track's persisted album. Ties are ordered deterministically by name and then Spotify ID. Recent artists retain persisted relationship order. URLs are allow-listed before presentation, including persisted top-album artwork.

## Snapshot behavior and limitations

A completed full sync creates the authoritative baseline. Validated incremental syncs atomically update it; evidence of removal causes `/library` to perform full reconciliation. The dashboard never synchronizes data itself and may therefore lag behind Spotify until the user initiates synchronization.

The saved-library timeline describes when tracks in the **current** synchronized snapshot were saved. MuseVault does not preserve removed saved-track memberships as historical events, so this is not a complete historical library-size ledger or an all-time additions history. Earliest and latest dates have the same current-membership scope.

Rediscover, Time Machine, Wrapped, recommendations, and playlists remain unimplemented previews. There is no mood inference or library-health score. There is still no background synchronization, listening-history ingestion, recommendation engine, or playlist generation.

## Manual verification

Open `/dashboard` after a completed full sync and compare its complete count with `/library`. Verify the top artists and albums, safe artwork, saved timeline, composition, duration buckets, saved-date facts, the five newest persisted tracks, and external links. Without synchronizing, confirm the snapshot remains stable; after Sync changes, refresh and confirm persisted analytics update. Also verify empty-library, initial-sync, running-full-sync, logout, and responsive layouts.
