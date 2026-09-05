# Spotify playlist export

Milestone 4F adds an explicit export action to successful, non-empty Smart Playlist previews. Export creates a new Spotify playlist with `public:false`; generating or viewing a preview never creates a playlist or contacts Spotify. No export history or Smart Playlist definitions are persisted in MuseVault.

## User interaction and optional permission

At `/smart-playlists`, generate a preset or custom preview, review the result, and choose **Create playlist on Spotify**. MuseVault asks Spotify not to publish the playlist publicly. Spotify manages true private access separately in its app, and anyone with the link can access the playlist until the user changes that setting in Spotify. The form supplies a sensible default name, such as `MuseVault — High Energy` or `MuseVault — Smart Playlist`. The server trims names and requires 1–100 characters without control characters. The generated description is fixed: `Created with MuseVault from your saved Spotify library.`

Export requires only one additional OAuth scope: `playlist-modify-private`. It is an optional capability, requested by the **Reconnect Spotify to enable export** action through the existing Authorization Code/PKCE flow. Ordinary authentication still requires only the existing read scopes. A user without export permission can continue using `/dashboard`, `/library`, `/listening`, `/audio-profile`, `/rediscover`, and `/smart-playlists`.

The granted scope is stored in the existing `spotify_connections` scope storage. Reauthorization preserves the existing MuseVault user and library, listening, analytics, audio-feature, and sync data. The OAuth flow retains a validated local Smart Playlist return path where practical; external or malformed destinations are rejected. Reauthorization never automatically submits an export.

The submit control is disabled while working, with an immediate in-flight guard against rapid duplicate submissions. Success displays the confirmed number of tracks and a validated **Open in Spotify** link without navigating automatically. Another deliberate submission after completion creates another playlist.

## Authenticated export flow

The browser sends `POST /api/spotify/playlists` with a playlist name and the recognized GET definition parameters, including a preset identity where applicable. Custom audio percentages retain the same input representation as the preview builder. Arbitrary track IDs and unknown export fields are rejected.

The server:

1. Requires an authenticated MuseVault session and validates the same-origin write request.
2. Validates the JSON body, bounded playlist name, and Smart Playlist definition with the existing strict parser.
3. Checks the stored optional `playlist-modify-private` capability.
4. Regenerates the preview through the existing server-only PostgreSQL Smart Playlist repository for the authenticated user.
5. Rejects an unavailable, empty, or no-match preview before contacting Spotify.
6. Obtains a valid Spotify access token through the existing token refresh architecture.
7. Creates the playlist with `public:false` and validates the external response.
8. Adds the authoritative track URIs in precisely the regenerated preview order.
9. Returns a safe structured success, error, or partial-failure result.

The authoritative definition is resolved again against current saved-library membership and cached audio-feature availability, including existing full-sync prerequisites. The same filter, sort, tie-breaking, and limit rules apply. If database data changed since the page was rendered, export reflects the current regenerated result. The browser cannot supply the final track list. The existing limits remain 20, 30, and 50, so one add-items request is sufficient.

## Current Spotify endpoints

The server-only Spotify client uses:

| Operation                   | Endpoint                                                        | Request body                                           |
| --------------------------- | --------------------------------------------------------------- | ------------------------------------------------------ |
| Create unpublished playlist | `POST https://api.spotify.com/v1/me/playlists`                  | Validated `name`, fixed `description`, `public: false` |
| Add ordered items           | `POST https://api.spotify.com/v1/playlists/{playlist_id}/items` | `{ "uris": ["spotify:track:…", "spotify:track:…"] }`   |

Endpoint references: Spotify's [Create Playlist](https://developer.spotify.com/documentation/web-api/reference/create-playlist) and [Add Items to Playlist](https://developer.spotify.com/documentation/web-api/reference/add-items-to-playlist).

The legacy create route under `/users/{user_id}/playlists` and add-tracks route ending in `/tracks` are not used. Spotify playlist identifiers and URLs are validated before use or return to the browser. Access tokens, refresh tokens, authorization headers, raw Spotify error bodies, and account identifiers are not exposed through export results or diagnostics.

Spotify's Web API `public` attribute controls publication on the owner's public profile and in search results. `public:false` does not provide access control. MuseVault does not currently control Spotify client-level private access; users can change playlist access in Spotify itself. See Spotify's [playlist concepts](https://developer.spotify.com/documentation/web-api/concepts/playlists) for this distinction.

## Failure and retry behavior

Playlist creation and adding items are separate remote operations. They cannot be made transactionally atomic.

- An explicit Spotify `401` can trigger the existing refresh-token flow and one safe retry of the rejected operation with the refreshed access token. At most one forced refresh is allowed across the entire export, including both creation and adding items.
- A Spotify `429` is returned as a safe rate-limit state with validated `Retry-After` information when available. It is not retried automatically.
- Network failures, ambiguous responses, and server errors never cause an automatic replay that could create a duplicate playlist or add duplicate tracks. An uncertain result asks the user to inspect Spotify before exporting again.
- If creation fails, add-items is not attempted.
- If Spotify creates the playlist but reports `public: true`, MuseVault returns a distinct partial failure with the validated playlist link and does not add tracks, retry creation, or request the public-playlist scope.
- If creation succeeds but add-items fails or cannot be confirmed, the response has a distinct `partial_failure` state and retains the validated created playlist link. The UI explains: the playlist was created, but MuseVault could not confirm that all preview tracks were added. This is not reported as full success. No automatic recreation, ambiguous add-items resend, or cleanup call follows.

## Boundaries

Preview and export resolution use PostgreSQL and cached audio features only. They never call ReccoBeats or trigger enrichment. The only new external operations are the explicit Spotify playlist writes; existing OAuth and token refresh remain the authentication mechanism.

MuseVault does not request `public:true`, create collaborative playlists, or control client-level playlist access. There are no playlist import/read/edit operations, playlist synchronization, scheduled updates, background jobs, saved definitions, or export history. This milestone adds no migration, changes to migrations 0000–0004 or Drizzle metadata, environment variables, secrets, API keys, providers, or paid services. It does not add Rediscover scores, listening or affinity weighting, randomization, recommendations, genres, mood labels, or AI.
