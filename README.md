# MuseVault

MuseVault is a personal music-discovery application that connects to Spotify, reads a listener's
saved tracks, and will eventually use that library as the basis for independent music suggestions.

The current Next.js App Router application provides secure Spotify connection, a protected
saved-tracks library, conservative incremental synchronization with automatic full reconciliation,
access-token refresh, logout, an authenticated dashboard at `/dashboard`, Listening Intelligence v2
at `/listening`, coverage-aware Audio Profile v2 sound intelligence at `/audio-profile`, and a Neon
database foundation.
Audio Profile offers explicit single-batch enrichment and browser-orchestrated “Enrich all
remaining” processing. Bulk mode sends one bounded server POST at a time, persists every completed
batch, and stops when the user pauses, the tab closes, eligible work ends, progress stalls, or the
provider reports a failure or rate limit.
The separate **Refresh status** action performs only an authenticated, database-only GET. It updates
coverage, eligibility, and cooldown counts without starting or resuming enrichment; provider-backed
single-batch and bulk work always require their own explicit action.
Within each normal provider chunk, MuseVault confirms only omitted Spotify mappings and audio
features with one additional request for that omitted subset. A 30-day cooldown is applied only
after the same item is omitted from two successful responses in the explicit operation; this is
provider-availability evidence, not proof of permanent catalog absence. Confirmation failures and
rate limits stop enrichment without creating missing cooldowns.
The listening page uses exact database windows for Listening Pulse, a bounded Rotation Score, and
primary-artist Recorded Momentum while keeping captured Spotify affinity separate. The dashboard
uses the complete latest synchronized PostgreSQL library snapshot for its real library overview and
saved-library analytics;
the database-backed Rediscover v2 feature at `/rediscover` uses bounded score components, separate
evidence semantics, and deterministic artist/album diversity to rank older current saves using only
recorded MuseVault listening and latest captured Spotify affinity. MuseVault generates deterministic
Smart Playlist previews from cached saved-library data and can export them to new Spotify playlists
without public profile/search publication after an explicit user action and optional export
authorization. See the
[database foundation](docs/database-foundation.md), [dashboard data guide](docs/dashboard-data.md),
[listening capture guide](docs/listening-intelligence.md),
[Listening Intelligence v2 guide](docs/listening.md),
[Audio Profile v2 guide](docs/audio-profile.md),
[track enrichment guide](docs/track-enrichment.md),
[intelligence foundation](docs/intelligence.md),
[Rediscover guide](docs/rediscover.md),
[Smart Playlists guide](docs/smart-playlists.md),
[Spotify playlist export guide](docs/spotify-playlist-export.md),
and [MuseVault design system](docs/design-system.md) for details.

## Repository structure

```text
apps/web/          Next.js App Router application
packages/config/   Reserved shared configuration package
packages/shared/   Reserved shared domain package
packages/ui/       Reserved shared UI package
docs/              Architecture and operating notes
```

The packages under `packages/` are placeholders; current application code remains inside
`apps/web`.

## Requirements

- Node.js 22
- pnpm 10
- A Spotify Developer application
- Spotify Premium on the owner account while the application is in Development Mode
- A Neon development branch with pooled and direct connection strings

## Local installation

Install dependencies from the repository root:

```bash
pnpm install
```

Copy the environment template without committing the resulting local file:

```bash
cp apps/web/.env.example apps/web/.env.local
```

On PowerShell:

```powershell
Copy-Item apps/web/.env.example apps/web/.env.local
```

Fill in the server-only Spotify, session, database, and token-encryption values. Apply the generated
development migration, then start the web application:

```bash
pnpm db:migrate
```

```bash
pnpm --filter @musevault/web dev
```

Open `http://127.0.0.1:3000`. Use this host exactly; Spotify does not accept `localhost` as a
redirect URI. After connecting Spotify, the authenticated dashboard is available at
`http://127.0.0.1:3000/dashboard`.

## Environment variables

`apps/web/.env.local` must provide:

