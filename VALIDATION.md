# Dayweave 2.1 reliability validation

Executed in the isolated cloud workspace on 2026-10-16 with Node 24.19.0, Next 16.4.2 and Chromium. Existing checks were run **before** changes: TypeScript, 25 Node tests, production build and six browser checks all passed. Reported defects were then reproduced with isolated temporary records; see IMPLEMENTATION-ASSESSMENT.md.

## 2026-10-19 parallel review and release gate

The original 2.1 baseline was rerun before this review: 46 Node tests, nine browser checks, TypeScript and production build passed. Parallel security, deployment and product review then reproduced and fixed these gaps:

- Invalid invitations consumed the shared sign-in budget. Invitations now reject before counters, with separate signup budgets; sign-in limits remain. Shared password-attempt exhaustion remains an explicit operational limit.
- Render's production environment could omit build-time development dependencies. Its install now explicitly includes them.
- A missing backup source path could initialize a new empty database. Backup now requires an existing regular file, opens read-only and checks integrity before copying.
- Copy-to-tomorrow lost kind and explicit DST occurrence. Both now survive alongside reminders.
- An expired write session left private view/cache until the next reload. HTTP 401 now clears them immediately and invalidates pending loads.
- Clipboard failures could claim success. Both controls now await completion and report rejected/unsupported copy.

`AGENT-WORKFLOW.md` describes the ownership/review process. `npm run verify:release -- --container` is the shared local/CI gate and records per-stage results. A new browser assertion initially matched two session-error elements; it was tightened to the exact message without weakening privacy assertions, then the full gate was rerun. The full gate passed: **52 Node tests, 12 production browser tests, 12 container browser tests, zero failures/skips**, TypeScript, production build, locked production install, image build and persistent-volume replacement. Desktop/mobile screenshots were visually reviewed. The runner also rejected an external fixture target before executing tests. See RELEASE-VERIFICATION.json for the resulting run; hosting and real account acceptance remain outside that report's local checks.

## Previous 2026-10-16 final checks

| Check | Result |
| --- | --- |
| `npm run check` | Passed |
| `npm test` | **46 passed, 0 failed/skipped** |
| Production build with unavailable runtime DB path | Passed; build does not touch a production disk |
| Production-only locked dependency install/release bundle | Passed |
| Desktop/mobile production browser suite | **9 passed, 0 failed/skipped** |
| Packaged Node 24 production image | Built and ran as dayweave:reliability |
| Container browser suite and persistent volume | **9 passed, 0 failed/skipped**, followed by successful container replacement preserving account/session/planner; disposable fixtures removed |
| Consistent SQLite backup/restore | Passed with restored data integrity, credentials revoked and additive receipt schema included |
| Config examples and rollout | Existing environment variables retained; additive 002 migration, exact connection steps and explicit downgrade/rollback procedures documented |

## Required acceptance mapping

| Acceptance | Evidence |
| --- | --- |
| 1. Lost accepted create response retries without duplication | Browser route forwards the real MCP request to the server, discards/aborts its response, then retries identical input/version/operationId. Original result returned, one record/history entry. Unit test also replays after an unrelated later edit and across a separate server process. |
| 2. Same operation ID with different input rejects | Regression and real OAuth MCP test assert OPERATION_ID_REUSED; changed version also rejects. IDs are scoped per user. |
| 3. Newer user edit blocks stale AI | Unit and authenticated HTTP tests assert VERSION_CONFLICT and structured REREAD_AND_REPLAN guidance; user notes survive. |
| 4. Partial reschedule preserves metadata/progress | Notes/reminder/category survive AI patch; explicit clearing works. Manual correction preserves completion; completed AI changes reject. |
| 5. Invalid batch is atomic | Invalid second record or protected deletion rolls back all planner/history/receipt changes. Forced receipt-insert failure also rolls back the planner write. A valid mixed patch/delete/status batch commits as one version/history change. |
| 6. Recovery preserves unrelated later user edits | Targeted reversal removes only the identified operation's changes. Touched record/preference mismatches return conflict. |
| 7. Recovery cannot bypass protection | Fixed creation reversal, completed deletion/reopen/reschedule, protected batch paths, AI backup import and indirect timezone changes are guarded. |
| 8. Account isolation | Separate web sessions and OAuth grants read different records; cross-user mutations fail. Caller-supplied Sites headers/scopes do not select another account. Cache scope, account switching, logout, password change and deletion tested. |
| 9. Concurrent writes conflict clearly | Concurrent identical retries commit once; distinct operations using one version produce one success and a structured conflict. |
| 10. Backup recovery respects scope/merge | Matching IDs restore, unrelated records stay, invalid imports are atomic and manual undo works. A backup's embedded scope never changes the authenticated server user. Large valid backup above former 1.5 MB threshold restored. |
| 11. DST/overnight policy | New York gap/fold rejection/explicit choice, elapsed duration across both DST transitions, actual-instant overlaps/reminders, prior-date leads and overnight visibility on both days. Exact midnight end excludes following day. Browser editor verifies the choice and cross-day view. |

The assignment-overrun scenario is automated in `tests/reliability.test.mjs`: an initial stale replan rejects after newer guitar notes; a fresh single batch extends the assignment, moves flexible reading and guitar, preserves meeting/bedtime/completed history and reminders, produces no duplicate on retry, and explains concrete time/duration changes. This is a deterministic local end-to-end planner/store scenario, not proof of a real model's natural-language planning quality.

The browser suite also exercises all seven real MCP tools, discovery/DCR/consent, invalid PKCE/code replay, refresh and revocation, and a cookie-free read/write with a refreshed bearer token. That verifies **headless token mechanics only**, not a scheduled ChatGPT run. The maintained OAuth library consumes a bad-verifier authorization code, so tests restart authorization rather than bypass the check. A Node deprecation warning from the library's URI parser is observable; inputs remain exact-allowlisted, and no TLS/checksum/signature verification was disabled.

Desktop (1440×1000) and mobile (390×844) screenshots are generated in test-results. Visual review caught status cards pushing the mobile schedule down; they were moved below the schedule and the existing-user heading compacted. Search, overlap warnings, manual edit/progress/skip, focus, backup and the existing visual design remain.

## Unverified live gates / remaining blockers

- Public deployment, managed HTTPS, hosting billing and provider-level restart/off-host recovery require the user's hosting account; no public service was provisioned.
- A second **real** ChatGPT account must connect to that same deployed endpoint, consent under its own Dayweave login and read/write/revoke. Local fake accounts do not prove the actual client UI/permissions.
- ChatGPT Tasks custom-app selection, retained OAuth/refresh and unattended write approval are not established. No real scheduling service/account session was available; no recurring job is enabled. See RECURRING-WORKFLOW.md for the exact live procedure and manual fallback. The official Tasks help page could not be fetched under workspace egress policy; no platform restriction was invented from that.
- No unrelated person has completed the seven-day trial yet. ONE-WEEK-TRIAL.md records the milestone and stop conditions.
- Physical iOS/Android/Safari behavior and background notification delivery are unverified. Browser reminders are not reliable background phone alarms.

Cloud setup draft persistence, local container validation, public application deployment and an actual seven-day user trial are separate outcomes. Only the first two have local evidence here. No live planner data was modified for testing.
