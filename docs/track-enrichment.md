# Track enrichment

MuseVault uses a small server-only provider abstraction for provider-derived audio characteristics. Milestone 4C configures **ReccoBeats** as the only provider. ReccoBeats currently requires no authentication, API key, paid plan, or credit card. MuseVault sends Spotify track identifiers only after the user explicitly starts enrichment; Spotify tokens are never sent to ReccoBeats.

The adapter conservatively processes at most 20 Spotify tracks per normal chunk and three
sequential normal chunks per POST. It first resolves Spotify identifiers through `/v1/track`, then
requests `/v1/audio-features` with ReccoBeats identifiers. Rows are joined by identity, never array
position. MuseVault does not call ReccoBeats recommendations or audio-upload analysis.

If a successful track-resolution response omits requested Spotify IDs, the adapter makes exactly
one sequential confirmation request containing only those omitted IDs and merges any recovered
mappings. It applies the same rule when a successful audio-feature response omits resolved provider
IDs: exactly one confirmation request contains only the omitted subset, and any recovered features
are merged without fabrication. There is no third attempt, parallel request, retry loop, or
exponential retry machinery. This bounded confirmation adds provider traffic only when a successful
response contains omissions.

## Persistence and caching

`track_audio_features` is global metadata keyed by track and provider, so one successful enrichment
is reusable across users. It stores acousticness, danceability, energy, instrumentalness, liveness,
loudness, speechiness, tempo, and valence. Tempo is the canonical value used for BPM display; BPM is
not duplicated. Available rows are cached without automatic refresh. `not_found` with a 30-day
retry cooldown now means ReccoBeats omitted the same requested item from two successful bounded
responses in one explicit enrichment operation. It is provider-availability evidence, not proof of
permanent catalog absence.

A rate limit, network failure, unsuccessful HTTP response, invalid JSON, or schema-invalid response
at either normal or confirmation stage stops the operation under the existing provider-error
semantics and never creates `not_found`. If an audio-feature confirmation fails after the first
successful response returned valid features for other tracks, those valid features are still cached;
the unresolved tracks receive no missing row.

Candidates are the distinct union of recorded plays, latest Top Track affinity, and current saved-library memberships. Recent plays are prioritized, then affinity, then saved tracks, with deterministic ordering and a maximum of 60 attempts per POST. Enrichment never creates saved-library memberships.

The Audio Profile bulk action uses a saved-library candidate scope on the same server enrichment
implementation. Each POST re-reads current membership and selects at most 60 tracks that have no
provider row or whose twice-confirmed omission cooldown has expired. The original one-batch action retains
the existing union and priority behavior. Client requests never supply authoritative track IDs.

## Browser orchestration

“Enrich all remaining” is an explicit, in-page loop rather than a large request or background job.
The browser reads a database-only status endpoint, sends one bounded POST, refreshes status, waits 2
seconds, and repeats sequentially. Pause finishes the active POST before stopping; Resume reads
fresh database truth first. Rate limits and provider/server errors stop without automatic retry, and
two consecutive successful requests with no meaningful progress stop the loop safely.

**Refresh status** is a separate database-only action. It performs the authenticated status GET and
replaces the displayed coverage, eligibility, and cooldown counts. It never starts or resumes the
orchestrator, sends an enrichment POST, or contacts Spotify or ReccoBeats. **Enrich next batch** and
**Enrich all remaining** remain unmistakably provider-backed actions and are available only when
the displayed saved-library status has eligible work.

Navigating away or closing the tab stops orchestration. Already completed provider chunks remain
persisted. Completion means no saved tracks are currently eligible, not necessarily that every saved
track has features: twice-confirmed provider omissions may still be cooling down. There is no persisted run controller,
queue, worker, cron, unload continuation, or distributed lock in this milestone.

## Analytics and semantics

Audio Profile v2 defines its universe as current saved-library membership intersected with available
cached ReccoBeats rows. Cached rows for tracks no longer saved are excluded. PostgreSQL calculates
p25, median, and p75 values without treating missing measurements as zero. The profile no longer
mixes its saved-library sound description with recorded-listening event weights.

Seven bounded characteristics display as percentages. Tempo remains in BPM and loudness in dB.
Provider features are numeric characteristics, not mood categories or user preferences. MuseVault
does not classify tracks as happy or sad. See [Audio Profile v2](audio-profile.md) for coverage
thresholds, Sound Center, Sound Distance, ranking bounds, and empty states.

The server-only saved-library filter foundation supports bounded tempo, energy, valence, danceability, acousticness, and instrumentalness ranges for future MuseVault-owned smart playlists. Milestone 4C creates no playlist UI or playlists.

Enrichment is manual only. There are no background jobs, cron, workers, Spotify Audio Features calls, Spotify Recommendations calls, AI, audio downloads, or uploads. Provider catalog availability and derived values may be incomplete or inaccurate; coverage makes that limitation explicit.
