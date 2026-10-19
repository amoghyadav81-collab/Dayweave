import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveStart,
  interval,
  tasksForDay,
  notifyDue,
  conflicts,
} from "../lib/planning.mjs";
const task = {
  id: "dst",
  date: "2026-11-01",
  time: "01:30",
  duration: 60,
  status: "planned",
  reminderMinutes: 10,
};
test("DST gaps reject rather than silently shift, and folds require explicit occurrence", () => {
  for (const occurrence of [null, "earlier", "later"])
    assert.throws(
      () =>
        resolveStart(
          { ...task, date: "2026-03-08", time: "02:30", occurrence },
          "America/New_York",
        ),
      (e) => e.code === "NONEXISTENT_LOCAL_TIME",
    );
  assert.throws(
    () => resolveStart(task, "America/New_York"),
    (e) => e.code === "AMBIGUOUS_LOCAL_TIME",
  );
  assert.equal(
    resolveStart({ ...task, occurrence: "earlier" }, "America/New_York")
      .toInstant()
      .toString(),
    "2026-11-01T05:30:00Z",
  );
  assert.equal(
    resolveStart({ ...task, occurrence: "later" }, "America/New_York")
      .toInstant()
      .toString(),
    "2026-11-01T06:30:00Z",
  );
});
test("duration is elapsed minutes through spring-forward and fall-back", () => {
  const fall = interval({ ...task, occurrence: "earlier" }, "America/New_York");
  assert.equal(
    Number(fall.end.epochMilliseconds) - Number(fall.start.epochMilliseconds),
    3600000,
  );
  assert.equal(fall.end.hour, 1);
  const spring = interval(
    { ...task, date: "2026-03-08", time: "01:30", duration: 120 },
    "America/New_York",
  );
  assert.equal(spring.end.hour, 4);
  assert.equal(
    Number(spring.end.epochMilliseconds) -
      Number(spring.start.epochMilliseconds),
    7200000,
  );
});
test("overnight records appear on both affected days, exact-midnight end excludes following day", () => {
  const overnight = {
    ...task,
    date: "2026-10-17",
    time: "23:30",
    duration: 120,
  };
  assert.equal(
    tasksForDay([overnight], "2026-10-17", "Asia/Kolkata").length,
    1,
  );
  assert.equal(
    tasksForDay([overnight], "2026-10-18", "Asia/Kolkata").length,
    1,
  );
  assert.equal(
    tasksForDay([{ ...overnight, duration: 30 }], "2026-10-18", "Asia/Kolkata")
      .length,
    0,
  );
});
test("reminders cross date boundaries and distinguish repeated local times", () => {
  const midnight = { ...task, date: "2026-10-17", time: "00:05" };
  assert.equal(
    notifyDue(midnight, "Asia/Kolkata", new Date("2026-10-16T18:26:00Z")),
    true,
  );
  assert.equal(
    notifyDue(
      { ...task, occurrence: "later" },
      "America/New_York",
      new Date("2026-11-01T05:25:00Z"),
    ),
    false,
  );
  assert.equal(
    notifyDue(
      { ...task, occurrence: "later" },
      "America/New_York",
      new Date("2026-11-01T06:25:00Z"),
    ),
    true,
  );
  assert.equal(
    notifyDue(task, "America/New_York", new Date("2026-11-01T06:25:00Z")),
    false,
  );
});
test("overlap checks compare real instants, not repeated wall-clock labels", () => {
  assert.equal(
    conflicts(
      [
        { ...task, occurrence: "earlier", duration: 30 },
        { ...task, id: "late", occurrence: "later", duration: 30 },
      ],
      "America/New_York",
    ).size,
    0,
  );
});
test("timezone preferences accept IANA aliases and UTC but reject ambiguous abbreviations and fixed-offset strings", async () => {
  const { preferenceSchema, emptyState } = await import("../lib/core.mjs");
  for (const timezone of [
    "Asia/Kolkata",
    "America/New_York",
    "US/Eastern",
    "Etc/UTC",
    "UTC",
  ])
    assert.equal(
      preferenceSchema.parse({ ...emptyState().preferences, timezone })
        .timezone,
      timezone,
    );
  for (const timezone of ["PST", "+05:30", "not/a-zone"])
    assert.throws(() =>
      preferenceSchema.parse({ ...emptyState().preferences, timezone }),
    );
});
