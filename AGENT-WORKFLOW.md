# Dayweave release workflow

This is the development/release agent workflow. It does not schedule an AI planner or enable ChatGPT Tasks.

## Work order

1. Coordinator reads README.md, START-HERE.md, VALIDATION.md and this file; checks existing changes, runtime credentials by name/status only, and current deployment state. Preserve user data and existing work. Do not create another deployment if one exists.
2. Run independent review lanes concurrently: authentication/OAuth/isolation; deployment/backup/recovery; product/timezone/mobile. Each lane reports evidence, severity and a reproduction. Initially review only; coordinator assigns non-overlapping files for confirmed fixes.
3. Reproduce each confirmed defect with disposable fixtures. Implement the smallest fix and a regression that fails for the original defect. Preserve the seven tools, shared planner, fixed/completed protections, version checks and operation receipts.
4. Coordinator reviews combined changes and runs the release gate below. Browser servers and container port 3100 are sequential resources; do not run competing browser suites.
5. Package source only after checks pass; record checksums and exact passed/not-run outcomes. Keep runtime databases, environment files, test fixtures, dependencies and credentials out of source artifacts.
6. Perform public deployment checks only when an actual HTTPS origin is available. Use `npm run deploy:check -- https://actual-origin` for read-only public probes. Never point fixture suites at a live service.
7. Complete the real account and recovery gates in PUBLISH-READY.md, START-HERE.md and ONE-WEEK-TRIAL.md. Mark external steps unverified until there is evidence. Never substitute local OAuth tests for actual ChatGPT acceptance.

## Single-command local gate

Requires Node 24, installed locked dependencies, Chromium and (for the full gate) Docker. Install dependencies with `npm ci --include=dev`; install Chromium using `npx playwright install --with-deps chromium`, or set CHROMIUM_PATH to an existing browser.

```sh
npm run verify:release
# Full local release gate, including image build and disposable persistent-volume test:
npm run verify:release -- --container
```

The gate runs type checking, unit/security/recovery tests, a production build against a disposable unused database path, desktop/mobile authenticated browser tests, and a locked production bundle. With `--container`, it builds that bundle and repeats browser checks in the image, then replaces the container and verifies persistent data. It stops on failure, exits nonzero, and writes `.verification/latest.json` with per-step results and remaining live gates. Container checks are explicitly `not_run` when omitted. Existing developer changes and production data are untouched. The production bundle replaces only a directory marked as a generated Dayweave release.

Browser tests use fake accounts and local temporary databases. The runner refuses DAYWEAVE_TEST_URL to prevent accidental fixture execution on a deployed service. No hosting API, paid AI calls or scheduled worker is needed. GitHub Actions uses the same full command; a local pass does not mean that GitHub Actions itself has run.

## Live release gates

- Publish the reviewed source to a repository the hosting account can access; the remote was still empty at the 2026-10-19 review.
- Create one Render service with its persistent disk and approve billing in the hosting account. No credentials or billing approval are available in this workspace.
- Record the actual public origin, then test HTTPS, discovery and unauthenticated denial. Create only disposable live acceptance accounts with user authorization.
- Connect two real ChatGPT accounts to the same MCP URL. Confirm intended Dayweave identity at consent, read/write, isolation with separate Dayweave accounts, refresh and revocation.
- Take an off-host backup and test provider-level recovery and restart before relying on important records.
- Recurring ChatGPT execution, physical phone behavior and the real seven-day unrelated-user trial remain separate gates. Browser reminders are not reliable background phone alarms.
