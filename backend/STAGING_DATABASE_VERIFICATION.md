# SmartSplit staging database verification

This runbook's migration prechecks and execution sequence apply only to an
isolated, disposable or staging MySQL database that has not yet been migrated.
Railway production has already had the full group-scoped payment migration
applied and verified. Do not run either migration file or `schema.sql` against
production. No database connection is made by the audit that produced this file.
The local `backend/.env` points to a loopback host, but its selected database is
unconfirmed; do not use it for lifecycle writes until isolation is verified.

## Configure an isolated database

`backend/db.js` loads `backend/.env` and creates a MySQL connection pool. Process
environment variables override `.env`. `DB_HOST`, `DB_PORT`, `DB_USER`,
`DB_PASSWORD`, and `DB_NAME` take precedence over Railway-style `MYSQL*`
variables and `MYSQL_URL`. `DB_SSL=true` enables TLS with certificate
verification; `DB_SSL_CA_PATH` optionally supplies a CA certificate.

For staging, supply all `DB_*` connection values to the backend process through
its environment or secret manager, using a dedicated staging hostname, database,
and least-privilege staging account. Keep the staging password and URLs out of
the repository and frontend. Verify the selected database using the read-only
identity query below before starting write-capable checks. Do not overwrite the
existing `backend/.env`; do not start the backend until the environment is
confirmed to select an isolated, non-production database.

## Read-only schema and data inspection

Run these statements using a read-only account against the database selected by
the connection. They do not alter schema or data.

```sql
-- Confirm which database the session selected. Do not proceed unless this is
-- the intended isolated staging/test database.
SELECT DATABASE() AS selected_database, VERSION() AS mysql_version;

-- Tables and storage engines.
SELECT TABLE_NAME, ENGINE
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
ORDER BY TABLE_NAME;

-- Columns, types, nullability, defaults, and generated/auto-increment details.
SELECT TABLE_NAME, ORDINAL_POSITION, COLUMN_NAME, COLUMN_TYPE,
       IS_NULLABLE, COLUMN_DEFAULT, EXTRA
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
ORDER BY TABLE_NAME, ORDINAL_POSITION;

-- Indexes, including their column order and uniqueness.
SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX;

-- Foreign-key columns and referenced columns.
SELECT TABLE_NAME, CONSTRAINT_NAME, COLUMN_NAME,
       REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE CONSTRAINT_SCHEMA = DATABASE()
  AND REFERENCED_TABLE_NAME IS NOT NULL
ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION;

-- Verify payment group_id presence, nullability, and type.
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'payments'
  AND COLUMN_NAME IN ('payment_id', 'group_id', 'from_user', 'to_user', 'amount', 'status');

-- Inspect payment-related indexes and foreign keys before considering migration.
SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payments'
ORDER BY INDEX_NAME, SEQ_IN_INDEX;

SELECT TABLE_NAME, CONSTRAINT_NAME, COLUMN_NAME,
       REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE CONSTRAINT_SCHEMA = DATABASE()
  AND TABLE_NAME = 'payments'
  AND REFERENCED_TABLE_NAME IS NOT NULL
ORDER BY CONSTRAINT_NAME, ORDINAL_POSITION;

-- Count rows by group assignment and status. NULL group IDs are historical or
-- otherwise unassigned; this query deliberately does not infer their group.
SELECT group_id, status, COUNT(*) AS payment_count,
       SUM(amount) AS total_amount
FROM payments
GROUP BY group_id, status
ORDER BY group_id, status;

-- Bounded row inspection for the payment lifecycle (review access to user IDs
-- and amounts before sharing query results).
SELECT payment_id, group_id, from_user, to_user, amount, status, payment_date
FROM payments
ORDER BY payment_id DESC
LIMIT 100;

-- Migration gate: expected CURRENT state is exactly three payments, all
-- settled, with no group_id column yet. Stop if results differ.
SELECT COUNT(*) AS payment_count,
       SUM(status = 'settled') AS settled_count,
       SUM(status <> 'settled' OR status IS NULL) AS other_status_count
FROM payments;

-- Check whether any target migration object already exists. Expected before
-- migration: zero rows for group_id, three named indexes, and three FKs.
SELECT 'column' AS object_type, COLUMN_NAME AS object_name
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payments'
  AND COLUMN_NAME = 'group_id'
UNION ALL
SELECT 'index', INDEX_NAME
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payments'
  AND INDEX_NAME IN ('idx_payments_group_status',
                      'idx_payments_group_from_user',
                      'idx_payments_group_to_user')
UNION ALL
SELECT 'foreign key', CONSTRAINT_NAME
FROM information_schema.TABLE_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'payments'
  AND CONSTRAINT_TYPE = 'FOREIGN KEY'
  AND CONSTRAINT_NAME IN ('fk_payments_group',
                          'fk_payments_from_group_member',
                          'fk_payments_to_group_member');
```

## Migration status and safety

For an un-migrated staging copy, `migrations/20261015_add_group_id_to_payments.sql` is **not idempotent**. It
adds a nullable column, three supporting indexes and three foreign keys. Apply
it only if the prechecks confirm the exact expected current schema: the six
tables exist as InnoDB; relevant IDs are `INT UNSIGNED`; `group_members` has
primary key `(group_id,user_id)`; both existing payment user foreign keys and
their indexes are present; none of the new target objects exists; and exactly
three payments are present, all settled. If any target object exists, stop and
inspect its definition and the other migration objects. Do not rerun or
partially reconstruct the ALTER by guesswork.

### Preserve payment rows before applying

First export all three current rows, including the full set of payment columns,
using a trusted MySQL client and a read-only account. Save the output in the
approved secure location (it contains user IDs and payment amounts), then
confirm it contains exactly three rows and compare its IDs and values with this
read-only query:

