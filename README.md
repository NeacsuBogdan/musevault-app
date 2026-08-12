# MuseVault

MuseVault is a personal music-discovery application that connects to Spotify, reads a listener's
saved tracks, and will eventually use that library as the basis for independent music suggestions.

The current Next.js App Router application provides secure Spotify connection, a protected
saved-tracks library, conservative incremental synchronization with automatic full reconciliation,
access-token refresh, logout, an authenticated dashboard at `/dashboard`, and a Neon database
foundation for the persistent Spotify connection. The dashboard uses the complete latest
synchronized PostgreSQL library snapshot for its real library overview and saved-library analytics;
recommendations and playlist generation remain clearly labelled previews. See the
[database foundation](docs/database-foundation.md), [dashboard data guide](docs/dashboard-data.md),
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

Production must use the matching HTTPS callback for its deployed origin. MuseVault requests exactly
the `user-library-read user-read-private` scopes.

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
