# Incremental library synchronization

Spotify's `GET /me/tracks` API provides offset/limit pagination, not a documented change cursor or `since` token. MuseVault therefore treats full synchronization as the authoritative reconciliation and uses incremental synchronization only when a bounded head scan can prove that the observed change is addition-only (with optional resaves).

## Conservative head scan

`POST /api/spotify/library/sync/incremental` examines at most three pages of 50 newest saved tracks. Membership identity is Spotify track ID plus `savedAt`; metadata equality is not a membership boundary. A track is new when its ID is absent, resaved when its ID exists with a different `savedAt`, and stable when both values match.

A stable-overlap page has every returned item already persisted with the same `savedAt`. Candidates stay in memory until such a page is reached. Spotify's `total` must remain identical across pages and equal the persisted baseline count plus genuinely new IDs. Resaves do not increase that expected total. A missing overlap, changing total, duplicate/ambiguous boundary, removal, balanced add-and-remove, or unexplained growth returns `full_sync_required` without changing membership.

The client automatically continues through the existing bounded full-sync loop after that result. Incremental synchronization never deletes memberships.

## Periodic reconciliation

Even a successful head scan cannot prove that an older membership changed because Spotify supplies no delta cursor. MuseVault requires a full reconciliation after 10 successful incremental syncs or when the latest full sync is older than seven days. These checks run only when the user starts synchronization; there is no cron, queue, webhook, or background job.

## Concurrency and atomicity

The partial unique index still allows one running sync per user across both sync kinds. Claims and finalization use the existing per-user PostgreSQL advisory transaction lock. Network scanning occurs outside a long transaction; finalization revalidates the baseline under the lock.

Validated candidates are applied in one transaction: normalized albums, artists, tracks, ordered track-artist rows, and memberships are upserted; the sync is completed; and `last_successful_sync_at` is updated. `no_changes` also updates that timestamp after validation. `full_sync_required` completes the assessment but does not update memberships or the successful-sync timestamp. A technical failure rolls back persistence and uses a fixed failure code.

## Security and limitations

Both incremental endpoints require the encrypted authenticated session, use Node.js and `private, no-store`, and apply the same-origin check to POST. Responses expose fixed states and aggregate summaries, never user/database IDs, tokens, ciphertext, connection strings, raw Spotify errors, SQL, or stack traces. No OAuth scopes or catalog requests were added.

Offset pagination can change while pages are read; suspicious boundaries fall back conservatively, but periodic full reconciliation remains essential. A Spotify refresh token rotated into the encrypted cookie is still not mirrored to `spotify_connections`; that existing authentication debt remains out of scope.

## Manual verification

Start with a completed full sync. Check a no-change incremental, then save one track and confirm `applied`. Remove one track and confirm automatic full fallback decreases the final count. Manually run Full resync, then verify `/dashboard` and logout. In the Neon development branch, inspect only schema metadata and aggregate uniqueness checks; do not select encrypted tokens or user content.

The next milestone is a database-backed dashboard.
