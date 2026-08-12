# Track enrichment

MuseVault uses a small server-only provider abstraction for provider-derived audio characteristics. Milestone 4C configures **ReccoBeats** as the only provider. ReccoBeats currently requires no authentication, API key, paid plan, or credit card. MuseVault sends Spotify track identifiers only after the user explicitly starts enrichment; Spotify tokens are never sent to ReccoBeats.

The adapter conservatively processes at most 20 Spotify tracks per batch and three sequential batches per POST. It first resolves Spotify identifiers through `/v1/track`, then requests `/v1/audio-features` with ReccoBeats identifiers. Rows are joined by identity, never array position. MuseVault does not call ReccoBeats recommendations or audio-upload analysis.

## Persistence and caching

`track_audio_features` is global metadata keyed by track and provider, so one successful enrichment is reusable across users. It stores acousticness, danceability, energy, instrumentalness, liveness, loudness, speechiness, tempo, and valence. Tempo is the canonical value used for BPM display; BPM is not duplicated. Available rows are cached without automatic refresh. Confirmed catalog misses use `not_found` with a 30-day retry cooldown. Transient failures are recorded only on the bounded user run, not as permanent track misses.

Candidates are the distinct union of recorded plays, latest Top Track affinity, and current saved-library memberships. Recent plays are prioritized, then affinity, then saved tracks, with deterministic ordering and a maximum of 60 attempts per POST. Enrichment never creates saved-library memberships.

## Analytics and semantics

The Audio Profile reports current saved-library coverage and averages only across available features. Missing rows are not zeros. The recorded seven-day profile is play-event weighted: a track played ten times contributes ten events. Coverage remains bounded by MuseVault's recorded listening history and does not imply complete Spotify history.

Tempo display buckets are `< 90`, `90–119`, `120–139`, and `140+ BPM`. Provider features are numeric characteristics, not mood categories or user preferences. MuseVault does not classify tracks as happy or sad.

The server-only saved-library filter foundation supports bounded tempo, energy, valence, danceability, acousticness, and instrumentalness ranges for future MuseVault-owned smart playlists. Milestone 4C creates no playlist UI or playlists.

Enrichment is manual only. There are no background jobs, cron, workers, Spotify Audio Features calls, Spotify Recommendations calls, AI, audio downloads, or uploads. Provider catalog availability and derived values may be incomplete or inaccurate; coverage makes that limitation explicit.
