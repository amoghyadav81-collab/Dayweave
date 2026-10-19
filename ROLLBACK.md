# Deployment, upgrade and rollback

The existing architecture is retained: one Node 24 service and its persistent cloud SQLite disk. No local-first database, relay, native app or extra AI integration was added. Follow PUBLISH-READY.md/DEPLOYMENT.md for Render or the tested Docker bundle.

## Upgrade to 2.1

1. Record the running release, APP_URL, persistent DATABASE_PATH and exact OAuth callback allowlist without exposing secrets. Confirm you can recover the current DB on a separate path.
2. From the running release with the same DATABASE_PATH, create a **new** consistent backup using `node --env-file-if-exists=.env.local scripts/backup.mjs /secure-backups/before-2.1.sqlite`. Encrypt/access-control it; it contains all accounts and token hashes. Keep it off the container's ephemeral filesystem.
3. Run frozen installation, TypeScript, unit/regression tests, production build and isolated browser/container checks on the release. No live planner data is needed for those tests.
4. Deploy a single instance. `db:migrate`/runtime opening applies additive, repeatable `migrations/002_operations.sql` alongside 001. It adds per-user operation receipts; existing user/workspace data is not rewritten. The runtime disk is not needed at build time.
5. Run `npm run deploy:check -- https://YOUR-ORIGIN`, then use **disposable accounts/data** for the live OAuth/isolation and mutation acceptance gates. Refresh the AI client's tool schema/reconnect if it cached 2.0 inputs: all AI mutations now require operationId and AI undo requires targetOperationId.
6. Keep the pre-upgrade backup and old release artifact until the trial has enough recovery evidence. Monitor disk usage; planner receipts have a documented bounded quota and are not silently purged.

## Code-only rollback

Prefer rolling back to a **previous compatible 2.1 build** using the provider's previous deployment or a retained container image. Keep the persistent DB/receipt table intact. Re-run public readiness checks. Do not delete the operations table to make old clients appear to work.

Do not blindly run 2.0 against planner records written by 2.1: the old schema/semantics do not implement kind/occurrence, operation receipts or safe AI recovery, and its input validators may reject new fields. An emergency return to 2.0 requires a **separate restored pre-upgrade DB and explicit acceptance of post-backup data loss/reconciliation**; disable AI access and retain the latest DB/source first. It is not a harmless code-only downgrade.

## Database recovery (separate new path)

1. Stop writes/stop the service and retain the current DB plus WAL/SHM intact. Never overwrite an open DB or remove a production volume.
2. Run `node scripts/restore.mjs /secure-backups/KNOWN-GOOD.sqlite /data/restored-NEW.sqlite`. The script refuses overwrite, validates SQLite integrity/foreign keys and invalidates browser sessions, pending codes and OAuth grants in the restored copy.
3. Point DATABASE_PATH at that new file, verify service-user ownership and start a compatible release. Runtime migration can add missing additive tables. Verify expected accounts/planner data with the owner, then have users sign in/reconnect.
4. Keep the replaced DB and backups secured for reconciliation. A backup only contains operations accepted up to that backup; do not replay unreviewed old client requests after point-in-time recovery. Review restored state with fresh reads and new authorized runs.

Local recovery and volume replacement tests are recorded in VALIDATION.md. Provider snapshots, production restore, traffic cutover, managed TLS and actual ChatGPT reconnection remain unverified until performed in the user's accounts.
