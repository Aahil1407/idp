# SmartSplit --- Teammate Workflow Guide

**Current handoff: 2 November 2026 | Repository branch: `main`**

Start with [`truth.md`](truth.md) for verified project state, completed
work, and the remaining checklist. The latest implementation is commit
`cfa8d12` (`Redesign SmartSplit and add device accounts`), pushed to
`origin/main`. A push may trigger Railway; deployment health has not
been verified for this commit.

This guide explains how to get the project running locally, work safely
with GitHub, test changes, and deploy through Railway.

## 0. Read these two files first

1.  `truth.md` --- source of truth for completed work, verified checks,
    known limitations, and next tasks.
2.  `WORKFLOW.md` --- this run/development guide.

Keep both files in the repository root. Update `truth.md` whenever a
feature, test, migration, deployment, or known issue changes; record
only work that was actually verified. Do not commit personal secrets or
credentials.

## 1. Project details (verify against the checkout)

-   GitHub repository: https://github.com/Aahil1407/idp
-   Expected branch: `main`
-   Frontend: React + Vite
-   Backend: Node.js + Express
-   Database: MySQL
-   Railway project: `valiant-liberation`
-   Railway environment: `production`
-   Backend URL: `https://idp-production-044d.up.railway.app`

These are handoff notes. Check the actual folder names, `package.json`
scripts, environment files and current Git status before running
commands. Do not assume the frontend/backend directory structure if it
differs in the current checkout.

## 2. First-time setup

### A. Clone the repository

Open PowerShell or a terminal in the folder where you want the project,
then run:

``` bash
git clone https://github.com/Aahil1407/idp.git
cd idp
git switch main
git pull origin main
git status
```

If the repo already exists locally, do **not** clone over it. Open that
folder and run:

``` bash
git status
git branch --show-current
git pull --ff-only origin main
```

If `git status` shows uncommitted work, stop and preserve it before
pulling. Do not use `git reset --hard`, `git clean -fd`, or force-push
to "fix" a sync problem.

### B. Check tools

Run:

``` bash
node --version
npm --version
git --version
```

If any command is missing, install the appropriate tool before
proceeding. Use a supported current LTS version of Node.js.

## 3. Inspect the repository before running it

List the files and inspect scripts:

``` bash
dir
type package.json
```

If the repository contains separate `frontend` and `backend` folders,
inspect their package files too:

``` bash
type frontend\package.json
type backend\package.json
```

Use the actual `scripts` listed in each package file. Do not invent
script names. Check for `.env.example` or README setup instructions.
Never print or share `.env` values.

## 4. Install dependencies and run locally

### Frontend

If `frontend\package.json` exists, open a terminal in the repository
root and run:

``` bash
cd frontend
npm install
npm run
```

`npm run` lists the scripts available. If `dev` is listed, start the
frontend with:

``` bash
npm run dev
```

Leave that terminal open. Vite normally prints the local URL; use the
exact URL shown in the terminal.

### Backend

Open a **second** terminal at the repository root:

``` bash
cd backend
npm install
npm run
```

Check the available scripts. If the backend's documented start script is
`start`, run `npm start`. If a `dev` script is listed and intended for
development, run `npm run dev`. Do not guess the start command if
scripts differ.

The backend may require environment variables and a MySQL connection.
Check the README and `.env.example` for required variable *names*.
Create a local `.env` only if needed, using your own authorized
development credentials. **Never copy production database passwords into
chat or commit `.env`.**

If using the deployed Railway backend for a quick UI check, inspect the
frontend's API-base-URL configuration and make sure it points to the
intended backend. Avoid accidentally writing demo/test records into
production. Prefer a local/test database for development.

## 5. GitHub workflow for teammate changes

Your GitHub invitation has been sent. Accept it before pushing. Use the
shared repository and avoid overwriting the other person's work.

### Recommended: work on a feature branch

From the repo root:

``` bash
git switch main
git pull --ff-only origin main
git switch -c review3/personal-demo
```

Make changes, then inspect them:

``` bash
git status
git diff --stat
git diff
```

Run the tests/build before committing. Stage only the intended files,
rather than blindly adding everything:

``` bash
git add <file-or-folder>
git commit -m "Complete personal SmartSplit demo"
git push -u origin review3/personal-demo
```

Then open a Pull Request on GitHub from `review3/personal-demo` into
`main`, review the diff, and merge it when ready. This is safer than
both teammates pushing directly to `main`.

### If you both agree to push directly to `main`

