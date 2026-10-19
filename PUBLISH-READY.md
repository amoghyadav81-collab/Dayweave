# Dayweave 2.1 beta release handoff

This reliability release is implemented and locally tested for an invite-only independent deployment. The next milestone is a real unrelated-user week; it has not been claimed complete. Do not create a ChatGPT Site. **It is not a live public service until you deploy it and complete the account connection.**

## Repeatable review and release

Run `npm run verify:release -- --container` on a Docker-enabled Node 24 host with Chromium installed. See [AGENT-WORKFLOW.md](AGENT-WORKFLOW.md) for the parallel review process and [RELEASE-VERIFICATION.json](RELEASE-VERIFICATION.json) for the supplied run. Local checks do not replace the live steps below.

## Chosen default: Render

Render provides HTTPS and a stable `onrender.com` address, so buying or configuring a separate domain is optional. The included `render.yaml` creates one Node 24 service and a 1 GB persistent SQLite disk. It uses a paid service/disk; check Render’s current pricing before approving. No hosting account, billing commitment or service has been created by this task.

1. Put this source release in your GitHub repository (`amoghyadav81-collab/Dayweave`) or another repository you control. Keep `.env*`, `data/`, backups and generated `release/` out of Git. `.env.example` is safe to include. A local release ZIP is supplied; no remote push was performed.
2. Sign in at https://dashboard.render.com/ and choose **New → Blueprint**, connect that repository and select its release branch. Render reads `render.yaml`. Review the paid plan/disk, then approve creation. If Blueprint access is unavailable, create a Node Web Service with the same commands/environment/disk settings shown below.
3. The build command is `npm ci --include=dev && npm run build`; start is `npm run start:host`; health check is `/api/health`. Set one instance. The disk mounts at `/var/data`; DATABASE_PATH is `/var/data/dayweave.sqlite`. Do not use an ephemeral free service for planner storage.
4. Render generates SIGNUP_INVITE_CODE. Retrieve it privately from service environment settings and share it only with invited users. No password or production user account is bundled. The app derives APP_URL from Render’s injected RENDER_EXTERNAL_URL; if you later attach a custom domain, set APP_URL explicitly to that HTTPS origin and restart.
5. Wait for the service to become healthy. Run `npm run deploy:check -- https://YOUR-SERVICE.onrender.com` from a machine with Node 24. This verifies HTTPS-origin metadata, health and denial of unauthenticated planner access. It does not create test accounts on the live service.
6. Open the service `/login`, create your account with the invitation, set your timezone and routine. Create a second Dayweave account if you want a separate planner; use your existing Dayweave login across devices if you want the same planner. ChatGPT accounts do not automatically determine Dayweave identity—the login used on the consent screen does.
7. Connect ChatGPT using [START-HERE.md](START-HERE.md), with the MCP URL `https://YOUR-SERVICE.onrender.com/mcp`. Repeat from the other ChatGPT account against this **same URL**. No second deployment or code copy is needed. Check the email on the consent screen.
8. Verify a real read and approved write from each account, user isolation when using separate Dayweave logins, revocation, and data persistence after a service restart. Take an off-host database backup and test recovery before relying on it for important plans.

Publishing a Codex cloud environment saves the development setup; it does not by itself publish this website or connect another ChatGPT account. Only steps involving your hosting/GitHub accounts, billing, live domain and actual ChatGPT authorization remain external. They are not falsely marked tested. See VALIDATION.md for local build, browser and container evidence.

## If handing this ZIP to the other account

Use this instruction:

> This is the Dayweave 2.1 reliability beta source release. Read PUBLISH-READY.md, IMPLEMENTATION-ASSESSMENT.md, VALIDATION.md, ROLLBACK.md and START-HERE.md. Deploy the existing app using render.yaml and a persistent disk, then verify the public deployment. Do not create a ChatGPT Site or an owner-private plugin. Do not redesign or rebuild the planner. Preserve operationId retry receipts, partial updates, narrow AI reversal and explicit DST choices. Complete ONE-WEEK-TRIAL.md with a real unrelated user; recurring ChatGPT Tasks execution is unverified until RECURRING-WORKFLOW.md live gates pass. Preserve the seven authenticated MCP tools, per-user data isolation, PKCE OAuth, fixed-task protection and versioned writes. Complete the hosting/account steps with me and mark actual ChatGPT connection unverified until we test it. Never expose planner records without authentication. Reuse a previously deployed Dayweave service if one already exists.

## Alternative: your own server

On a Linux machine matching the target CPU architecture:

```sh
npm ci
npm run release
npx playwright install chromium
npm run test:browser
docker build -t dayweave:release release
npm run test:container
node scripts/configure-production.mjs planner.example.com
# Point the domain's DNS to the server and allow inbound ports 80/443.
docker compose --env-file .env.production -f compose.production.yaml up -d
npm run deploy:check -- https://planner.example.com
```

The production Compose file includes Caddy for automatic HTTPS and persistent volumes for planner data and certificates. The generated `.env.production` is private (0600), never overwritten automatically, and contains the invitation code. Render deployment does not require Docker or Caddy. Do not run fixture container tests against a live deployment.

**Browser reminders are not reliable background phone alarms.** Closing the page, sleep or device restrictions can prevent them. The app does not activate recurring AI schedules on your behalf.
