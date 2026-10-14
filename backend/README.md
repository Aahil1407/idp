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
confirm that the existing tables and columns match the API before deploying;
do not run DDL or seed data as part of this deployment.

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

## Known production limitations

The current API has no authentication or authorization, so callers can read
and change data without user identity or group authorization. The UI hardcodes
group and current-user IDs in `frontend/src/config.js`, and the backend enables
unrestricted CORS. These are production blockers; this pass does not add
authentication or change API behavior. Expense split membership is checked in
application code, not enforced by database foreign keys. Payment status remains
the existing `pending` / `settled` pair. No live database connection was tested.
