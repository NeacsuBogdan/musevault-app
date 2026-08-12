# Listening intelligence

MuseVault's Listening Insights foundation combines two Spotify sources. `GET /v1/me/player/recently-played` supplies the recent plays available at synchronization time, while `GET /v1/me/top/{type}` supplies Spotify-calculated track and artist affinity rankings. MuseVault requests exactly `user-library-read`, `user-read-private`, `user-read-recently-played`, and `user-top-read`.

Existing connections are checked server-side against `spotify_connections.scopes`. If either listening scope is absent, MuseVault reports `authorization_required` before calling a restricted Spotify endpoint. Reauthorization uses the existing PKCE flow and updates the connection/session without replacing the user or deleting saved-library data.

## Recorded history

Recently Played events are normalized into the shared artist, album, track, and ordered track-artist catalog, then inserted into append-only `spotify_play_history`. The `(user_id, played_at, track_id)` key makes retries idempotent while allowing different tracks at one timestamp and repeated plays of one track at different timestamps. Listening ingestion never creates `user_saved_tracks` memberships.

The first manual sync starts from the newest available Recently Played page and follows older cursors for at most ten pages of fifty. This is a safety cap, not a promise that Spotify exposes 500 plays or complete historical listening. Later syncs request events newer than the newest recorded timestamp. A request processes at most three pages and persists cursor/run state for continuation.

Coverage begins at the earliest event MuseVault successfully records. Unknown time before that event, and gaps during periods without synchronization, are not treated as zero listening. Long gaps between manual syncs may be unrecoverable after plays leave Spotify's Recently Played window.

## Spotify affinity

After recent-play capture is caught up, MuseVault captures the first 20 tracks and artists for Spotify's `short_term`, `medium_term`, and `long_term` ranges. These are affinity ranks, not play counts. One effective snapshot is kept per user, UTC date, and range: another sync that day atomically replaces its ranked items, while a later UTC day creates historical snapshot data.

## Scope and future operation

Milestone 4B is user-triggered only. The bounded, idempotent service can later be invoked by a background scheduler, but this milestone adds no cron, worker, queue, webhook, or background job. BPM, audio features, mood, energy, valence, recommendations, Rediscover, Wrapped, playlist generation, and AI are not part of 4B.
