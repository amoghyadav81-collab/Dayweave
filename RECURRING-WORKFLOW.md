# One recurring workflow: ChatGPT morning planning

Status: **not enabled; live scheduled execution is unverified**. Manual connected planning remains usable. No scheduler, extra assistant integration or recurring job was added by this reliability task.

The selected AI platform is ChatGPT, using the existing OAuth-connected custom MCP app. Dayweave's `/mcp` endpoint is a tool server, not a scheduling service. An app connection, prompt, saved brief or exported instruction does not create a scheduled task. The only candidate execution service here is **ChatGPT Tasks**, configured in the user's actual ChatGPT account if that account/workspace supports it.

## Exact current blocker

This workspace has no connected ChatGPT Tasks execution service or account session. No real scheduled job was created, and no evidence establishes that this account's Tasks service can invoke this custom MCP app, retain its OAuth authorization, refresh tokens and approve writes unattended. Interactive MCP success does not establish those capabilities. The official Tasks help page could not be fetched under the workspace egress policy; do not turn that lack of access into a claim that the platform either supports or forbids custom-app scheduled calls.

Official product reference to check in the account: https://help.openai.com/en/articles/10291617-tasks-in-chatgpt. Review the product's current supported tools/apps, workspace restrictions and unattended write approval policy before creating a job. If Tasks cannot use this app or requires interactive approval at each run, that is the concrete platform blocker; stop and keep manual planning rather than describing an instruction as an automation.

## Live acceptance procedure (requires deployed service and account interaction)

1. Deploy the existing app and complete a real second-account OAuth connection using START-HERE.md. Run a manual read and approved write first. Use only a small, explicit life brief and user-confirmed routine; do not assume the task can read unrelated conversations.
2. In that same ChatGPT account, inspect Tasks and confirm that the Dayweave custom app can actually be selected for a task and that its write tools can run without fresh interactive approval. Record the actual product restrictions. If either is unavailable, record **blocked**, not “configured.”
3. Create one near-term test run (a few minutes ahead), not a permanent daily schedule initially. Have it read context/day, use the returned version, and create a clearly named test activity with a stable operation ID. If a response is lost, retry the exact accepted payload/version/ID; a changed plan requires a new ID. Do not enable any auth bypass or paste bearer tokens into chat.
4. Close the conversation/device page and wait for the actual service run. Verify the task's execution result AND the cloud planner's resulting activity/operation receipt timestamp. Confirm the saved user identity and absence of another user's test activity. Rehearsing a tool call locally is not this check.
5. Inspect an expired-access-token run after the 15-minute access lifetime to prove refresh works in the actual client. Then revoke the grant and verify a later run fails visibly; it must not silently continue or claim it updated the planner.
6. Test a user edit between read and write. The run must surface VERSION_CONFLICT, reread and replan without changing protected activities; never blindly change expectedVersion and replay the old plan.
7. Only after those checks pass, use the real scheduling UI to set one daily run in the user's timezone (for example 06:00). Verify its timezone/DST policy in that scheduling service separately. Observe it for the one-week trial. If errors are hidden, no real execution log is available or writes require interactive approval, leave the recurring workflow **unverified/blocked** and use the manual prompt.

Suggested task instruction, **only if the platform supports all steps above**:

> Read my Dayweave planning context and today's plan in my saved timezone, following pagination. Use only confirmed routines, dated commitments and deadlines; leave tentative intentions flexible. Preserve completed activities and fixed commitments, including bedtime. Leave buffer time. Apply a related change as one atomic upsert batch with expectedVersion and a unique stable operationId for this run. Keep the exact same payload/version/ID only when retrying a lost response. On conflict reread and replan with a new ID; never overwrite a newer user edit. Report the concrete changes or the exact failure. Do not claim access to other conversations, invent commitments, roll all unfinished tasks forward or activate phone alarms.

## Manual fallback and failure visibility

Open the connected conversation each morning and use that same instruction manually. Ask for review before saving if the plan is uncertain. Dayweave returns structured errors to the client, readable change summaries on success and a last AI update timestamp in the app. The client must display failure rather than claim success. Dayweave cannot independently detect a scheduled job that never called the server; no missing-run monitoring is implemented.

## Three distinct events

1. **Server updated:** an authenticated write and its operation receipt committed; server `updatedAt`/`lastAIUpdate` changed.
2. **Device received:** the visible page fetched that version. Background tabs do not poll; visible pages poll at most once a minute, plus focus/network recovery. “Page last received” is not proof that an AI run occurred at that moment.
3. **Reminder delivered:** the executing page noticed a due reminder and attempted a toast/browser notification. “Local reminder attempt” is not OS delivery confirmation. Permission, closed tabs, sleep, power management and browser restrictions can prevent an alert.

Open-page browser notifications and the focus timer are **not reliable background phone alarms**. Use native alarms for important commitments. No web-push/background delivery service was added.
