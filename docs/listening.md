# Listening intelligence

The `/listening` page is a database-only view of events MuseVault successfully captured. It does
not represent complete Spotify listening history, lifetime listening, or exact Spotify stream
counts. Coverage starts at the earliest persisted event, and gaps between manual syncs remain
unknown. Rendering never contacts Spotify, ReccoBeats, a recommendation API, or an AI model; the
existing explicit sync action is the only provider-reading path initiated from this page.

## Deterministic windows

Every calculation receives one `now` value. PostgreSQL binds it once through
`select ${now}::timestamptz as now_at` and performs interval arithmetic only against that typed
anchor. Tests can inject a fixed value.

The windows are half-open:

- current 7 days: `[now - 7 days, now)`;
- previous 7 days: `[now - 14 days, now - 7 days)`;
- current 30 days: `[now - 30 days, now)`.

The inclusive lower and exclusive upper boundaries ensure an event cannot belong to both comparison
weeks. Events at `now` are excluded until they are earlier than a later anchor.

## Rotation Score

Rotation Score answers: “How strongly does this track appear in MuseVault's recent recorded
rotation?” It is an integer from 0 to 100, not Spotify popularity, lifetime affinity, a stream count,
or a recommendation probability. Its candidate universe is catalog tracks with at least one
MuseVault-recorded event in the current 30-day window. A track does not need to remain saved because
recorded history references the persisted catalog and can be rendered without invented metadata.

The score adds three independently bounded piecewise-linear components:

| Component        | Range | Anchors                                                               |
| ---------------- | ----: | --------------------------------------------------------------------- |
| Recency          |  0–55 | elapsed days `0→55`, `1→52`, `3→46`, `7→36`, `14→24`, `30→0`          |
| 30-day frequency |  0–25 | recorded events `0→0`, `1→5`, `2→9`, `3→12`, `5→16`, `8→20`, `12+→25` |
| 7-day frequency  |  0–20 | recorded events `0→0`, `1→5`, `2→9`, `3→12`, `5→16`, `8+→20`          |

Interpolation and rounding are deterministic, every component is clamped, and the sum is clamped
to `0..100`. Missing data contributes no positive points. PostgreSQL applies the same model before
returning only the top ten rows, ordered by score, current-7 count, current-30 count, latest event,
and track ID.

Evidence Level remains separate. One direct event is Low; repeated track evidence is Medium; High
requires at least six current-30 events spread across at least three UTC event dates. Long global
coverage alone cannot make a track High evidence. Each rotation item may show one deterministic
explanation backed by recorded frequency, latest-event time, or distinct active dates.

## Listening Pulse

Listening Pulse reports current-7 and current-30 recorded event totals plus unique tracks, unique
credited artists, the recorded coverage start, and the latest successful listening refresh. Event
totals are aggregated before artist joins, so collaborations do not inflate play-event counts.

Repeat Intensity is the share of current-30 events belonging to tracks that each have at least two
events in that same window. Top-track concentration is the share represented by the five tracks
with the most current-30 events. Top-artist concentration applies the equivalent top-five measure
using only the primary artist at credit position `0`; this gives each event one artist for the
metric. When the current-30 denominator is empty, these percentages are unavailable (`—`), not
fabricated as `0%`.

## Coverage, refreshes, and event timestamps

These timestamps answer different questions:

- recorded coverage start is the earliest play event MuseVault persisted;
- latest successful listening refresh is the newest `completed_at` from a listening sync whose
  persisted status is `completed`;
- captured event timestamps say when the individual persisted plays occurred.

The latest event is not used as a substitute for sync freshness. A successful refresh inside the
half-open current-7 window, including its lower boundary, produces `refreshed_within_current7`. An
older successful refresh produces `stale_for_current7`, and no successful refresh produces
`never_synced`. Failed and running syncs do not count. This describes MuseVault capture freshness,
not continuous Spotify observation.

## Recorded Momentum

Recorded Momentum compares primary-artist event counts in current 7 days with the previous equal
7-day window. Increased presence requires a delta of at least `+2`. Decreased presence requires a
delta of at most `-2` and at least two events in the previous window. Each direction returns at most
five artists with deterministic count and artist-ID tie-breakers.

MuseVault presents a normal comparison only when recorded coverage began at least 14 days before the
injected anchor and a successful listening refresh completed during current 7 days. Insufficient
coverage keeps the history state; stale capture instead asks for a manual refresh and exposes no
directional artist claims. Once both gates pass, no qualifying movement is a valid empty result.
A recent successful refresh with zero current-7 events remains a factual recorded zero and may
participate in comparison semantics. Every state retains the incomplete-history disclosure.

## Affinity and future reuse

The newest captured Spotify `short_term`, `medium_term`, and `long_term` track and artist ranks remain
a separate signal family. Rank is never reinterpreted as a play count and does not affect Rotation
Score.

The listening-window, bounded score, evidence, pulse, concentration, and momentum primitives can be
reused by future Music Evolution, Personal Wrapped, Smart Playlist intelligence, and dashboard
insights. Those features are not implemented here. No schema migration, background sync, provider,
OAuth scope, environment variable, or export behavior is added.
