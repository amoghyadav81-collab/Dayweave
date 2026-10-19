import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "dayweave-reliability-")),
  "isolated.sqlite",
);
const { run, one } = await import("../lib/database.mjs");
const { invoke, load } = await import("../lib/store.ts");
const { handleMcp } = await import("../lib/mcp.mjs");
const person = () => {
  const uid = randomUUID();
  run(
    "INSERT INTO users VALUES(?,?,?)",
    uid,
    uid + "@example.com",
    "isolated-test-no-login",
  );
  return uid;
};
const task = {
  title: "Guitar",
  date: "2026-10-17",
  time: "18:00",
  duration: 30,
  notes: "Preserve these notes",
  reminderMinutes: 15,
  category: "Learning",
};
const ai = (uid, name, args, version, operationId = randomUUID()) =>
  invoke(uid, name, args, "AI", version, operationId);
const manual = async (uid, name, args) =>
  invoke(uid, name, args, "You", (await load(uid)).version);
const rejectsCode = (fn, code) => assert.rejects(fn, (e) => e.code === code);
test("lost response retry returns original durable receipt without duplicate records/history, even after unrelated user edit", async () => {
  const uid = person(),
    op = randomUUID(),
    args = { activities: [task] };
  const accepted = await ai(uid, "upsert_activities", args, null, op);
  await manual(uid, "upsert_activities", {
    activities: [{ ...task, id: "manual", title: "User note" }],
  });
  const before = await load(uid);
  const retried = await ai(uid, "upsert_activities", args, null, op);
  assert.deepEqual(retried, accepted);
  assert.equal((await load(uid)).version, before.version);
  assert.equal((await load(uid)).state.tasks.length, 2);
  assert.equal((await load(uid)).state.history.length, 2);
  assert.equal(
    one("SELECT count(*) AS n FROM planner_operations WHERE user_id=?", uid).n,
    1,
  );
});
test("same ID with changed input or version is rejected; IDs are scoped to user", async () => {
  const uid = person(),
    other = person(),
    op = randomUUID();
  await ai(uid, "upsert_activities", { activities: [task] }, null, op);
  await rejectsCode(
    () =>
      ai(
        uid,
        "upsert_activities",
        { activities: [{ ...task, title: "Different" }] },
        null,
        op,
      ),
    "OPERATION_ID_REUSED",
  );
  await rejectsCode(
    () =>
      ai(
        uid,
        "upsert_activities",
        { activities: [task] },
        "different-version",
        op,
      ),
    "OPERATION_ID_REUSED",
  );
  await ai(
    other,
    "upsert_activities",
    { activities: [{ ...task, title: "Other user" }] },
    null,
    op,
  );
  assert.equal((await load(uid)).state.tasks[0].title, "Guitar");
  assert.equal((await load(other)).state.tasks[0].title, "Other user");
});
test("every AI mutation requires operation ID and version; stale write returns structured reread/replan guidance", async () => {
  const uid = person();
  await rejectsCode(
    () => invoke(uid, "upsert_activities", { activities: [task] }, "AI", null),
    "OPERATION_ID_REQUIRED",
  );
  await rejectsCode(
    () => ai(uid, "upsert_activities", { activities: [task] }, undefined),
    "VERSION_CONFLICT",
  );
  await manual(uid, "upsert_activities", {
    activities: [{ ...task, id: "user", notes: "User edited" }],
  });
  const response = await handleMcp(
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "upsert_activities", arguments: { activities: [task] } },
    },
    () => ai(uid, "upsert_activities", { activities: [task] }, null),
  );
  assert.equal(response.result.isError, true);
  assert.equal(
    response.result.structuredContent.error.code,
    "VERSION_CONFLICT",
  );
  assert.equal(
    response.result.structuredContent.error.action,
    "REREAD_AND_REPLAN",
  );
  assert.equal((await load(uid)).state.tasks[0].notes, "User edited");
});
test("partial reschedule preserves omitted notes, reminder, category and status; explicit clearing is supported", async () => {
  const uid = person();
  let s = await ai(
    uid,
    "upsert_activities",
    { activities: [{ ...task, id: "a" }] },
    null,
  );
  s = await ai(
    uid,
    "upsert_activities",
    { activities: [{ id: "a", time: "19:00" }] },
    s.version,
  );
  let t = (await load(uid)).state.tasks[0];
  assert.equal(t.notes, task.notes);
  assert.equal(t.reminderMinutes, 15);
  assert.equal(t.category, "Learning");
  assert.equal(t.status, "planned");
  s = await ai(
    uid,
    "upsert_activities",
    { activities: [{ id: "a", notes: "", reminderMinutes: null }] },
    s.version,
  );
  t = (await load(uid)).state.tasks[0];
  assert.equal(t.notes, "");
  assert.equal(t.reminderMinutes, null);
  await manual(uid, "set_activity_status", { id: "a", status: "completed" });
  await manual(uid, "upsert_activities", {
    activities: [{ id: "a", time: "20:00" }],
  });
  assert.equal((await load(uid)).state.tasks[0].status, "completed");
});
test("one invalid record or protected delete rolls back the whole coherent batch and receipt", async () => {
  const uid = person();
  await manual(uid, "upsert_activities", {
    activities: [{ ...task, id: "meeting", fixed: true }],
  });
  const before = await load(uid);
  for (const args of [
    {
      activities: [
        { ...task, id: "new" },
        { ...task, id: "bad", time: "25:00" },
      ],
    },
    { activities: [{ ...task, id: "new" }], deleteIds: ["meeting"] },
  ]) {
    const op = randomUUID();
    await assert.rejects(() =>
      ai(uid, "upsert_activities", args, before.version, op),
    );
    assert.deepEqual(await load(uid), before);
    assert.equal(
      one(
        "SELECT operation_id FROM planner_operations WHERE user_id=? AND operation_id=?",
        uid,
        op,
      ),
      undefined,
    );
  }
});
test("operation-specific recovery preserves unrelated later edits, then rejects changed touched records", async () => {
  const uid = person(),
    op = randomUUID();
  let out = await ai(
    uid,
    "upsert_activities",
    { activities: [{ ...task, id: "a" }] },
    null,
    op,
  );
  await manual(uid, "upsert_activities", {
    activities: [{ ...task, id: "unrelated", title: "User later edit" }],
  });
  const current = await load(uid);
  out = await ai(
    uid,
    "undo_last_change",
    { targetOperationId: op },
    current.version,
  );
  assert.deepEqual(
    (await load(uid)).state.tasks.map((t) => t.id),
    ["unrelated"],
  );
  await rejectsCode(
    () => ai(uid, "undo_last_change", { targetOperationId: op }, out.version),
    "RECOVERY_CONFLICT",
  );
  const op2 = randomUUID();
  out = await ai(
    uid,
    "upsert_activities",
    { activities: [{ ...task, id: "a" }] },
    out.version,
    op2,
  );
  await manual(uid, "upsert_activities", {
    activities: [{ id: "a", notes: "New user notes" }],
  });
  const s = await load(uid);
  await rejectsCode(
    () => ai(uid, "undo_last_change", { targetOperationId: op2 }, s.version),
    "RECOVERY_CONFLICT",
  );
  assert.equal(
    (await load(uid)).state.tasks.find((t) => t.id === "a").notes,
    "New user notes",
  );
});
test("AI reversal, status paths, restore and batch paths cannot bypass fixed/completed protection", async () => {
  const uid = person(),
    op = randomUUID();
  let out = await ai(
    uid,
    "upsert_activities",
    { activities: [{ ...task, id: "fixed", fixed: true, kind: "commitment" }] },
    null,
    op,
  );
  await rejectsCode(
    () => ai(uid, "undo_last_change", { targetOperationId: op }, out.version),
    "PROTECTED_ACTIVITY",
  );
  out = await ai(
    uid,
    "upsert_activities",
    { activities: [{ id: "fixed", notes: "Allowed", reminderMinutes: 5 }] },
    out.version,
  );
  await rejectsCode(
    () =>
      ai(
        uid,
        "upsert_activities",
        { activities: [{ id: "fixed", title: "Not allowed" }] },
        out.version,
      ),
    "PROTECTED_ACTIVITY",
  );
  await manual(uid, "upsert_activities", {
    activities: [{ ...task, id: "complete", date: "2026-10-15" }],
  });
  await manual(uid, "set_activity_status", {
    id: "complete",
    status: "completed",
  });
  const before = await load(uid);
  for (const [name, args] of [
    ["delete_activity", { id: "complete" }],
    ["set_activity_status", { id: "complete", status: "planned" }],
    ["upsert_activities", { activities: [{ id: "complete", time: "21:00" }] }],
    ["upsert_activities", { deleteIds: ["complete"] }],
    ["import_backup", { tasks: [], preferences: before.state.preferences }],
  ])
    await rejectsCode(
      () => ai(uid, name, args, before.version),
      "PROTECTED_ACTIVITY",
    );
  assert.deepEqual(await load(uid), before);
});
test("concurrent identical retries commit once; distinct writes from one version conflict", async () => {
  const uid = person(),
    op = randomUUID(),
    args = { activities: [task] };
  const outputs = await Promise.all([
    ai(uid, "upsert_activities", args, null, op),
    ai(uid, "upsert_activities", args, null, op),
  ]);
  assert.deepEqual(outputs[0], outputs[1]);
  assert.equal((await load(uid)).state.history.length, 1);
  const result = await Promise.allSettled(
    ["19:00", "20:00"].map((time) =>
      ai(
        uid,
        "upsert_activities",
        { activities: [{ id: outputs[0].result.saved[0].id, time }] },
        outputs[0].version,
      ),
    ),
  );
  assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    result.find((r) => r.status === "rejected").reason.code,
    "VERSION_CONFLICT",
  );
});
test("receipt insert failure rolls back the associated planner write", async () => {
  const uid = person();
  run(
    "CREATE TEMP TRIGGER reject_receipt BEFORE INSERT ON planner_operations BEGIN SELECT RAISE(ABORT,'test receipt failure'); END",
  );
  try {
    await assert.rejects(() =>
      ai(uid, "upsert_activities", { activities: [task] }, null),
    );
    assert.equal((await load(uid)).version, null);
    assert.equal((await load(uid)).state.tasks.length, 0);
  } finally {
    run("DROP TRIGGER reject_receipt");
  }
});
test("assignment overrun replan preserves meeting, bedtime, completed history, user notes and guitar reminder", async () => {
  const uid = person();
  await manual(uid, "upsert_activities", {
    activities: [
      {
        ...task,
        id: "assignment",
        title: "Assignment",
        time: "13:00",
        duration: 120,
        category: "Focus",
      },
      {
        ...task,
        id: "meeting",
        title: "Meeting",
        time: "16:00",
        duration: 60,
        fixed: true,
      },
      {
        ...task,
        id: "bed",
        title: "Bedtime",
        time: "23:00",
        duration: 60,
        fixed: true,
      },
      { ...task, id: "guitar", time: "17:30", duration: 30 },
      {
        ...task,
        id: "reading",
        title: "Flexible reading",
        time: "15:00",
        duration: 60,
      },
      {
        ...task,
        id: "history",
        date: "2026-10-15",
        title: "Completed history",
      },
    ],
  });
  await manual(uid, "set_activity_status", {
    id: "history",
    status: "completed",
  });
  const old = await load(uid);
  await manual(uid, "upsert_activities", {
    activities: [{ id: "guitar", notes: "User chose a new song" }],
  });
  const plan = {
    activities: [
      { id: "assignment", duration: 180 },
      { id: "reading", time: "18:30" },
      { id: "guitar", time: "18:00" },
    ],
  };
  await rejectsCode(
    () => ai(uid, "upsert_activities", plan, old.version),
    "VERSION_CONFLICT",
  );
  const before = await load(uid),
    op = randomUUID();
  const out = await ai(uid, "upsert_activities", plan, before.version, op);
  assert.deepEqual(
    await ai(uid, "upsert_activities", plan, before.version, op),
    out,
  );
  const after = await load(uid);
  for (const id of ["meeting", "bed", "history"])
    assert.deepEqual(
      after.state.tasks.find((t) => t.id === id),
      before.state.tasks.find((t) => t.id === id),
    );
  const guitar = after.state.tasks.find((t) => t.id === "guitar");
  assert.equal(guitar.notes, "User chose a new song");
  assert.equal(guitar.reminderMinutes, 15);
  assert.equal(guitar.duration, 30);
  assert.equal(after.state.tasks.length, 6);
  assert.match(out.result.summary, /Assignment/);
  assert.match(out.result.summary, /Guitar/);
  assert.equal(after.state.history.length, before.state.history.length + 1);
});
test("accepted operation receipt replays across a separate server process", async () => {
  const { execFileSync } = await import("node:child_process");
  const uid = person(),
    op = randomUUID(),
    args = { activities: [task] };
  const accepted = await ai(uid, "upsert_activities", args, null, op);
  const script =
    'const {invoke}=await import("./lib/store.ts");const result=await invoke(process.env.REPLAY_UID,"upsert_activities",JSON.parse(process.env.REPLAY_ARGS),"AI",null,process.env.REPLAY_ID);console.log(JSON.stringify(result));';
  const output = execFileSync(
    process.execPath,
    ["--input-type=module", "-e", script],
    {
      env: {
        ...process.env,
        REPLAY_UID: uid,
        REPLAY_ARGS: JSON.stringify(args),
        REPLAY_ID: op,
      },
      encoding: "utf8",
    },
  );
  assert.deepEqual(JSON.parse(output), accepted);
  assert.equal((await load(uid)).state.tasks.length, 1);
  assert.equal((await load(uid)).state.history.length, 1);
});
test("a coherent batch patches, deletes and records progress in one version/history change", async () => {
  const uid = person();
  await manual(uid, "upsert_activities", {
    activities: [
      { ...task, id: "move" },
      { ...task, id: "remove" },
      { ...task, id: "progress" },
    ],
  });
  const before = await load(uid);
  const result = await ai(
    uid,
    "upsert_activities",
    {
      activities: [{ id: "move", time: "19:30" }],
      deleteIds: ["remove"],
      statusUpdates: [{ id: "progress", status: "completed" }],
    },
    before.version,
  );
  const after = await load(uid);
  assert.notEqual(result.version, before.version);
  assert.equal(after.state.history.length, before.state.history.length + 1);
  assert.equal(
    after.state.tasks.find((t) => t.id === "move").reminderMinutes,
    15,
  );
  assert.equal(after.state.tasks.find((t) => t.id === "move").time, "19:30");
  assert.ok(!after.state.tasks.some((t) => t.id === "remove"));
  assert.equal(
    after.state.tasks.find((t) => t.id === "progress").status,
    "completed",
  );
});
test("legacy fixed/completed records remain readable without destructive migration", async () => {
  const { runTool, emptyState } = await import("../lib/core.mjs");
  const state = emptyState();
  state.tasks = [
    {
      ...task,
      id: "legacy-fixed",
      fixed: true,
      status: "planned",
      source: "You",
      updatedAt: "2026-10-01T00:00:00Z",
    },
    {
      ...task,
      id: "legacy-completed",
      fixed: false,
      status: "completed",
      source: "You",
      updatedAt: "2026-10-01T00:00:00Z",
    },
  ];
  const changed = runTool(
    state,
    "upsert_activities",
    { activities: [{ id: "legacy-fixed", notes: "Allowed metadata" }] },
    "AI",
  );
  assert.equal(
    changed.state.tasks.find((t) => t.id === "legacy-fixed").time,
    task.time,
  );
  assert.equal(
    changed.state.tasks.find((t) => t.id === "legacy-fixed").kind,
    "commitment",
  );
  const noop = runTool(
    state,
    "upsert_activities",
    { activities: [{ id: "legacy-completed" }] },
    "AI",
  );
  assert.equal(noop.mutated, false);
  assert.deepEqual(noop.state, state);
});
test("planning context is bounded and paginated without hiding the existence of additional records", async () => {
  const { runTool, emptyState } = await import("../lib/core.mjs");
  const state = emptyState();
  state.tasks = Array.from({ length: 205 }, (_, i) => ({
    ...task,
    id: "page-" + i,
    status: "planned",
    fixed: false,
  }));
  const first = runTool(
    state,
    "get_planning_context",
    { date: task.date },
    "AI",
  ).result;
  assert.equal(first.tasks.length, 100);
  assert.equal(first.total, 205);
  assert.equal(first.nextOffset, 100);
  assert.ok(first.tasks[0].startInstant);
  const second = runTool(
    state,
    "get_planning_context",
    { date: task.date, offset: first.nextOffset },
    "AI",
  ).result;
  const third = runTool(
    state,
    "get_planning_context",
    { date: task.date, offset: second.nextOffset },
    "AI",
  ).result;
  assert.equal(third.nextOffset, null);
  assert.equal(
    new Set([...first.tasks, ...second.tasks, ...third.tasks].map((t) => t.id))
      .size,
    205,
  );
  assert.throws(() =>
    runTool(state, "get_planning_context", { date: task.date, days: 15 }, "AI"),
  );
});
