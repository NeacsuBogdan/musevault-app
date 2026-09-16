# Music Evolution Foundation

`/evolution` compares two equal rolling periods using only data MuseVault has already persisted. It
is a database-only server-rendered page: opening it does not call Spotify, ReccoBeats, enrichment,
a recommendation service, or AI. The foundation is intended for later weekly and monthly recaps,
"since MuseVault started tracking" summaries, and evidence-gated Personal Wrapped experiences.

## Captured-listening periods

Music Evolution does not claim complete Spotify listening history. Every listening result describes
captured listening, and the page keeps that limitation visible. For an injected anchor `now` and a
selected rolling period of 7, 30, or 90 days, the half-open windows are:

```text
current  = [now - periodDays, now)
previous = [now - 2 * periodDays, now - periodDays)
```

These are rolling durations, not calendar weeks or months. The shared boundary belongs only to the
current period, so there is no overlap or gap.

## Availability and Evidence Level

Directional comparison is unavailable when there is no captured history, no successful listening
sync, insufficient history for the full two-period span, a latest successful sync older than seven
days, or no captured events in either period. A single zero-event period remains a factual captured
zero once span and freshness are valid; its Evidence Level is Low.

Evidence Level never changes values, directions, deltas, or rankings. For a period length `D`, the
Medium active-day threshold is `max(2, ceil(D / 10))`; Medium also requires at least 10 captured
events in both periods. High requires at least 50 events and `max(5, ceil(D / 4))` active days in
both periods plus a successful sync no more than 48 hours old. Available comparisons below Medium
are Low.

## Listening, rotation, and artists

Listening Shift reports captured event count, unique tracks, all credited unique artists, active
UTC listening days, repeat intensity, top-five track concentration, and top-five primary-artist
concentration for both periods. Each measure returns an absolute delta. Percentage change is absent
when the previous value is zero.

Rotation Movement aggregates captured events by track. Artist Movement assigns every event to the
primary credited artist at position `0`, so collaborations do not multiply event counts. Entering
and leaving mean presence in only one captured period. Persistent tracks or artists rise at a delta
of at least `+2` and fall at `-2` or below when the previous count was at least two. Each list is
capped at five with deterministic count and ID tie-breaking. These are captured-rotation facts, not
claims about discovery, abandonment, intent, or Spotify affinity. Top-item snapshots are not used.

## Current-library additions

The page reports only **currently saved tracks added during this period**, using current
`user_saved_tracks` memberships and their `saved_at` timestamps. Full synchronization deletes
removed memberships, so MuseVault cannot call this complete historical additions, library growth,
net change, or removal history. Example lists are capped at five and ordered by saved timestamp
descending, then track ID.

## Captured Listening Sound Center

Each captured play whose cached ReccoBeats row contains all seven bounded measurements contributes
once to its period's arithmetic center. Repeated plays therefore receive repeated weight. The
dimensions are acousticness, danceability, energy, instrumentalness, liveness, speechiness, and
valence. Missing rows are excluded without imputation; tempo and loudness do not enter movement.

Both periods need at least 20 covered events, 10 covered unique tracks, three active captured days,
and 50% event-weighted audio coverage. Sound availability and its event/unique-track coverage are
separate from general Evidence Level. When available, Sound Movement is:

```text
round(clamp(sqrt(sum((currentCenter_i - previousCenter_i)^2) / 7) * 100, 0, 100))
```

The three largest absolute dimension shifts use Audio Profile's fixed factual tie order. They say a
measurement is higher or lower and do not infer mood, genre, personality, or quality.

## Architecture and future reuse

The server-only `lib/music-evolution` modules separate period contracts, availability/evidence,
metric and sound calculations, bounded PostgreSQL aggregation, and orchestration. Raw play history
is not loaded into application memory. Movement lists and current-membership examples are limited in
SQL, and unavailable comparisons skip directional queries. The feature adds no persistence, table,
migration, environment variable, provider request, job, cron, queue, or worker.

As captured history grows, 30-day and 90-day comparisons become available naturally. A future
calendar-year Wrapped must additionally prove that MuseVault covered the relevant year boundaries;
otherwise it must describe the actual captured interval instead of claiming a complete annual
Wrapped.
