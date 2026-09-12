# Audio Profile v2

Audio Profile v2 turns cached, provider-derived audio measurements into coverage-aware sound
intelligence for the current saved library. Normal `/audio-profile` rendering reads PostgreSQL
only. It does not call Spotify, ReccoBeats, a recommendation service, or an AI model.

## Data universe and coverage

The profile universe is the intersection of:

1. the user's current rows in `user_saved_tracks`; and
2. `track_audio_features` rows whose provider is `reccobeats` and whose status is `available`.

Cached features for tracks that are no longer saved do not enter counts, percentiles, Sound Center,
or rankings. Coverage is `audioCoveredTrackCount / currentSavedTrackCount`; a zero-track library has
no percentage denominator.

Profile availability is based on the covered-track count:

| State               | Covered saved tracks | Product behavior                                      |
| ------------------- | -------------------: | ----------------------------------------------------- |
| `NO_DATA`           |                    0 | Show the empty coverage state.                        |
| `LIMITED_SAMPLE`    |                 1–19 | Show coverage and the sample limitation, no rankings. |
| `PROFILE_AVAILABLE` |                  20+ | Show Sound Center, distributions, and eligible lists. |

Coverage Quality is separate from availability:

- `LOW` when fewer than 50 tracks are covered or exact coverage is below 20%;
- `HIGH` when at least 200 tracks are covered and exact coverage is at least 60%;
- `MEDIUM` when at least 50 tracks and 20% coverage are reached without meeting both High
  thresholds.

An available profile with Low coverage remains visible and carries this disclosure: “This profile
is based on the enriched portion of your saved library and may not represent the full library yet.”

## Sound Center and distributions

Sound Center is the median profile of the covered current saved sample. PostgreSQL uses
`percentile_cont` to calculate the 25th, 50th, and 75th percentiles independently for:

- acousticness;
- danceability;
- energy;
- instrumentalness;
- liveness;
- speechiness;
- valence;
- tempo;
- loudness.

Null measurements are excluded for their own characteristic and are never replaced with zero. The
seven bounded characteristics display as percentages. Tempo remains in BPM and loudness remains in
dB. Sound Center describes measurements; it is not a score and does not classify mood, genre,
preference, personality, or listening behavior.

## Sound Distance

Sound Distance is the only new branded metric. A track is eligible only when all seven bounded
measurements are present and the profile has at least 20 covered saved tracks. Tempo and loudness do
not enter this calculation.

For track values `xi` and corresponding Sound Center medians `mi`:

```text
round(clamp(sqrt(sum((xi - mi)^2) / 7) * 100, 0, 100))
```

All seven dimensions have equal weight and keep their stored 0–1 scale. A missing value makes the
track ineligible; there is no imputation or alternate rescaling.

Sonic Outliers returns at most 10 eligible tracks ordered by Sound Distance descending and track ID
ascending. Each explanation reports at most two largest absolute feature deviations. Equal
deviations resolve in this fixed order: energy, valence, danceability, acousticness,
instrumentalness, liveness, speechiness.

Closest to Sound Center returns at most 5 eligible tracks ordered by Sound Distance ascending and
track ID ascending. Both lists remain factual comparisons with the median profile, not
recommendations or judgments about a listener.

## Query architecture

Two bounded SQL statements support the profile:

- a current-saved CTE computes membership counts, complete-row eligibility, and all 27 percentile
  values;
- a second current-saved CTE computes the seven-feature RMS expression, orders both lists, and caps
  them before joining track, album, artwork, and credited-artist metadata.

The second query runs only for an available profile whose seven center medians exist. Node receives
at most 15 ranked rows and adds the two deterministic deviation reasons. The repository also reads
one latest enrichment-run row for status disclosure. There is no whole-library feature load and no
per-track query.

## Enrichment boundary and limitations

Enrichment remains an explicit user action. The existing ReccoBeats adapter, 20-track provider
batch size, three-batch POST limit, candidate priorities, global cache, and 30-day confirmed-miss
cooldown are unchanged. The page does not enrich automatically.

Provider catalog coverage and values may be incomplete or inaccurate. A failed explicit attempt
does not invalidate already cached features. Coverage can also change when the saved library changes,
even if the global feature cache itself does not.

The server-only coverage, distribution, distance, explanation, and bounded-ranking primitives are
intended for later reuse by Music Evolution, Personal Wrapped, smarter playlist intelligence, and
library comparison work. Those features are not part of Audio Profile v2.
