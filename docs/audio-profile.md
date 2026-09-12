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

## Explicit bulk enrichment

Audio Profile retains its one-batch action and also offers **Enrich all remaining**. Both begin only
after a user click. Bulk mode is orchestrated by the browser as an iterative loop:

1. read current persisted saved-library enrichment status;
2. send one normal saved-library-scoped enrichment POST;
3. read persisted status again;
4. wait 2 seconds after a successful batch before continuing.

**Refresh status** is separate from both enrichment actions. It performs only the authenticated,
database-only status GET and replaces the displayed coverage, eligibility, and cooldown values. A
refresh never starts or resumes the browser orchestrator and never sends an enrichment POST or
contacts Spotify or ReccoBeats. **Enrich next batch** and **Enrich all remaining** each remain an
explicit provider-backed intent, and neither is offered when the displayed saved-library eligible
count is zero.

Only one POST is active at a time. The server still uses the existing ReccoBeats adapter, at most 20
tracks per provider chunk, and at most three sequential chunks per POST. Each POST selects eligible
tracks from current saved membership; the initial library set is not frozen. Provider mapping,
normalization, global caching, and the 30-day cooldown remain bounded. An item enters that cooldown
only when it is omitted from two successful responses in the same explicit operation. Track lookup
and feature lookup each permit at most one sequential confirmation request containing only the
omitted subset. This is provider-availability evidence, not proof of permanent catalog absence.

Pause never aborts an active request. It lets that request finish and refreshes status, then prevents
the next batch. Resume reads fresh database status before doing more work, so it does not trust old
browser counters. A 429 or other provider/server failure stops the loop without automatic retries.
Two consecutive successful batches with no newly covered tracks, no newly confirmed misses, and no
reduction in current eligibility stop as `no_progress` rather than looping indefinitely.

Closing the tab or navigating away stops browser orchestration. There is no background worker,
queue, cron, Service Worker, Web Worker, or persisted orchestration state. Completed batches remain
in the global audio-feature cache, and an explicit later Resume naturally skips available rows and
respects twice-confirmed omission cooldowns. Cross-tab or distributed orchestration locking remains a
future production concern.

The database-only status endpoint reports current saved count, available coverage, coverage
percentage, currently eligible remaining count, and twice-confirmed provider omissions still
cooling down. “All currently eligible tracks have been processed” may still mean less than 100%
coverage because twice-confirmed provider omissions can remain in cooldown.

## Provider boundary and limitations

Normal Audio Profile rendering and enrichment-status GETs remain database-only. They never call
Spotify, ReccoBeats, a recommendation service, or AI. Only an explicit enrichment POST can reach the
provider.

Provider catalog coverage and values may be incomplete or inaccurate. A failed explicit attempt
does not create a missing cooldown or invalidate already cached features. A rate limit or provider,
network, JSON, or schema failure during confirmation stops enrichment without classifying the
unresolved subset. Valid features returned before a feature-confirmation failure remain cached.
Coverage can also change when the saved library changes, even if the global feature cache itself
does not.

The server-only coverage, distribution, distance, explanation, and bounded-ranking primitives are
intended for later reuse by Music Evolution, Personal Wrapped, smarter playlist intelligence, and
library comparison work. Those features are not part of Audio Profile v2.
