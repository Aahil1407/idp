# SmartSplit --- Truth & Handoff File

**Purpose:** Give the next ChatGPT/Codex session an accurate project
handoff and a clear build brief for Review 3.

**Last verified update:** 2 November 2026, commit `cfa8d12` on `main`,
pushed to `origin/main`.

**Current state:** A complete UI redesign and email/password account
flows with per-browser sessions are implemented in code. See the
"Completed work" and "Remaining work" sections below. Do not treat a
successful commit or local build as proof of Railway deployment or of
the device-account migration being applied.

**Immediate goal:** Complete local database setup and end-to-end review
of account creation, sign-in, profile/device controls, and existing
expense/group flows. Plan safe account activation for existing users
before enabling them to sign in.

**Status note:** Sections below preserve the original Review 3 brief
and project history. Where that older brief says work is pending, the
current verified status here and in "Completed work" takes precedence.

## Current verified status

### Completed work in `cfa8d12`

- Reworked the SmartSplit frontend around floating navigation, glass
  surfaces, responsive layouts, refined states, and theme tokens.
- Added curated light/dark palettes, new palette selection on each full
  refresh without immediately repeating the previous palette, and a
  top-left colour ripple on theme changes. The selected palette remains
  consistent while navigating within the app.
- Added account registration and sign-in with server-side password
  hashing, per-browser sessions, session revocation, and a profile page
  that manages active devices.
- Protected API routes with session authentication and group-member
  checks; API client sends the session cookie and browser device ID.
- Updated balance and settlement handling so settled payments are
  scoped to their group; settlement writes validate group members and
  cannot mark the same payment settled twice.
- Preserved expense split and settlement behavior and added auth tests.
- Added migration `backend/migrations/20261102_add_device_accounts.sql`
  and schema/setup documentation. The migration file is **not applied**.
- A manual, read-only Railway export was saved locally outside the repo.
  Production schema/data were not changed. The account migration preflight
  found one normalized-email collision, so the migration remains blocked
  pending owner review of the affected legacy accounts.
- The full group-payment migration `20261015_add_group_id_to_payments.sql`
  is recorded in `backend/README.md` as applied and verified on Railway;
  historical payment rows remain unassigned. The `20261016` file is a
  deprecated partial migration and must not be run.
- The latest redesign/account work did not change production data. We did
  not manually deploy; any automatic Railway deployment triggered by the
  GitHub push is unverified.

### Recent repository milestones

- `cfa8d12` — UI redesign and device accounts.
- `76e8f60` — expense allocation card layout.
- `415519e` — group settlement flows.
- `079e7d8` — group balances and settlement flow.
- `7b44a80` — Personal demo flow.
- `94fd520` — mobile settlement layout.
- `352dcbe` — backend-powered group list.
- Earlier commits prepared the frontend/backend for Railway; see
  `git log --oneline` for the full history.

### Verification recorded for this commit

- `backend`: `npm test` — 33 tests passed.
- `frontend`: `npm run lint` — passed.
- `frontend`: `npm run build` — passed.
- `frontend`: `node --test test/expense-splits.test.js` — 10 tests passed.
- These checks include mocked auth/database tests. They do not verify
  the migration against MySQL, real account email delivery, production
  behavior, or Railway deployment health.

### Remaining work, in priority order

1. Resolve the normalized-email collision found by the production
   preflight with the account owner. Do not delete, merge, or rewrite
   either legacy account by guessing. Then review and apply the account
   migration; it has not been applied to any database.
2. Manually verify registration, login, refresh/session persistence,
   same-device replacement, per-device revocation, logout-all, protected
   routes, group membership authorization, and profile behavior against
   that local database.
3. Design a verified activation path for pre-existing `users` rows.
   Their password hashes are NULL; do not let someone claim an existing
   account using only its email. Email verification/password reset are
   not implemented.
4. Decide whether email verification, password recovery, and MFA are
   required before real users use the feature; currently they are not
   implemented. The auth rate limiter is in-process and needs a shared
   store before horizontal scaling.
5. Confirm Railway deployment health and run production-like smoke tests
   only after proper staging, migration review, and database backup. The
   device-account migration and deployment state are not confirmed.
6. Keep this file current: after each meaningful change, update status,
   tests, migration/deployment state, and the next actionable items.

## 1. Project summary

SmartSplit is a Splitwise-style expense-sharing app. The intended
Personal flow is: 1. Dashboard/group list 2. Group details and members
3. Add expenses and split them 4. View balances 5. Optimize settlements
6. Mark a settlement as settled 7. Eventually support optional UPI IDs
and PhonePe/Google Pay intents

Authentication was previously deferred and is now implemented in code;
existing-account activation is still pending. Do not fake payment
transfers or claim bank confirmation unless genuinely implemented.

## 2. Repository and deployment facts

