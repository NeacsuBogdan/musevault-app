# MuseVault intelligence foundation

MuseVault intelligence turns persisted library, recorded-listening, and captured-affinity facts into deterministic product features. It does not call Spotify, ReccoBeats, a recommendation service, or an AI model while ranking. Rediscover v2 is the first consumer of this foundation.

## Signals and scores

A signal is a fact MuseVault can name and preserve independently of an algorithm. The current Rediscover signals are:

- the saved timestamp and saved age in whole days;
- the latest MuseVault-recorded play and its age in whole days;
- MuseVault-recorded play counts over nested 7, 30, and 90-day windows;
- rank in the latest captured Spotify `short_term`, `medium_term`, and `long_term` Top Track snapshot;
- whether a snapshot exists for each affinity range;
- whether MuseVault has a completed listening sync and recent recorded events.

Spotify affinity rank remains a rank. MuseVault never converts it into a listening count. Audio-feature availability may be useful for future sound or mood features, but energy, valence, tempo, danceability, acousticness, and instrumentalness say nothing about whether a track is ready to surface again. They do not affect Rediscover relevance.

A score combines signals for one named purpose. Each component declares its range and remains independently testable. Missing data contributes zero pressure and zero positive relevance. It never receives an inactivity bonus.

## Relevance and evidence

Rediscover Score answers: "How suitable is this track to surface again now?" It is a bounded integer from 0 to 100. It is not a probability and does not claim the listener forgot a track.

Its age relevance is piecewise-linear between documented 90, 180, 365, 730, 1095, 1825, and 2920-day anchors. Integer half-up rounding makes the result stable while avoiding broad flat buckets. Recorded-recency, recorded-frequency, and short/medium/long affinity pressure remain separate bounded components.

Evidence Level answers: "How much persisted listening and affinity evidence supports the interpretation?" It is separate from relevance:

- `low`: evidence is almost entirely library age, with at most limited context and no direct track evidence;
- `medium`: meaningful contextual coverage or one direct per-track evidence family exists;
- `high`: multiple direct per-track evidence families exist, or recorded-play/short-term direct evidence has adequate context.

Contextual evidence means MuseVault has recorded-listening coverage or a captured snapshot for an affinity range. Direct evidence means this track has a MuseVault-recorded play or appears in a captured short-, medium-, or long-term snapshot. Absence from an existing snapshot is useful context, but it is not direct track evidence. Even complete contextual coverage without direct evidence is at most `medium`.

Evidence Level controls when low-information fallback explanations are appropriate. It never raises Rediscover Score.

## Missing data

MuseVault does not have complete Spotify listening history. Spotify's recently played feed is a bounded provider window, and MuseVault only knows events it persisted. Therefore:

- no persisted play means the latest recorded play is unknown;
- no captured affinity snapshot means affinity for that range is unknown;
- absence from an existing latest snapshot is a captured fact, distinct from a missing snapshot;
- no audio-feature row means the audio characteristics are unknown.

User-facing text scopes claims to "MuseVault-recorded" listening and "captured Spotify affinity." It does not claim a track was never played or that the listener forgot it.

## Reusable primitives

The server-only module at `apps/web/src/lib/intelligence/` provides:

- explicit Rediscover signal collection;
- bounded score components;
- Evidence Level calculation;
- Vault Depth calculation;
- structured, source-labelled explanation reasons;
- deterministic diversity reranking over a bounded candidate pool.

The types are music-domain types rather than a generic rules engine. Future Listening Intelligence, Audio Profile, Music Evolution, Personal Wrapped, and personalized Smart Playlist work can reuse the evidence, bounded-component, explanation, and reranking semantics without importing Rediscover UI code.

## Vault Depth

Vault Depth answers: "How deeply buried is this track in the saved library and available evidence?" It is an internal bounded 0 to 100 signal and is intentionally separate from Rediscover Score.

Its components are:

| Component                 | Range | Meaning                                                                               |
| ------------------------- | ----: | ------------------------------------------------------------------------------------- |
| Library age depth         |  0-70 | Older current saves interpolate smoothly between the same age-day anchors.            |
| Recorded inactivity depth |  0-15 | Added only when an actual latest recorded play and recorded-listening coverage exist. |
| Captured affinity depth   |  0-15 | Added only for absence from affinity ranges whose latest snapshots actually exist.    |

Missing play history or missing snapshots add no depth. The number remains internal in Milestone 4G because exposing another score on each result would add more detail than the decision needs.

## Deterministic diversity

Rediscover first calculates relevance. PostgreSQL then returns at most 120 candidates ordered by Rediscover Score, saved timestamp, and track ID. Node reranks only that bounded pool.

At each selection step, the reranker considers both total prior occurrences and the previous four selections. Same-album adjacency receives the strongest local pressure. A recently repeated primary artist also receives strong pressure, while repeated non-primary credited artists receive only a mild penalty so collaborations are not punished heavily. Near-equal scores favor local variety; a material relevance lead still wins. Equal adjusted values resolve by raw score and then track ID.

The full bounded pool receives one global order before pagination. Page slicing never reranks a page independently, so the boundary between pages follows the same local-diversity sequence. Diversity changes ordering only; it does not change Rediscover Score. The same input always produces the same order. There is no random value, shuffle, or provider request.

## Current limits

The foundation uses only current persisted evidence. It has no impression, dismissal, click, or feedback history and does not infer complete listening behavior. The 120-track pool bounds application memory and means Rediscover presents the highest-quality bounded selection rather than reranking an entire large library in Node. No schema migration, environment variable, API key, OAuth scope, or external provider was added for Milestone 4G.
