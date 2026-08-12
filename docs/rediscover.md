# Rediscover

Rediscover surfaces older tracks from a user's current saved-library snapshot using only persisted evidence MuseVault can truthfully observe. Rendering `/rediscover` makes no Spotify, ReccoBeats, recommendation, or AI request.

## Candidate universe and consistency

The repository first requires a completed authoritative full-library sync. A completed zero-track sync is valid. A running full sync returns `sync_in_progress`; a missing completed baseline returns `sync_required`. The transaction takes the same per-user PostgreSQL advisory lock as the dashboard before reading the snapshot.

Only rows currently present in `user_saved_tracks` can become candidates. Removed historical memberships cannot appear. A track is eligible when `saved_at <= now() - interval '90 days'`, using PostgreSQL time throughout the query.

Eligible tracks are excluded when positive evidence shows either:

- a MuseVault-recorded play at or after `now() - interval '7 days'`; or
- membership in the latest `short_term` Spotify Top Track snapshot.

For each time range, “latest” means the first snapshot ordered by `snapshot_date DESC`, `captured_at DESC`, then snapshot ID descending. Historical snapshots are not combined. Medium- and long-term membership affect ranking but do not exclude a track, and affinity rank is never interpreted as play count.

## Exact score and ordering

Saved age contributes 50 points at 5 years, 40 at 3 years, 32 at 2 years, 24 at 1 year, 16 at 180 days, or 8 at 90 days. Boundaries are inclusive PostgreSQL interval comparisons.

When a recorded play exists, its recency subtracts 25 points when within 30 days, 15 when within 90 days, or 5 when older. Recorded play count subtracts 2 points per event, capped at 20. Latest medium-term affinity subtracts 15 and latest long-term affinity subtracts 8. Missing recorded history contributes zero: it receives no positive bonus and is UNKNOWN, not evidence of inactivity. Scores are not clamped.

Ordering is deterministic: score descending, `saved_at` ascending, then Spotify track ID ascending. Artist names use `jsonb_agg(... ORDER BY spotify_track_artists.position)`, preserving credited Spotify order. SQL applies a fixed limit of 20 and offset for the normalized `?page=` value; a separate SQL count supplies total pages.

Audio-feature availability has no role in eligibility or scoring. Rediscover does not trigger enrichment.

## Summary and listening limitations

The page reports the current saved-library count, eligible older-save count before activity filtering, final candidate count, and earliest MuseVault-recorded play when available. It also derives counts excluded by recent recorded play and short-term affinity for repository consumers.

MuseVault only knows listening events recorded since listening synchronization began. Missing recorded plays can reflect synchronization gaps or plays Spotify no longer exposes, so they are never described as “never listened,” “unplayed,” or proof of inactivity. A present timestamp is labelled “Latest MuseVault-recorded play.”

## Current limitations

Rediscover has no feedback, dismissal, impression, click, or history persistence; no shuffle or random scoring; no playlist generation or export; no recommendation API; and no AI. Existing cached audio features are intentionally omitted from the 4D UI. Results change only when the persisted library, listening history, affinity snapshots, or database time boundaries change. Milestone 4D adds no schema migration, environment variable, API key, paid provider, or Spotify scope.