-   GitHub repo: https://github.com/Aahil1407/idp
-   Branch previously used: `main`
-   Local folder previously used: `C:\Users\Aahil\OneDrive\Desktop\idp`
-   Frontend: React + Vite
-   Backend: Node.js + Express
-   Database: MySQL
-   Railway project: `valiant-liberation`
-   Railway environment: `production`
-   Railway MySQL service: `MySQL`
-   Railway backend service: `idp`
-   Backend URL: `https://idp-production-044d.up.railway.app`

The frontend has been deployed and was reported to work. **Do not assume
recent local fixes are deployed.** Inspect the actual checkout, current
branch, `git status`, and files before editing. An older prototype was
also located at `Desktop/smartsplit/smartsplit`; use the currently
checked-out repo as the source of truth.

## 3. Review 3 rubric

The rubric shared for the review is 10 marks total, 2 marks each: -
Follow-up on Review II observations and project progress - Requirement
analysis and system design refinement - Component/tool selection and
technical justification - Initial prototype/module development and early
testing - Individual contribution, technical understanding and
next-stage responsibility

## 4. Existing functionality reported

An earlier mobile-first UI (design reference approximately 393 × 852)
covered Home/groups → Group details → Add Expense → Balances → optimized
Settlement → Mark as Settled. An earlier prototype used React state only
in parts, so verify which flows are currently API-backed.

Reported database tables: - `users` - `groups_table` - `group_members` -
`expenses` - `expense_splits` - `payments`

Previously documented API contract (verify current routes and payloads
before using): - `GET /api/users` - `POST /api/users` -
`POST /api/groups` - `GET /api/groups/:id` -
`POST /api/groups/:id/members` - `GET /api/groups/:id/members` -
`POST /api/groups/:id/expenses` - `GET /api/groups/:id/expenses` -
`GET /api/groups/:id/balances` -
`POST /api/groups/:id/settlements/optimize` -
`POST /api/settlements/pay` - `PUT /api/settlements/:id/settle`

Historical commits reported: -
`488598fb1bdb3f2f271feced2b773dc7d1e18f91` --- backend deployment
prep/health endpoint - `c4cd155a687d6516e361c6477fd048a57669926f` ---
frontend static serving setup -
`352dcbe5a018c08cff1ade83afa197e7ad8df683` --- real group IDs/dynamic
homepage - `94fd520df0b4d1b77f9a8f35dcc9e7d7764764a4` --- responsive
settlement layout

These are history notes, not proof the current checkout contains all
changes.

## 5. Historical balance/settlement bug and implemented fix

A test showed that the balances API calculated expenses paid minus
expenses owed but did not account for settled payments. Therefore
marking a settlement settled did not reduce the displayed balance.

Reported test data in Railway: - User 1: "SmartSplit Test Creator" -
User 3: "SmartSplit Test Member" - Group 1: "SmartSplit E2E Test" - Both
were members. - "Test Dinner" ₹100, split equally (₹50 each), paid by
creator. - A ₹50 settlement from user 3 to user 1 was marked settled. -
Later "lunch" ₹120 was added, paid by creator, believed split equally
(₹60 each). - The API showed +₹110 / −₹110 even after the payment. If
both expenses were equally split and that payment belongs to this group,
expected net balances are +₹60 / −₹60 (creator/member).

**Important:** the old `payments` table had no `group_id`, so do not
guess which group an old payment belongs to or backfill it
automatically.

A fix from the earlier handoff is present in the current repository. It
includes: -
`backend/group-balances.js`: group-scoped balances = expense paid −
expense owed + settled outgoing − settled incoming. -
`backend/settlement-optimizer.js` uses that shared balance helper. -
`POST /api/settlements/pay` requires `group_id`, validates group and
both members, and stores group_id. - `PUT /api/settlements/:id/settle`
only transitions pending payments, preventing double settlement. -
Frontend settlement screen sends `group_id`. -
`backend/migrations/20261015_add_group_id_to_payments.sql` adds nullable
`payments.group_id`, index and foreign keys. - Tests reportedly passed:
6 backend tests, syntax checks, frontend lint/build, and
`git diff --check`.

The code and tests are committed. The full group-payment migration is
recorded in `backend/README.md` as applied and verified in Railway. The
newer device-account migration is not applied; do not infer that a commit
applied it. Do not recreate or overwrite uncommitted work.

The migration is additive but not idempotent; apply only once and only
after human approval and a verified backup/export. Do not run
`backend/schema.sql` on the existing production DB; it is for a fresh
database.

Railway backup UI showed "No Backups" and said new backups require a Pro
upgrade. Railway CLI was installed and login/link succeeded on Windows
for project `valiant-liberation`, environment `production`, service
`MySQL`, but `railway connect MySQL` said the MySQL client must be
installed. A manual SQL export is still pending. Do not enable public
database access just for this task.