| Variable                       | Purpose                                                             |
| ------------------------------ | ------------------------------------------------------------------- |
| `APP_URL`                      | Canonical application origin, locally `http://127.0.0.1:3000`       |
| `SPOTIFY_CLIENT_ID`            | Client ID from the Spotify Developer Dashboard                      |
| `SPOTIFY_CLIENT_SECRET`        | Server-only Spotify client secret                                   |
| `SPOTIFY_REDIRECT_URI`         | Exact registered OAuth callback URL                                 |
| `SESSION_SECRET`               | At least 32 random characters used to derive the JWE encryption key |
| `DATABASE_URL`                 | Pooled Neon development connection for application queries          |
| `DATABASE_MIGRATION_URL`       | Direct Neon development connection for Drizzle Kit migrations       |
| `SPOTIFY_TOKEN_ENCRYPTION_KEY` | Base64url encoding of exactly 32 random bytes                       |

No secret uses a `NEXT_PUBLIC_` prefix. Environment values are validated only when an
authentication runtime path needs them, so compilation and secretless CI remain possible.

## Spotify Dashboard configuration

Create or open the application in the Spotify Developer Dashboard and register this exact local
redirect URI:

```text
http://127.0.0.1:3000/api/auth/spotify/callback
```

Production must use the matching HTTPS callback for its deployed origin. Ordinary MuseVault
authorization requests the `user-library-read user-read-private user-read-recently-played user-top-read`
scopes. Exporting a playlist without publishing it publicly requires the optional
`playlist-modify-private` scope, requested through the export reconnect action. Existing read access
and Smart Playlist previews remain available without export permission.

Spotify Development Mode is intended for development and personal projects. New applications
currently require the owner to have Spotify Premium, allow no more than five authorized users, and
have restricted Web API access. In particular, MuseVault does not rely on Recommendations, Related
Artists, Audio Features, or Audio Analysis endpoints.

## Authentication model

- Authorization Code flow with PKCE (`S256`) and OAuth `state` validation.
- Short-lived HttpOnly cookies hold the state and PKCE verifier.
- The access token and a temporary refresh-token copy remain in the encrypted HttpOnly JWE session.
- A separately encrypted refresh token and the granted scopes persist in Neon after OAuth.
- Client Components and public API responses never receive access or refresh tokens.
- Access tokens refresh shortly before expiry and once after an unexpected Spotify `401`.
- Spotify `account_id`, not the legacy profile `id`, is the stable account identifier.

The database stores the user, persistent Spotify connection, and a normalized full-library
snapshot. The dashboard reads that persisted snapshot without calling Spotify during rendering. See the
[database foundation](docs/database-foundation.md) and
[full library synchronization](docs/full-library-sync.md) and
[incremental library synchronization](docs/incremental-library-sync.md) for the schema, migration
workflow, bounded protocols, snapshot guarantees, and limitations.
Concurrent request-time refreshes remain deduplicated within one server process.

## Spotify playlist export

After generating a non-empty preview at `/smart-playlists`, choose a playlist name and press
**Create playlist on Spotify**. MuseVault regenerates the definition from the authenticated user's
current PostgreSQL saved library, then creates the playlist using `POST /v1/me/playlists` with
`public:false` and adds the ordered tracks using `POST /v1/playlists/{playlist_id}/items`. In Spotify
Web API terms, this keeps the playlist off the user's public profile and search results. It does not
provide access control: Spotify manages link access and true private access in its own clients.
Users can change playlist access in Spotify itself. The browser supplies a definition, never the
authoritative track IDs. Preview rendering remains database-only, and export does not request
provider data or trigger audio-feature enrichment.

If adding tracks fails after playlist creation, MuseVault reports a distinct partial failure and
retains a validated Spotify link for inspection. Ambiguous writes are not automatically retried.
There is no export history or definition persistence, automatic refresh, or playlist synchronization.
See the [export guide](docs/spotify-playlist-export.md) for scope, validation, and failure behavior.

## Database commands

Run these from the repository root against the configured Neon development branch:

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:studio
```

Generate and commit SQL migrations from the Drizzle schema; do not use `drizzle-kit push` as the
normal workflow.

## Development commands

Run these from the repository root:

```bash
pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm db:generate
pnpm db:migrate
```

The web typecheck runs `next typegen` before TypeScript so clean checkouts have current App Router
route declarations.

## Commit standards

MuseVault uses Conventional Commits. Commitlint validates commit messages, and the pre-commit hook
runs lint-staged with ESLint and Prettier.
