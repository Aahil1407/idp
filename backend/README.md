# SmartSplit backend setup

Run `npm install` once, copy `.env.example` to `.env`, set local MySQL values,
then run `npm start`. Locally the API listens on port 5000; on Railway it uses
the assigned `PORT` and binds to `0.0.0.0`.

## Database configuration

- `DB_HOST`: MySQL hostname (defaults to `localhost`)
- `DB_PORT`: MySQL port (defaults to `3306`)
- `DB_USER`: MySQL account
- `DB_PASSWORD`: account password
- `DB_NAME`: database name (defaults to `smartsplit`)
- `DB_SSL`: set to `true` when the provider requires TLS
- `DB_SSL_CA_PATH`: optional path to the provider CA file when TLS is enabled
- `FRONTEND_ORIGINS`: comma-separated exact origins allowed to make credentialed browser requests
- `COOKIE_SAME_SITE`: defaults to `Lax`; use `None` only when frontend and API are cross-site, with HTTPS
- `TRUST_PROXY`: trusted proxy hop count, only when deployed behind a known proxy

The backend uses a MySQL connection pool. Group creation and expense/split
creation acquire a dedicated pooled connection for each transaction.

## Railway deployment

Deploy `backend/` as a Railway Node.js service with `npm start`. Add the
Railway MySQL service's **private** connection variables to the backend
service: `MYSQLHOST`, `MYSQLPORT`, `MYSQLUSER`, `MYSQLPASSWORD`, and
`MYSQLDATABASE`. `MYSQL_URL` is also supported. Explicit `DB_HOST`, `DB_PORT`,
`DB_USER`, `DB_PASSWORD`, and `DB_NAME` values take precedence over Railway's
`MYSQL*` variables, which take precedence over `MYSQL_URL`. If TLS is required,
set `DB_SSL=true`; certificate verification stays enabled. Do not expose the
database publicly or use a public connection URL for the backend.

Set the Railway service health-check path to `/health`. It returns success only
when the backend can query the configured database.

`schema.sql` describes the tables used by this code for a fresh development
database. **Do not run it against the existing Railway database.** It is not an
upgrade migration and does not verify existing table compatibility. Use
Railway's database browser or another approved read-only inspection method to
confirm that the existing tables and columns match the API before selecting an
upgrade migration. Do not use `schema.sql` to upgrade an existing database.

## Accounts and device sign-in

The API supports email/password account creation, sign-in, and sign-out. Passwords are stored as asynchronous scrypt hashes with per-account salts. Browser sessions use random opaque tokens in `HttpOnly` cookies; the database stores only token hashes. Each browser installation has a random local device ID and its own revocable session, shown on the Profile screen. Sessions expire after 30 days. No hardware fingerprint is collected.

The migration `migrations/20261102_add_device_accounts.sql` has been applied to Railway production after a verified local SQL export, duplicate-email preflight, and owner-authorized clearing of test data. The production app tables were empty after cleanup. The migration adds nullable `password_hash`, a unique email index, and `user_sessions`. New accounts can register; signup/login has not yet been smoke-tested against the live service. Existing rows with a `NULL` password hash cannot sign in until a verified account-activation flow is provided. They are deliberately not claimable by entering an email and choosing a password.

Set `FRONTEND_ORIGINS` to the exact deployed frontend origin. `SameSite=Lax` is the default. If frontend and API are on different sites, set `COOKIE_SAME_SITE=None` and serve both over HTTPS; production cookies also use `Secure`. Configure `TRUST_PROXY=1` only behind exactly one trusted reverse proxy. Auth endpoints are rate-limited per client process; use a shared rate-limit store before scaling to multiple API instances.

The Railway production migration for group-scoped settlement accounting has
already been applied and verified. Do not rerun a migration or execute
`schema.sql` against production. `migrations/20261015_add_group_id_to_payments.sql`
documents the full forward change for an un-migrated database; the older
`20261016_add_group_id_to_payments.sql` is a partial migration and is not a
replacement for the full schema. Existing historical payment rows remain
unassigned (`group_id IS NULL`) because their group cannot be inferred safely.
Do not backfill them.

Keep credentials and `MYSQL_URL` only in the backend service environment. Never
put them in frontend variables or commit real `.env` files. For a shared setup,
deploy one backend service connected to the private database and have both
developers' frontends use that backend URL. A local backend can use the Railway
private address only from a network that can resolve and reach Railway private
services; otherwise use a separate local development database.

The frontend's Vite proxy targets `http://localhost:5000` for local development.
For a separately hosted API, set the frontend build variable `VITE_API_URL` to
the HTTPS API base URL without a trailing slash. The proxy is used only during
local Vite development. Database credentials must remain server side.

## Account rollout notes

The login flow is implemented and its database migration is applied in Railway production. Backend health returned HTTP 200, and the hosted frontend signup CORS preflight returned HTTP 204. No signup/login write was submitted as part of that check. Email ownership is not verified because no mail service is configured; new profiles should not be treated as verified email identities. Password recovery, email verification, multi-factor authentication, and durable cross-instance rate limiting are not included. Verify signup/sign-in and authenticated group flows before relying on the identity feature with real users.

## Group invite links

The frontend and API support 30-day group invite links. The API generates a random token, stores only its SHA-256 digest, and adds the signed-in user to the group after the token is checked. Apply `migrations/20261102_add_group_invites.sql` to a database before using the invite controls there. This migration was applied and verified in Railway production on 2026-11-02.

Group, member, expense, balance, and settlement APIs require a valid device session. Group routes verify membership, group listing is limited to the signed-in member, and settlement writes require group membership. Expense split membership is checked in application code, not enforced by database foreign keys. Payment status remains the existing `pending` / `settled` pair. Live deployment health checks are reported separately from local test results; they do not substitute for authenticated, isolated write-flow verification.
