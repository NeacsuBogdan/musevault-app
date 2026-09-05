# Rediscover v2

Rediscover surfaces older tracks from the current saved-library snapshot through MuseVault's reusable intelligence foundation. Rendering `/rediscover` reads PostgreSQL only. It makes no Spotify, ReccoBeats, enrichment, recommendation, or AI request.

## Candidate universe and consistency

The repository requires a completed authoritative full-library sync and takes the same per-user PostgreSQL advisory lock used by the dashboard. A running full sync returns `sync_in_progress`; a missing completed baseline returns `sync_required`; a completed zero-track baseline returns `empty_library`.

Only current `user_saved_tracks` rows are considered. A track becomes eligible at `saved_at <= evaluation_time - interval '90 days'`. Removed saved-library memberships are absent. If every eligible track has a bounded Rediscover Score of zero, the page returns `no_candidates`.

PostgreSQL performs membership filtering, recorded-play aggregation, latest-play lookup, latest-snapshot selection, component calculation, and initial score ordering. It returns at most 120 high-quality candidates. The application reranks that bounded pool for artist and album diversity and slices it into pages of 20. It never loads the whole library into Node and introduces no N+1 query.

## Persisted signals

For every eligible track, Rediscover v2 uses:

- saved timestamp and age;
- latest MuseVault-recorded play when one exists;
- MuseVault-recorded play counts in the last 7, 30, and 90 days;
- membership and rank in the latest captured `short_term`, `medium_term`, and `long_term` Spotify Top Track snapshots;
- availability of recorded-listening coverage and each affinity snapshot.

For each affinity range, the latest snapshot is selected by `snapshot_date DESC`, `captured_at DESC`, then snapshot ID descending. Historical snapshots are not combined. Rank stays a rank and is never presented as a play count.

## Rediscover Score v2

Rediscover Score answers: "How suitable is this track to surface again now?" The final integer is clamped to 0 through 100 and is not a percentage or a probability.

The model starts with one positive component and subtracts five pressure components:

| Component                     | Range | Behavior                                                                                   |
| ----------------------------- | ----: | ------------------------------------------------------------------------------------------ |
| Age relevance                 | 0-100 | Piecewise-linear between 25/35/50/65/78/90/100 at 90/180/365/730/1095/1825/2920 days.      |
| Recorded-recency pressure     |  0-38 | 38 within 7 days, 30 within 30, 18 within 90, 10 within 180, 4 when older, 0 when unknown. |
| Recorded-frequency pressure   |  0-30 | `6 * plays7d + 2 * plays30d + plays90d`, capped at 30.                                     |
| Short-term affinity pressure  |  0-34 | Rank-weighted 18-34 points when present in the latest captured snapshot.                   |
| Medium-term affinity pressure |  0-16 | Rank-weighted 8-16 points when present.                                                    |
| Long-term affinity pressure   |   0-7 | Rank-weighted 3-7 points when present, so an old long-term favorite remains viable.        |

Age interpolation uses whole saved-age days and integer half-up rounding, preserving every anchor while distinguishing tracks between them. It clamps eligible age relevance to 25 through 100. The nested play-count formula deliberately weighs recent events more heavily and cannot grow without bound. Affinity pressure maps captured ranks 1 through 50 between each documented maximum and minimum. Missing play history, a missing snapshot, or absence from a snapshot adds no Rediscover relevance.

### Difference from Rediscover v1

Rediscover v1 used a single unclamped heuristic, lifetime recorded-play count, and hard exclusion for a play within seven days or short-term affinity membership. It paginated the SQL order directly.

Rediscover v2 exposes independently testable bounded components, uses recent 7/30/90-day rotation, uses rank-aware pressure for all three latest affinity ranges, clamps the score to 0 through 100, separates Evidence Level and Vault Depth, and reranks a bounded pool for diversity. Strong recent activity can lower a score to zero instead of relying on a separate opaque exclusion rule.

## Vault Depth and Evidence Level

Vault Depth is an internal 0 through 100 measure of how deeply buried a track is in the saved library and available evidence. Its 0 through 70 library-age component now interpolates between its age anchors instead of using flat buckets. Known recorded inactivity contributes up to 15, and absence from affinity snapshots that actually exist contributes up to 15. Unknown listening history and missing snapshots add nothing. Vault Depth is not shown on the result cards and is not Rediscover Score.

Evidence Level is track-aware. Contextual evidence consists of recorded-listening coverage and availability of the three latest affinity snapshots. Direct evidence consists of a recorded play for this track or its presence in a captured short-, medium-, or long-term snapshot. Context alone is never `high`: no direct evidence with full context is `medium`, one direct family is at least `medium`, and multiple direct families can be `high`. Strong direct recorded-play or short-term evidence with adequate context can also be `high`. It does not alter relevance.

## Diversity and ordering

Candidate scoring finishes before diversity begins. The deterministic reranker considers both capped total repetition and the previous four selected tracks. Same-album adjacency receives particularly strong pressure, recently repeated primary artists receive strong pressure, and non-primary credited artists receive milder pressure. Near-equal scores favor local variety, while a material relevance lead still wins. Ties resolve by raw Rediscover Score and Spotify track ID.

The bounded pool is initially ordered by score descending, saved timestamp ascending, and track ID ascending. The complete pool receives one global reranked sequence before pages are sliced, so page boundaries preserve local diversity. Diversity changes final order and never changes the raw Rediscover Score. Credited artist IDs and names use persisted artist order.

## Explanations and UI

Each card shows a 0 through 100 Rediscover Score, Evidence Level, saved date, latest MuseVault-recorded play when known, and at most two structured reasons. Reasons are emitted only from supporting signals and ordered by information value: meaningful recorded-play recency, a longer-term to short-term affinity transition, direct medium/long-term affinity context, library age, then bare short-term absence as a low-evidence fallback. This avoids repeating a generic absence reason when richer track-specific evidence exists.

MuseVault does not have complete Spotify listening history. Unknown play history is not described as "never played," and Rediscover does not claim the listener forgot a track. The page explains the data boundary and labels provider evidence as captured Spotify affinity.

## Audio features and provider boundary

Energy, valence, tempo, danceability, acousticness, and instrumentalness describe sound rather than rediscovery readiness. They do not affect Rediscover Score, Vault Depth, or Evidence Level in Milestone 4G. Rediscover does not trigger ReccoBeats enrichment.

## Current limitations

Rediscover has no feedback, dismissal, impression, click, or history persistence; no randomization; no playlist generation or export; and no complete Spotify listening history. Results change only with persisted membership, listening history, affinity snapshots, or time boundaries. Milestone 4G adds no migration, environment variable, API key, provider, or Spotify scope. See the [intelligence foundation](intelligence.md) for the reusable semantics.