```sql
SELECT payment_id, from_user, to_user, amount, payment_date, status
FROM payments
ORDER BY payment_id;
```

For an SQL INSERT backup file, use `mysqldump` with the approved connection
options and credentials supplied through the organization's secret mechanism
(do not put credentials on the command line or in shell history):

```text
mysqldump [approved connection options] --single-transaction --no-create-info --skip-triggers \
  --no-tablespaces --where="1=1" DATABASE_NAME payments > payments-before-group-id.sql
```

Because the table has exactly three rows per the precheck, this exports all
payment rows as INSERT statements. Secure and retain the file; do not import it
as part of this migration. Alternatively, export the SELECT result as CSV from
the approved database client. Recheck the row count immediately before the
DDL window if writes may occur between export and migration.

### Execution order and DDL behavior

1. Run the read-only identity, schema, payment-count, and target-object checks.
   Confirm this is the approved target and that the output matches every
   precondition above. Preserve the three rows as described above.
2. Have the database owner review the resulting definitions and the migration
   file. Run the single `ALTER TABLE` once during the approved change window.
3. Run the postchecks below. Stop on any discrepancy; do not rerun the file.

MySQL 8.4 uses atomic DDL for supported InnoDB `ALTER TABLE` operations: this
single ALTER is committed as one DDL operation, or its changes are rolled back
if the statement fails. DDL implicitly commits; it cannot be wrapped in a user
transaction and later rolled back with `ROLLBACK`. Atomic DDL does not restore
an earlier schema after a successful ALTER, and it does not remove the need to
inspect state after a client disconnect or uncertain result. Do not split this
statement or blindly retry it. Recovery from a successfully applied migration
requires a separately reviewed forward-only change.

The migration leaves `group_id` nullable. Existing payment rows remain `NULL`;
the backend's group balance query selects only settled payments whose
`group_id` equals the requested group, so unassigned historical payments do not
change any group's balance or settlement suggestions. Do not backfill them
unless independent records reliably establish the group.

The existing `fk_payments_from_user` and `fk_payments_to_user` constraints and
their single-column indexes stay in place. The new composite constraints ensure
that any non-NULL group payment uses two members of that group; the original
constraints remain useful for legacy NULL-group rows and user referential
integrity. `idx_payments_group_status` supports group/status reads, while the
two additional composite indexes support the respective membership foreign
keys. The fresh `schema.sql` already describes this resulting layout; its
`CREATE TABLE IF NOT EXISTS` statements are for fresh setup, not an upgrade.

### Read-only postchecks

Run these only after the ALTER returns success. Confirm `group_id` is
`INT UNSIGNED NULL`, all named indexes have the indicated ordered columns, and
all three foreign keys point to the expected columns. Reuse the earlier
information_schema queries, then run:

```sql
SELECT COUNT(*) AS payment_count,
       SUM(group_id IS NULL) AS null_group_count,
       SUM(status = 'settled') AS settled_count
FROM payments;

SELECT payment_id, group_id, from_user, to_user, amount, payment_date, status
FROM payments
ORDER BY payment_id;
```

Expected result: three rows, three NULL group IDs, and three settled rows, with
the payment fields matching the saved export. Confirm the new FK definitions
from `information_schema.KEY_COLUMN_USAGE` pair `(group_id,from_user)` to
`group_members(group_id,user_id)` and similarly for `to_user`.

The backend currently inserts payments with a `group_id`, reads settled
payments with `WHERE group_id = ?`, and updates status by `payment_id`. These
queries align with the nullable migration and the fresh schema. The legacy rows
are deliberately omitted from group balances. No payment route change is
needed for this migration.

## Staging lifecycle checklist

Use only disposable staging users and groups. Capture API responses and verify
the database with read-only queries after each step.

1. Confirm `SELECT DATABASE()` identifies the isolated staging database and
   confirm the payment migration's column, index, and foreign keys are present.
2. Create a group through `POST /api/groups`; verify the returned `group_id`
   exists and its creator appears in `GET /api/groups/:id/members`.
3. Add a second existing user through `POST /api/groups/:id/members`; verify
   they appear in the member list. Retry and confirm duplicate membership is
   rejected as a conflict.
4. Create one expense for each split method (Equal, Exact, Percentage, Custom)
   using `POST /api/groups/:id/expenses`. Use paise-sensitive amounts such as
   ₹10.01. Verify stored `expenses.amount` equals the sum of the stored
   `expense_splits.amount_owed` exactly and all split users are group members.
5. Fetch `GET /api/groups/:id/balances`; reconcile each balance to total paid
   minus stored total owed. Confirm balances sum to zero before settlements.
6. Request `POST /api/groups/:id/settlements/optimize`; verify suggested
   payments reconcile debtor and creditor balances, do not exceed outstanding
   amounts, and include a one-paise debt when present.
7. Create a suggested settlement with `POST /api/settlements/pay`, including
   `group_id`, `from_user`, `to_user`, and `amount`. Save the returned
   `payment_id`. Confirm it is pending and balances are unchanged while pending.
8. Call `PUT /api/settlements/:id/settle` with that returned payment ID. Verify
   the response reports settled and a fresh balance query reduces outstanding
   amounts by the settled payment.
9. Repeat the settle request for the same ID. Confirm it is rejected and does
   not alter balances or payment state.
10. Create a second staging group with overlapping members and its own expense
    and settlement. Confirm its payments change only its group's balances and
    the first group's balances remain unchanged.
11. Verify the original historical `group_id IS NULL` rows remain unchanged
    throughout the exercise.

Clean up only disposable staging data through the project's reviewed cleanup
process after recording results. Never run cleanup against production.
