# Deployment checklist

For this reliability upgrade and any rollback, read [ROLLBACK.md](ROLLBACK.md) first. Refresh AI tool schemas after deployment; mutations now require operationId, and AI reversal requires targetOperationId. Existing user/planner records are not destructively migrated.

Deploy one Node 24 process with one persistent local SQLite disk. A small VM/container host is sufficient for an invite-only planner; start with about 1 GB runtime RAM and monitor. Builds need more temporary RAM/disk; build on CI or your workstation if the host is small. No worker queue, Redis, paid API or always-running scheduler is required. Do not scale to multiple machines sharing network-mounted SQLite. Ephemeral/serverless hosting without a durable local disk is unsupported.

## Recommended: Render managed hosting

Use `render.yaml` through a Render Blueprint. It selects one paid Node service, a 1 GB persistent disk, generated invitation code and managed HTTPS. `npm run start:host` derives the public origin from Render’s RENDER_EXTERNAL_URL (or an explicit APP_URL for a custom domain), validates configuration, runs migrations and starts Next on the injected PORT. Builds do not open the runtime database or require the persistent disk to be mounted. Follow PUBLISH-READY.md for the exact setup. Provider creation, pricing/billing, managed TLS and real ChatGPT connection remain **unverified until performed in your accounts**.

## Before exposing the service

- [ ] Choose a provider and a stable domain; provision TLS and a persistent encrypted disk. **Unverified: needs hosting credentials.**
- [ ] Set Node 24, production mode and `APP_URL=https://your-domain` (origin only, no path/trailing suffix).
- [ ] Set `DATABASE_PATH=/data/dayweave.sqlite` on the persistent volume. Ensure the non-root service user can write that directory. Never commit the database or copy a development database into an image.
- [ ] Set a random `SIGNUP_INVITE_CODE` through secure hosting settings; share only with intended users. Registration is disabled when blank. Each user chooses a unique login. Account email is not verified by a mail service.
- [ ] Configure exact trusted `OAUTH_REDIRECT_URIS` as a JSON array, beginning with the callback shown by the ChatGPT client. The included default is `https://chatgpt.com/connector_platform/oauth_redirect`.
- [ ] Put a TLS reverse proxy in front of port 3000. Preserve Cookie/Authorization/Origin, disable caching on `/`, `/api/*`, `/oauth/*`, `/auth/*`, `/account`, `/mcp`, and protect request logs from passwords, cookies, code/token bodies and Authorization headers. Do not use the old Sites identity headers.
- [ ] Bound request size (10 MB accommodates current browser backups) and add modest connection/request limits. Leave `/oauth/register`, metadata, `/login` and authorization endpoints reachable; planner data still always requires authenticated access.
- [ ] Keep port 3000 private behind the proxy. Configure HTTP→HTTPS redirects and HSTS at the TLS proxy after verifying your domain.

## Option A: ordinary Node host

From the project root:

```sh
npm ci
npm run db:migrate
npm run check
npm test
npm run build
NODE_ENV=production npm start
```

Supply environment variables using the host's secret manager/service configuration. If you use `.env.local`, protect it and keep it outside source control; Next loads it at startup. Run as a dedicated non-root user. Use the host process supervisor to restart on failure/reboot. Build/start commands and local production requests were verified; your supervisor and disk permissions are **unverified**.

## Option B: packaged Docker release with automatic HTTPS

Generate the production-only bundle on Linux with the same CPU architecture as the target:

```sh
npm ci
npm run release
docker build -t dayweave:release release
# Needs Playwright Chromium and a free local port 3100; creates only disposable fixtures:
npm run test:container
node scripts/configure-production.mjs planner.example.com
docker compose --env-file .env.production -f compose.production.yaml up -d
```

Point DNS to the server, open ports 80/443, and keep the internal app port private. Caddy handles certificates, HTTPS, response compression and a 10 MB request limit. The application and certificate volumes persist; never remove them on a live service. The bundle uses frozen production dependencies installed before the Docker build, so image construction needs only the official Node base image. It contains no database or private environment file. This packaging, Docker runtime, nine browser/integration checks and persistence after replacement were tested locally.

`Dockerfile` remains an alternative all-in-container build for environments with package-registry egress; that path was not completed in this cloud network. `compose.yaml` is an alternative for an existing reverse proxy. Production Caddy certificate issuance on your actual DNS remains unverified.

## Acceptance on the actual domain

- [ ] Read `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource/mcp`; verify all URLs use the public HTTPS origin.
- [ ] An unauthenticated `POST /mcp` returns **401** with a `WWW-Authenticate` resource-metadata challenge, and `/api/planner` returns **401** even with forged `oai-authenticated-user-id` headers.
- [ ] Create two separate Dayweave users. Add unique tasks; inspect each account's UI and MCP results. Neither can see or alter the other's data.
- [ ] Follow START-HERE.md with two real ChatGPT accounts against this one deployment. Read/write, disconnect/revoke and reconnect. **Unverified: needs account interaction.**
- [ ] Race a UI edit with an MCP edit from an old version; one wins and the stale writer must re-read. Verify fixed-task rejection.
- [ ] Export JSON, delete a test activity, restore/undo; then test a full database recovery on a separate disk/path.
- [ ] Reboot/redeploy and confirm data persists, then sign in and reconnect.
- [ ] Check desktop/mobile browsers and physical iOS/Android reminder limitations. Chromium emulation was tested; physical devices remain **unverified**.

## Backups, recovery and administration

From the project root with the **same** DATABASE_PATH as the app:

```sh
node --env-file-if-exists=.env.local scripts/backup.mjs /secure-backups/dayweave-YYYY-MM-DD.sqlite
# Use a fresh destination; the script never overwrites. Encrypt/back up off-host.
node scripts/restore.mjs /secure-backups/dayweave-YYYY-MM-DD.sqlite /data/recovered.sqlite
```

`backup.mjs` uses SQLite's online backup API, so it does not copy an inconsistent database/WAL pair. `restore.mjs` checks integrity, creates a new file, and revokes sessions, authorization codes and grants before validating it. Stop the service, set DATABASE_PATH to the new restored file, verify ownership and restart. Preserve the original database/WAL/SHM files for rollback; do not copy over an open database. Users sign in and reconnect OAuth after recovery. A tested local recovery is not evidence that your provider's snapshots work. Test encrypted off-host recovery periodically, monitor backup failures and choose retention appropriate to your users.

Expired authentication records can be removed with `node --env-file-if-exists=.env.local scripts/maintenance.mjs` periodically; there is no automatic paid scheduler.

Users can change their own password or delete their live account in `/account`, with password confirmation. Password changes revoke other sessions, pending authorization codes and AI grants. Deletion removes the user’s planner/history/session/token records; it does not delete another user’s data. There is no email reset service. The administrator can reset a user's password locally without putting it in a command argument/history:

```sh
read -rs -p 'New password: ' dayweave_password
printf '%s' "$dayweave_password" | node --env-file-if-exists=.env.local scripts/reset-password.mjs user@example.com
unset dayweave_password
```

This revokes that user's sessions and OAuth grants. Deliver recovery instructions securely. Take a backup before administration. Account ownership must be checked out of band; do not reset based solely on a chat request.

## Operating limits

Invite-only beta; disclose the operator/contact/backup retention, adopt suitable terms, and add broader abuse controls, monitoring and security review before a broad public launch. Monitor disk/RAM, SQLite errors, auth failure counts and backup success; avoid logging planner content. Cloud remains the source of truth, and browser reminders **are not reliable background phone alarms**. No recurring AI schedule is activated by deployment.
