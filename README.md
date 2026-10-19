# Dayweave 2.1 · reliability beta

Dayweave is a daily/weekly planner with progress, focus timer, backup/merge restore, undo and seven authenticated MCP tools. Deploy **one web app**; other ChatGPT accounts connect to that same deployment and sign in to their own Dayweave account. There is no dependency on ChatGPT Sites, owner plugins, Cloudflare bindings or asserted identity headers. Account settings include password changes, connected-client revocation and confirmed account deletion.

This reliability release preserves the existing cloud-backed app. See [IMPLEMENTATION-ASSESSMENT.md](IMPLEMENTATION-ASSESSMENT.md) for reproduced defects and the ordered fixes, [RELIABILITY-CONTRACT.md](RELIABILITY-CONTRACT.md) for writes/recovery, [TIME-POLICY.md](TIME-POLICY.md) for DST/overnight behavior, and [ONE-WEEK-TRIAL.md](ONE-WEEK-TRIAL.md) for the next live milestone.

The old archive's private-Site publication directions have been replaced. No credentials or planner records were supplied in the archive. Start with [PUBLISH-READY.md](PUBLISH-READY.md) for the selected Render deployment. See [START-HERE.md](START-HERE.md) for connection steps, [DEPLOYMENT.md](DEPLOYMENT.md) for the deployment checklist and [SECURITY.md](SECURITY.md) for the authorization boundary.

## Local setup

Requires Node 24 and npm; no database service or paid API is required.

```sh
npm ci
cp .env.example .env.local
# Edit .env.local: set a private random SIGNUP_INVITE_CODE.
# For example, generate one locally with: openssl rand -hex 32
# Set DATABASE_PATH to an absolute persistent path if desired.
npm run db:migrate
npm run dev
```

Open the app on port 3000. Expand **Create an account with an invitation**, choose your email and a unique password of at least 12 characters, and enter your invitation code. Email is an account identifier; this version does not verify email or send password-reset mail. Give invited users the code securely outside ChatGPT conversations; clear it to close registration. Each person creates a separate account. Do not share your own login.

Next loads `.env.local`; standalone Node maintenance scripts need `--env-file-if-exists=.env.local` (or exported host environment variables). Keep `.env.local` out of Git. Changing production APP_URL, redirect allowlist or invitation code requires restarting the app. Production uses HTTPS; HTTP is allowed only for loopback development.

```sh
npm run check
npm test
npm run build
npm start
# Browser tests run the production build on port 3100 with an isolated temporary DB:
npx playwright install chromium
npm run test:browser
# Or use a preinstalled Chromium:
CHROMIUM_PATH=/usr/bin/chromium npm run test:browser
```

The browser suite covers desktop (1440px) and mobile (390px), planner edits/progress/week layout, sign-out, OAuth consent/token exchange and all seven tools, two-user isolation, stale writes and backup recovery. It produces screenshots in `test-results/`. Chromium emulation does not establish physical iOS/Android behavior.

## Storage and planning

Node's built-in SQLite stores users, hashed sessions/tokens and per-user planner JSON. `migrations/001.sql` and `002_operations.sql` are additive/idempotent and is applied by `db:migrate` and on server initialization. WAL and compare-and-swap versions protect concurrent edits. Every browser and MCP mutation **requires `expectedVersion`**, obtained from the last read (use `null` for a new planner). Every AI mutation also requires a stable **operationId**. An identical accepted retry returns its original result/version without another write/history entry; changed input under the same ID is rejected. The receipt and planner mutation commit atomically on the existing server database. Conflicts return structured reread/replan guidance; never blindly change the version on a stale plan. Browser APIs also require a valid same-origin session and matching account scope. MCP accepts OAuth bearer tokens only, never browser cookies or Sites headers.

Seven tools: `get_planning_context`, `get_day_plan`, `upsert_activities`, `set_activity_status`, `delete_activity`, `update_preferences`, `undo_last_change`. They operate on the same per-user records as the UI. AI cannot move/unlock/delete fixed commitments or change any completed record. Existing fixed records allow only notes/reminders/progress changes. AI recovery requires targetOperationId and reverses only that operation when still safe; it does not restore a global snapshot. Intentional manual undo remains available. Dates and reminders use the saved IANA timezone. Read before planning, preserve completed activities and reuse stable IDs.

Each planner is capped at 3,000 activities and 8 MB of current planner data. History retains up to 12 undo snapshots within a 32 MB total storage bound, trimming the oldest first while retaining the latest undo. Browser backup files are accepted up to 8 MB. Invalid imports do not partially write. Operation receipts are retained for the account lifetime, capped at 10,000/64 MB; quota failure rejects a new write atomically rather than discarding deduplication. Browser JSON exports exclude receipts, history and account credentials; restore merges IDs, preserves unrelated tasks, restores preferences/statuses and can be undone. Importing another person's exported file is an intentional data transfer, never automatic account sharing.

An optional **unencrypted, per-account device snapshot** supports read-only use after connection loss while the page remains loaded. Do not enable it on shared devices. It is not a cold-start offline app; no offline writes are queued. Tabs poll only when visible, at most once per minute, plus focus/network recovery. No planner engine or recurring job runs in the cloud.

**Browser reminders and the focus timer are not reliable background phone alarms.** They require an open, executing page and permission. Closed tabs, sleep, browser throttling, OS battery policies and device restrictions can delay or prevent alerts. Use a native alarm/calendar for critical reminders. Scheduling in an AI client is separate and must be explicitly enabled there.

## Verification status

Local production build, TypeScript, unit/security tests and Chromium desktop/mobile integration checks are tested; see `VALIDATION.md` for exact results. Public hosting, live HTTPS, provider disk backup/restore an actual ChatGPT connection from a second account, the one-week trial and unattended recurring execution require your hosting credentials/account interaction and remain **unverified**. A production-only Docker bundle/image is also tested, including persistent data after container replacement. No public deployment, repository push or new ChatGPT Site was created.

Deployment/rollback: [ROLLBACK.md](ROLLBACK.md). Recurring planning is **not enabled or verified**; see [RECURRING-WORKFLOW.md](RECURRING-WORKFLOW.md). No new scheduler or assistant integration was added. The fictional demo uses fixed meeting/bedtime anchors, flexible work and visible unscheduled time.

## Agent release workflow

See [AGENT-WORKFLOW.md](AGENT-WORKFLOW.md) for parallel review ownership and release gates. Run `npm run verify:release -- --container` for the complete local gate; results are recorded in `.verification/latest.json`. Hosting and real ChatGPT acceptance remain separate live checks.

## GitHub-hosted testing

For temporary full-app testing on GitHub, use [GITHUB-TESTING.md](GITHUB-TESTING.md) and the included Codespaces configuration. GitHub Pages cannot run the authenticated backend. Actual Codespace provisioning and ChatGPT connection require account interaction and remain unverified.