Only do this if nobody else is editing/pushing at the same time:

``` bash
git switch main
git pull --ff-only origin main
git status
```

After making and testing changes:

``` bash
git add <file-or-folder>
git commit -m "Complete personal SmartSplit demo"
git pull --rebase origin main
git push origin main
```

If rebase reports conflicts, stop and resolve carefully. Do not
force-push. Never commit `.env`, tokens, passwords, database URLs or
other secrets. Review `git status` before staging.

## 6. Current implementation and next work

The current implementation status and prioritized remaining work live
in `truth.md`. The latest delivered work includes the SmartSplit UI
redesign, palette rotation and theme mode controls, and account/device
session flows. The account migration has been applied to Railway
production after an owner-authorized test-data cleanup and verified local
SQL export. Production app tables are empty. Existing rows with no
password hash must not be claimed by email alone.

Before building on authentication, review the migration and account
activation limitations in `truth.md`. Signup/login still need an
authenticated smoke test. Do not infer that a push means Railway deployed
successfully.

## 7. Test before pushing

Inspect scripts first; then run the commands the repo actually supports.
Common examples:

``` bash
# From frontend directory, only if these scripts exist:
npm run lint
npm run build

# From backend directory, only if a test script exists:
npm test
```

Last verified for commit `cfa8d12`:

- Backend `npm test`: 33 passed.
- Frontend `npm run lint`: passed.
- Frontend `npm run build`: passed.
- Frontend `node --test test/expense-splits.test.js`: 10 passed.

Re-run checks after changes; these results do not cover later edits. Also
manually check sign-up/sign-in against a local database after applying
the migration there, per-device sign-out, protected routes, group
membership access, expense creation, balances, settlements, mobile
layout, and loading/error states. Mocked tests and a successful build do
not prove real-database or production behavior.

Record what was genuinely tested. A successful build does not prove the
deployed app or production database works.

## 8. Railway deployment

A GitHub push triggers a deployment **only if** the relevant Railway
service is connected to this repository and configured to deploy from
the branch you pushed. Check Railway service settings and deployment
logs rather than assuming it happened.

-   Frontend code changes: confirm the frontend service redeployed.
-   Backend code changes: confirm the `idp` service redeployed.
-   MySQL is a separate service; a GitHub push does **not**
    automatically apply schema migrations unless an explicit migration
    process was configured.

After deployment, open the existing frontend URL and test the actual
deployed app. If a deployment fails, inspect the Railway build/deploy
logs and fix it; do not claim success until it is healthy.

## 9. Production database safety --- important

At the latest verified check: Railway CLI accessed the production MySQL
service through its private tunnel. Earlier, the Railway Backups page
showed no backups on the current plan. -
Railway access was completed through the private tunnel and a verified SQL
export was saved locally outside the repository. `backend/README.md` records
the full group-payment migration as applied; historical payment rows remain
unassigned. The device-account migration is also applied and verified.
The device-account migration was applied after the production test-data
cleanup and verified SQL export. Its unique email index and `user_sessions`
table are present; do not rerun it. The production app tables are empty.

Therefore: - Do **not** rerun either already-applied migration. A verified
export is kept locally. - Do
**not** run `backend/schema.sql` against the existing production DB; it
is intended for a fresh database. - Do **not** enable Railway Public
Access just to make the migration easier. - Do not assign the old
settled payment to a group by guessing. - Do not run destructive SQL or
production data changes without explicit approval. - Never paste
database credentials into ChatGPT/Codex or commit them.

Do **not** run `backend/schema.sql` against the existing production DB;
it is intended for a fresh database. Keep schema changes separate from
UI work and use a disposable/local database for initial migration and
account-flow verification.

## 10. Before the demo

1. Confirm GitHub contains the intended commit/merged PR.
2. Confirm Railway's relevant deployment is healthy; do not assume it
   deployed from a push.
3. Apply database migrations only under the safeguards in section 9.
4. Open the deployed app in a fresh browser tab and test the flows
   listed in `truth.md`.
5. Keep a fallback local run ready in case the deployment has a problem.
6. Be clear about account activation and any feature still planned.

## 11. Completion report to send the owner

When done, report the summary and files changed; branch and commit hash;
tests and their actual results; database/environment used; migration
status; deployment status and URL actually tested; and remaining work.
Explicitly say whether any production migration or destructive database
change was run.

**Golden rule:** audit first, preserve work, test, commit safely, verify
deployment, and do not touch production schema without a verified backup
and approval.
