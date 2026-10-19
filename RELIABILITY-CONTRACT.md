# AI mutation and recovery contract

All seven tool names are retained. Reads return the authenticated user's current version. Every AI mutation requires:

```json
{
  "operationId": "unique-stable-run-identifier",
  "expectedVersion": "version-from-last-read",
  "activities": [{"id":"existing-id","time":"18:30"}]
}
```

Use `expectedVersion:null` only when the read returned null. `operationId` is 8–128 ASCII letters/digits/dot/colon/underscore/hyphen (a UUID is recommended). Persist the chosen ID and exact request in the AI client's run context. Never regenerate an ID merely because a response was lost.

A normalized request fingerprint includes tool, arguments, source and expectedVersion. The per-user receipt, associated planner/CAS update and inverse are committed in **one SQLite transaction on the existing cloud database**. An identical accepted retry returns the original result/version/operationId, even after a newer unrelated edit; this is the original acceptance receipt, not a read of the current planner, so read again before follow-up planning. It does not create another record/history entry. Reuse with different input or version is OPERATION_ID_REUSED. Rejected operations have no accepted receipt and no partial planner changes. The original receipt is durable across process/container restarts and normal backups.

Receipts are retained for the account lifetime, not silently expired. To bound costs, new receipts stop at 10,000 or 64 MB per user; a quota error rolls back the associated write. Operators must not delete receipts while implying old IDs remain deduplicated. Full database backup/restore includes receipts. JSON planner export deliberately excludes them and is not an idempotency-ledger transfer between accounts.

## Conflicts and partial updates

MCP tool errors set `isError:true`, include `structuredContent.error` and matching JSON text. VERSION_CONFLICT/RECOVERY_CONFLICT include `action:REREAD_AND_REPLAN`, instructions and `retryable:false`. Reread, preserve newer user edits, review a new plan and use a new operation ID. Never just replace the version on a stale payload.

Existing activity IDs use **patch** semantics: omitted fields remain unchanged; notes `""` and reminderMinutes `null` explicitly clear. Category can explicitly reset to `Personal`; fixed can be changed by the user in the app. New records require title/date/time/duration and receive defaults. The fully merged activity is validated, including its local time, before any write. `status` is preserved by rescheduling and changed via the status tool or batch statusUpdates.

One `upsert_activities` can include `activities`, `deleteIds` and `statusUpdates`, up to 100 total changes, with no duplicate ID across the lists. Any invalid/protected record rejects **the entire batch**. Prefer this for one coherent replan. Separate calls are separate transactions; each accepted call returns its operationId and concrete changes. If call two fails, call one may remain committed—report that partial completion and either replan or reverse call one explicitly if safe.

## Protected records

AI cannot edit/move/delete/reopen **any completed activity**, a deliberately stricter policy than protecting only older completed dates. A completed no-op is allowed without changing history. A manual user can correct/reopen completed work in the app.

On an existing fixed activity AI may change only notes, reminderMinutes and progress status. Its title, date, time, duration, occurrence, category, kind and fixed flag cannot change; deletion is forbidden. Status cannot reopen a completed record. Tentative intentions are not fixed. AI cannot import backups or change the timezone of a nonempty planner. The same protections are checked in batch deletes/status updates and recovery.

## Operation-specific AI recovery versus manual undo

`undo_last_change` called by AI requires **targetOperationId**, plus its own new operationId/current expectedVersion. It loads only that user's accepted AI receipt and checks that every touched record/preference still equals that operation's result. If safe, it reverses only those records/preferences, preserving unrelated later user edits. Changed or protected records, unavailable receipts and already-reversed targets produce a clear conflict. A no-op has no meaningful snapshot to restore. Undoing a created fixed activity or an activity completed later cannot bypass protection.

The browser's **Undo last change** remains an intentional, version-checked restoration of the most recent manual/AI snapshot visible in the activity log. It is not exposed as global AI recovery. Backup merge/restore is also an explicit, authenticated user operation: matching IDs update, unrelated IDs stay, preferences replace and a manual undo is available. A user-supplied backup is an intentional transfer of its included records; its embedded scope never selects another server account. Keep a full database backup before deployment/recovery.
