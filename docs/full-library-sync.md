# Full library synchronization

Milestone 3B persists a complete, resumable snapshot of a connected user's Spotify Liked Songs. It does not implement incremental or scheduled synchronization.

## Architecture and protocol

`POST /api/spotify/library/sync` starts or resumes one full sync and processes at most **three Spotify pages of 50 tracks**. The client calls it repeatedly, updating visible progress after every response, until the status is `completed`. `GET` returns safe persisted progress and summary data. Both methods require the encrypted Spotify session, use `private, no-store`, and POST applies a same-origin check.

The Spotify boundary remains raw JSON, Zod validation, then normalized application data. Normalized tracks include stable track and album IDs, ordered artist IDs/names, Spotify URL, duration, explicit flag, album image, and `savedAt`. No scope or profile expansion was added.

## Schema and snapshot semantics

- `spotify_artists` and `spotify_albums` hold globally reusable metadata.
- `spotify_tracks` belongs to an album.
- `spotify_track_artists` is ordered; `(track_id, artist_id)` is primary and `(track_id, position)` is unique.
- `user_saved_tracks` records membership, `saved_at`, and `last_seen_sync_id`.
- `spotify_library_syncs` records running, completed, and failed full runs.

Checks prevent negative durations, positions, offsets, totals, and processed counts. User/order/cleanup indexes support queries. A partial unique index permits only one `running` sync per user.

Each page transactionally upserts albums, artists, tracks, ordered relationships, memberships, and progress. Mutable metadata and `savedAt` are refreshed. Every observed membership is marked with the current run ID. Only after the entire library was read does one transaction delete older markers, complete the run, and update `last_successful_sync_at`. An interrupted run therefore leaves the previous complete snapshot intact.

A page is final when it is empty, has fewer than 50 items, or its returned offset plus item count reaches Spotify's returned total. Work is capped at three pages per POST, so a changing total cannot create an unbounded request.

## Concurrency, retries, and errors

Each chunk transaction takes a PostgreSQL transaction advisory lock derived from the user UUID. Concurrent tabs serialize before selecting or creating the active run; the partial unique index is a second guard. Upserts and persisted offsets make retries safe after a response is lost.

Rate limits retain a safe numeric `Retry-After`; the UI stops rather than immediately retrying. Authorization expiry marks the run failed and requests reconnection. Rate-limit, temporary, and database failures keep progress resumable. Only fixed codes are stored. Raw Spotify/database errors are never returned or persisted.

## Persisted queries

`getPersistedLibrarySummary(userId)` returns saved-track count, unique-artist count, total duration, and last successful sync time. `getPersistedSavedTracks(userId, pagination)` has a maximum limit of 100, orders newest saved first, and excludes sync IDs and credentials. Dashboard statistics intentionally still use live Spotify data.

## Limitations and security

Spotify changes during offset pagination can produce an eventually consistent snapshot. A later incremental-sync milestone will improve freshness. The encrypted HttpOnly session still carries access and refresh tokens. A rotated refresh token is updated in the cookie but not yet mirrored to `spotify_connections`; that known Milestone 3A debt remains intentionally out of scope.

No library table stores tokens, ciphertext, connection details, SQL, or stack traces. No OAuth scope, worker, queue, Redis, cron, or production migration is added.

## Manual verification

1. Start the app and connect Spotify at `http://127.0.0.1:3000`.
2. Open `/library`, start Full library sync, and watch progress.
3. Compare the persisted count with Spotify Liked Songs, reload, and confirm state persists.
4. Resync and confirm counts do not duplicate.
5. Confirm `/dashboard` and logout still work.
6. Inspect development-branch constraints and aggregate counts only; do not select token or user-content columns.

The next milestone will connect complete persisted data to dashboard analytics and add incremental freshness.
