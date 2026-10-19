# Reliability assessment — before changes

Baseline inspected: Dayweave 2.0 independent Node/Next app with server-side SQLite on a persistent cloud disk, password sessions, OAuth code/PKCE, seven MCP tools, planner UI and deployment files. No AGENTS.md was found in the checkout/workspace search. No live planner data was inspected or mutated.

Baseline checks: TypeScript passed; 25 Node tests passed; production build passed with an unavailable runtime DB mount; six isolated production browser/integration checks passed.

Reproduced using an isolated temporary database and pure core state:

| Review finding | Actual checkout |
| --- | --- |
| Duplicate creation on retry | No stable operation receipt. Reissuing a no-ID create after a reread creates a second record. A byte-identical stale-version retry currently conflicts rather than replaying the accepted result. |
| Optional expectedVersion | Already required on all persisted AI/browser writes; conflict is only prose inside an MCP text error. Preserve enforcement, add structured recovery guidance. |
| Rescheduling clears omitted metadata | Reproduced: notes became empty, reminder null and category Personal. |
| Global AI undo | Reproduced: AI undo after an unrelated user write removed that user activity. Fixed-task guard exists but is insufficient. |
| Completed history | Reproduced: AI can delete a completed activity. |
| Atomic batch | Pure core clones the state and persisted updates use CAS. Preserve this; extend a coherent upsert batch to include related deletes/status updates. |
| Account isolation | Server session/bearer identity and per-user rows already implemented; no asserted Sites headers trusted. Existing local isolation tests pass; cache/account-switch and second-user OAuth coverage need expansion. |
| Authentication | Existing portable OAuth flow is custom application code with Node crypto primitives. Move PKCE/token protocol processing to a maintained OAuth server library; retain existing users/hashed tokens and per-user data. |
| Time | Overnight activity absent from next-day API; New York 2026-03-08 02:30 and 2026-11-01 01:30 both accepted without policy/choice. Duration/reminders currently use wall-clock arithmetic. |
| Daily usability | Working schedule/edit/progress/focus/search/overlap/backup. Repeated AI/welcome content; no current/next fixed summary or concrete change summaries. |
| Recurring workflow | No scheduling service or task authentication is implemented. A stored prompt is presented as if configuring a recurring client task were sufficient. Real ChatGPT scheduled custom-MCP execution has not been verified. |

Ordered implementation:

1. Add an additive operation-receipt migration; require stable AI operation IDs and existing version preconditions; atomically commit write, receipt and inverse; replay identical accepted requests and reject ID reuse. Implement partial updates, coherent batches, completed/fixed guards and narrow operation-specific AI reversal. Preserve intentional manual undo.
2. Keep the current cloud-backed deployment and identity boundary. Use maintained OAuth protocol processing, official MCP/OAuth source material and standard crypto APIs; expand two-user web/MCP/backup/cache/logout tests. No new database architecture, relay or integration.
3. Use maintained Temporal timezone handling for explicit gap/fold policy, elapsed duration, overnight day membership and cross-date reminders. Bound the AI planning context and identify confirmed commitments versus tentative intentions.
4. Keep the visual design; put schedule first after onboarding, expose current/next fixed, concrete change summaries and persistent failure/receipt timestamps; provide a fictional fixed/flexible demonstration with free time.
5. Verify everything possible locally, including the assignment-overrun replan. Document the actual recurring-service blocker and manual fallback, rollout/rollback and one-week trial. Real deployment, unrelated ChatGPT connection and unattended scheduled execution remain unverified without the required service/account interaction.

Official reference retrieval: the maintained node-oauth project README was retrieved from its official GitHub repository. Initial requests for the official MCP website and OpenAI Tasks help page were blocked by this environment's egress policy; use the MCP project's official GitHub source where available and do not invent unsupported live-platform claims.

## Implemented outcome

The focused fixes are now in lib/core.mjs, lib/store.ts, lib/planning.mjs and the MCP/browser boundaries. Additive migration 002 stores atomic operation receipts/inverses. Existing version enforcement is preserved and structured; no-ID creations are safely replayed. Partial/coherent batches, protected records and narrow reversal are covered by regressions, including the assignment-overrun scenario and rollback-on-receipt failure. OAuth protocol processing now uses a maintained server library; existing standard Node crypto/password hashes and persisted user records remain compatible. Temporal handles explicit DST/elapsed/overnight behavior. Cache/account switching, focused schedule-first UI and concrete summaries are covered locally.

See VALIDATION.md for the final check results and acceptance mapping. The existing cloud-backed storage/deployment architecture was retained. No live planner records were used in testing. Public deployment, a second real ChatGPT account, real scheduled execution and an actual seven-day trial still require external account/user evidence.
