# Database foundation

MuseVault uses a Neon development branch for the first persistence milestone. The database stores
the Spotify account identity, safe profile fields, granted scopes, and an encrypted refresh token.
It does not store tracks or drive the library and dashboard views yet.

## Connections and driver

Application queries use the pooled Neon connection in `DATABASE_URL`. Drizzle Kit migrations use
the direct connection in `DATABASE_MIGRATION_URL`; application runtime code never reads the
migration URL.

The application uses Drizzle's `neon-serverless` WebSocket driver with an operation-scoped Neon pool.
The OAuth operation must upsert a user, read the returned UUID, and then upsert that user's Spotify
connection inside one interactive transaction. The HTTP driver is optimized for one-shot queries
and cannot provide that dependent interactive transaction shape. Node.js 22 supplies the required
WebSocket implementation, so no additional WebSocket package is needed. Each operation closes its
pool after success or failure.

Neither importing the database modules nor running the normal unit suite opens a connection.

## Schema

`users` contains:

- a PostgreSQL-generated UUID primary key;
- one unique, stable Spotify `account_id` per MuseVault user;
- display name and optional approved Spotify image URL;
- creation and update timestamps with time zone.

`spotify_connections` contains:

- a PostgreSQL-generated UUID primary key;
- one unique user foreign key with cascade delete;
- the encrypted refresh token and positive encryption-version number;
- a non-null array of normalized granted scopes;
- connection, update, and nullable last-successful-sync timestamps with time zone.

The one-to-one relationship is enforced by the unique Spotify account ID and unique connection
user ID. There are no track, artist, album, playlist, analytics, history, snapshot, or job tables.

## Refresh-token encryption

`SPOTIFY_TOKEN_ENCRYPTION_KEY` is a canonical base64url encoding of exactly 32 random bytes. It is
server-only and independent of `SESSION_SECRET`.

Refresh tokens are encrypted with AES-256-GCM using a fresh cryptographically secure 12-byte IV for
every write. The versioned payload is:

```text
v1.<base64url IV>.<base64url ciphertext>.<base64url authentication tag>
```

Decryption validates the version, section count, canonical base64url encoding, IV and tag lengths,
and GCM authentication. Unsupported, malformed, modified, or incorrectly keyed payloads fail with
fixed internal errors that contain no token material. The version column and serialized prefix
provide explicit migration points for future key rotation.

## Environment variables

The following names belong in the ignored `apps/web/.env.local` file:

- `DATABASE_URL` — pooled Neon development connection used by application queries;
- `DATABASE_MIGRATION_URL` — direct connection used only by Drizzle Kit;
- `SPOTIFY_TOKEN_ENCRYPTION_KEY` — 32 random bytes encoded as base64url.

Do not expose these variables through `NEXT_PUBLIC_`, application responses, logs, or committed
files. The accessors are lazy so unrelated imports, builds, and tests do not require database
credentials.

## Migration workflow

Run the generated-migration workflow from the repository root:

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:studio
```

`db:generate` derives SQL from the Drizzle schema under `apps/web/src/lib/db/schema` and writes
source-controlled migration files under `apps/web/drizzle`. `db:migrate` applies those generated
files to the Neon development branch using only `DATABASE_MIGRATION_URL`. `drizzle-kit push` is not
part of the normal workflow.

## OAuth persistence order

The Spotify callback performs these operations in order:

1. validate OAuth state and PKCE callback data;
2. exchange the authorization code;
3. fetch and normalize the current Spotify profile;
4. encrypt the refresh token;
5. atomically upsert the MuseVault user and Spotify connection, storing the encrypted token and the
   scopes actually granted by Spotify;
6. write the existing encrypted HttpOnly browser session;
7. redirect to `/library`.

A persistence failure produces the fixed `persistence_failed` callback result and does not create
an authenticated browser session. If persistence succeeds but session writing fails, the existing
`session_failed` result is used. The upserts are idempotent, so retrying login is safe; MuseVault
does not attempt a compensating deletion that could remove a previously valid connection.

## Temporary token duplication

The refresh token is temporarily present in two encrypted locations:

- the new AES-256-GCM database value for durable connection ownership;
- the existing encrypted HttpOnly JWE session cookie used by the current request-time refresh flow.

The cookie is intentionally not redesigned in this milestone. Removing its refresh token would
require a broader session and request-refresh architecture change, which would increase risk while
establishing the database foundation. Access tokens remain only in the encrypted cookie and are
never persisted in the database.

## Security boundaries and limitations

- Database and token-encryption modules are server-only; no token reaches a Client Component.
- Repository results contain only safe identifiers and profile fields.
- All writes are parameterized Drizzle queries inside one transaction.
- Database, SQL, Neon, encryption, and token errors are mapped to fixed public callback states.
- The normal build and unit suite do not connect to Neon.
- Only the initial OAuth callback persists a refresh token in this milestone. If Spotify later
  rotates that token, the current request flow updates the encrypted cookie but not yet the database
  copy.
- `/library` and `/dashboard` still load only the first Spotify page, up to 50 saved tracks, and do
  not query a persisted library.
- There is no background synchronization, incremental sync, deployment migration automation, RLS,
  or production-branch migration workflow yet.

The next milestone is complete saved-library synchronization, including a deliberate strategy for
refresh-token rotation and durable multi-instance coordination.
