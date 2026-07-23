# MuseVault

MuseVault is a personal music-discovery application that connects to Spotify, reads a listener's
saved tracks, and will eventually use that library as the basis for independent music suggestions.

The current vertical slice provides secure Spotify connection, a protected saved-tracks library,
access-token refresh, and logout. It does not yet include a database, full-library synchronization,
or a recommendation engine.

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

Fill in the real Spotify credentials and a strong session secret, then start the web application:

```bash
pnpm --filter @musevault/web dev
```

Open `http://127.0.0.1:3000`. Use this host exactly; Spotify does not accept `localhost` as a
redirect URI.

## Environment variables

`apps/web/.env.local` must provide:

| Variable                | Purpose                                                             |
| ----------------------- | ------------------------------------------------------------------- |
| `APP_URL`               | Canonical application origin, locally `http://127.0.0.1:3000`       |
| `SPOTIFY_CLIENT_ID`     | Client ID from the Spotify Developer Dashboard                      |
| `SPOTIFY_CLIENT_SECRET` | Server-only Spotify client secret                                   |
| `SPOTIFY_REDIRECT_URI`  | Exact registered OAuth callback URL                                 |
| `SESSION_SECRET`        | At least 32 random characters used to derive the JWE encryption key |

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
- Spotify tokens live only inside an encrypted, HttpOnly JWE session cookie.
- Client Components and public API responses never receive access or refresh tokens.
- Access tokens refresh shortly before expiry and once after an unexpected Spotify `401`.
- Spotify `account_id`, not the legacy profile `id`, is the stable account identifier.

There is no database. A future persistence milestone must define encrypted refresh-token storage
before background synchronization or durable multi-device sessions are added. Concurrent refreshes
are deduplicated within one server process; coordinating refresh rotation across multiple deployed
instances remains a future persistence concern.

## Development commands

Run these from the repository root:

```bash
pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The web typecheck runs `next typegen` before TypeScript so clean checkouts have current App Router
route declarations.

## Commit standards

MuseVault uses Conventional Commits. Commitlint validates commit messages, and the pre-commit hook
runs lint-staged with ESLint and Prettier.