## 6. Original Personal-mode acceptance checklist

This is the original build brief and regression checklist, not a claim
that every item is still pending. Use the current status and Remaining
work above to see what remains.

Inspect the current repository and then implement a cohesive demo with
2--3 groups, realistic members/expenses and internally consistent
balances. Use actual backend/API persistence if supported. Avoid
hardcoded IDs and fabricated totals. Do not insert duplicate seed rows
every time the page loads.

Suggested demo data (illustrative, not existing database facts; adapt to
schema and current data): 1. **Goa Getaway** --- Aahil, Rohan, Sana,
Karthik; resort ₹6,400; cab rides ₹1,250; dinner ₹2,180; water sports
₹3,600. 2. **Flat Expenses** --- Aahil, Rohan, Meera; groceries ₹1,850;
electricity ₹2,240; Wi-Fi ₹999; cleaning supplies ₹460. 3. **Weekend
Hangout** --- Aahil, Sana, Karthik; brunch ₹1,680; bowling ₹2,100; movie
tickets ₹1,050.

Make payers, splits, balances and settlements mathematically consistent.
These are proposed sample values, not records already confirmed in the
database.

### Acceptance checklist

-   Landing page has two clear choices: **Personal** and **Business**.
-   Personal opens the personal dashboard/group list.
-   Business opens a clearly labelled "Coming soon" placeholder only.
-   Show 2--3 well-named groups, member counts and believable totals.
-   Group details show members and transaction list.
-   Adding an expense works end-to-end and updates totals/balances.
-   Balances account for expenses and settled payments, scoped to the
    correct group.
-   Settlement optimization uses backend amounts; React must not
    independently recalculate settlement amounts.
-   Mark as settled only shows success after the server confirms; show
    loading/errors and prevent duplicate submissions.
-   Navigation, refresh and responsive layouts work.
-   Include sensible loading, empty and error states.
-   Do not fake authentication, UPI success, payments, or API data.
    Label nonfunctional features honestly.
-   Preserve existing styling and code conventions; make small,
    reviewable changes.

### Settlement flow to verify

1.  `POST /api/settlements/pay` with the actual route's required
    `group_id`, `from_user`, `to_user`, `amount`.
2.  Store returned `payment_id`.
3.  Call `PUT /api/settlements/:id/settle` with that ID, using the
    actual current payload contract.
4.  Show "Settled" only after the server confirms success.
5.  If either request fails, show an error and do not claim settlement
    succeeded.

## 7. Explicitly out of scope

Do not build the Business product now: no business dashboard, business
APIs, business-specific data models, invoices, vendor workflows, booking
features or analytics. Only provide the landing-page choice and
placeholder.

Do not expand scope with OCR, receipt scanning, analytics, or new
business workflows. Email/password authentication is now implemented,
but existing-account activation, email verification, and password
recovery remain unfinished. UPI intent is planned; do not claim actual
money transfer or automatic bank confirmation unless implemented and
tested.

## 8. Suggested Codex workflow

1.  Audit `git status --short`, branch, recent commits, and uncommitted
    diffs.
2.  Inspect frontend pages/routes/styles/API client and backend
    routes/schema/migrations/tests.
3.  Verify whether the balance fix exists before editing.
4.  Preserve all existing uncommitted work; never commit `.env` or
    secrets.
5.  Add Personal/Business landing choice, with Business placeholder
    only.
6.  Complete Personal demo using consistent API-backed groups/expenses
    and real group IDs.
7.  Run backend tests, frontend lint/build, syntax checks and relevant
    manual flows.
8.  Test expense creation, balances, optimized settlement,
    settled-payment effect and mobile layout.
9.  Report changed files, tests actually run, whether data is local or
    production, and whether any deployment/migration occurred. Do not
    claim production E2E tests if only local checks ran.

## 9. Suggested Review 3 demo script

1.  Open landing page; explain Personal and planned Business modes.
2.  Select Personal and show the 2--3 groups.
3.  Open a group and show members, expenses and splits.
4.  Add a small expense and show updated balances.
5.  Generate optimized settlements and explain minimizing transfers.
6.  Mark one settlement settled and show the confirmed status/balance
    change.
7.  Return to landing page and show Business as a future module, without
    pretending it is implemented.

## 10. Rules for the next assistant/Codex

This file is a handoff, not proof every item is currently implemented.
Inspect the code and live state first. Prefer small, testable changes.
Do not run destructive SQL, deploy to production, or apply migrations
without explicit human approval and a verified backup/export. Never
request passwords or commit secrets. Keep Business out of scope except
the landing choice and placeholder.

**Current goal: validate account flows on a local database, resolve safe
activation for legacy users, then verify the app and deployment status
without unreviewed production database changes.**
