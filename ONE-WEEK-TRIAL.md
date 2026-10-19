# One unrelated user's one-week beta trial

Milestone: **connect → create a realistic plan → record progress → handle interruptions → receive useful updates → continue without significant manual cleanup**. This checklist is a live trial plan, not a claim that a real user has completed it.

## Before inviting the participant

- [ ] Deploy this exact 2.1 source release to the existing persistent cloud database/service. Take a full DB backup first; read ROLLBACK.md. Run the public readiness checker without touching private records.
- [ ] Operator and one unrelated participant each create their own Dayweave account and connect separate ChatGPT accounts to the same MCP URL using START-HERE.md. Verify the email on consent. The participant does not deploy their own copy.
- [ ] Verify both web APIs and MCP expose only their own records; use clearly named disposable test activities, then remove them intentionally. Do not use real private records for adversarial tests.
- [ ] Set/confirm an IANA timezone and wake/wind-down anchors. Explain elapsed duration, DST choice and overnight day membership. Record a small brief of confirmed routines, actual dated commitments and deadlines; label tentative intentions.
- [ ] Export a planner backup, restore a disposable item and manually undo the restore. Verify another account cannot fetch that backup from the server. Device snapshot is opt-in, unencrypted and account-scoped; test logout/switching on the chosen browser.
- [ ] State the actual recurring status: **manual only unless RECURRING-WORKFLOW.md live gates pass**. Confirm the participant knows browser reminders need an open, executing page and are not phone alarms.

## Daily protocol

Each morning read the saved context/day (all pages), confirm genuine commitments and build a feasible plan with free time/buffers. The user can review uncertain plans. Save related changes as one batch; preserve IDs, completed records and fixed commitments. During the day use completion/skip/edit/focus, record at least one real interruption and ask for a targeted replan. End the day by checking what actually happened; never automatically copy every unfinished task into tomorrow.

| Day | Required observation |
| --- | --- |
| 1 | Connect, create a small plan with one fixed commitment and flexible work, record progress, inspect the concrete change summary. |
| 2 | Use the existing planner without onboarding repetition; reschedule one activity and confirm notes/category/reminder/status survive. |
| 3 | Run the assignment-overrun scenario below; record whether manual cleanup was needed. |
| 4 | Simulate an interrupted response using disposable data/client tooling; retry the same operation ID/input/version and verify no duplicate/history change. If tooling is unavailable, record untested rather than manufacturing a failed network event. |
| 5 | Edit in the browser after an assistant read; verify the stale AI write visibly conflicts and a reviewed replan preserves the user edit. |
| 6 | Test narrow AI recovery after an unrelated later user edit; confirm it preserves that edit. Confirm protected/touched records produce a safe conflict rather than destructive undo. |
| 7 | Check persistence after service restart, export/recovery, local logout/cache behavior and total cleanup effort. Revoke the participant's client if ending the trial. |

Interruption prompt:

> My assignment took longer than expected. Move the remaining flexible work, keep my meeting and bedtime, and leave some guitar practice.

Before/after comparison must preserve the meeting and bedtime exactly, preserve completed history and newer user notes, keep reminder/category/duration unless explicitly changed, avoid duplicate IDs, leave realistic free time and explain actual changes. If an old context version is used, rejection is the correct outcome; reread and replan with a new operation ID.

## Record evidence, including failures

For each day record: planned/completed/skipped counts; interruption and resulting changes; accepted operation IDs (not tokens); structured conflict/failure and how it was resolved; duplicates or lost user edits (target **zero**); manual cleanup minutes and reason; time to reach a usable plan; whether the page received the update; reminder attempt versus confirmed device alert; actual recurring-task execution status if enabled. Do not collect private conversation text or credentials in the trial log.

Success means the unrelated user can continue all seven days without a data-loss/isolation incident, with realistic plans and little cleanup. Record the actual cleanup effort rather than declaring a number achieved in advance. A scheduled-job failure must be visible or recurring planning remains blocked. An unopened page failing to alarm is an explicitly unsupported background-alarm use case, not a successful reminder test.

## Stop conditions

Stop AI writes and preserve evidence if records cross accounts, a protected record moves/disappears, an accepted retry duplicates, a newer user edit is silently overwritten, or recovery removes unrelated changes. Export the current planner, retain a consistent DB backup securely, revoke the affected OAuth grant if needed and follow rollback procedures. Do not reset or overwrite the live DB as a test.
