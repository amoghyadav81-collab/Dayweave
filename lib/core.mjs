import { z } from "zod";
import {
  dayKey,
  tasksForDay,
  resolveStart,
  shiftDay,
  interval,
} from "./planning.mjs";
import { problem } from "./errors.mjs";
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(s + "T00:00:00Z");
    return !isNaN(+d) && d.toISOString().slice(0, 10) === s;
  }, "Invalid calendar date");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const id = z.string().min(1).max(100);
export const activitySchema = z
  .object({
    id: id.optional(),
    title: z.string().trim().min(1).max(180),
    date,
    time,
    duration: z.number().int().min(5).max(1440),
    category: z
      .enum(["Focus", "Learning", "Wellbeing", "Personal"])
      .default("Personal"),
    notes: z.string().max(3000).default(""),
    fixed: z.boolean().default(false),
    reminderMinutes: z.number().int().min(0).max(1440).nullable().default(null),
    occurrence: z.enum(["earlier", "later"]).nullable().default(null),
    kind: z
      .enum(["intention", "commitment", "deadline", "confirmed_routine"])
      .default("intention"),
  })
  .strict();
const patchSchema = activitySchema.partial().strict();
const statusSchema = z.enum(["planned", "completed", "skipped"]);
export const preferenceSchema = z
  .object({
    timezone: z.string().refine((v) => {
      try {
        if (v !== "UTC" && !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)+$/.test(v))
          return false;
        new Intl.DateTimeFormat("en", { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }, "Invalid IANA timezone"),
    wakeTime: time,
    sleepTime: time,
    brief: z.string().max(6000),
  })
  .strict();
export function emptyState() {
  return {
    tasks: [],
    preferences: {
      timezone: "Asia/Kolkata",
      wakeTime: "07:00",
      sleepTime: "23:00",
      brief: "",
    },
    history: [],
    lastAIUpdate: null,
    updatedAt: null,
  };
}
export const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function protect(old, next, source) {
  if (source !== "AI" || !old) return;
  old = {
    ...old,
    kind: old.kind || (old.fixed ? "commitment" : "intention"),
    occurrence: old.occurrence ?? null,
  };
  if (next)
    next = {
      ...next,
      kind: next.kind || (next.fixed ? "commitment" : "intention"),
      occurrence: next.occurrence ?? null,
    };
  if (old.status === "completed" && !same(old, next))
    problem(
      "PROTECTED_ACTIVITY",
      "Completed activities are read-only to AI. Ask the user to edit them in Dayweave.",
      { id: old.id },
    );
  if (
    old.fixed &&
    (!next ||
      Object.keys({ ...old, ...next }).some(
        (key) =>
          ![
            "notes",
            "reminderMinutes",
            "status",
            "source",
            "updatedAt",
          ].includes(key) && !same(old[key], next[key]),
      ))
  )
    problem(
      "PROTECTED_ACTIVITY",
      "Fixed activity: AI may change only notes, reminderMinutes and progress status; its title, schedule, category, kind and fixed flag require a user edit.",
      { id: old.id },
    );
}
function snapshot(state, label, summary) {
  return {
    tasks: state.tasks,
    preferences: state.preferences,
    lastAIUpdate: state.lastAIUpdate,
    label,
    summary,
    at: new Date().toISOString(),
  };
}
export function changesBetween(before, after) {
  const a = new Map(before.tasks.map((t) => [t.id, t])),
    b = new Map(after.tasks.map((t) => [t.id, t]));
  const records = [];
  for (const key of new Set([...a.keys(), ...b.keys()]))
    if (!same(a.get(key), b.get(key)))
      records.push({
        id: key,
        before: a.get(key) || null,
        after: b.get(key) || null,
      });
  const preferences = {};
  for (const key of Object.keys(after.preferences))
    if (!same(before.preferences[key], after.preferences[key]))
      preferences[key] = {
        before: before.preferences[key],
        after: after.preferences[key],
      };
  return { records, preferences };
}
export function describe(delta) {
  const created = [],
    updated = [],
    deleted = [];
  for (const { id, before, after } of delta.records) {
    if (!before)
      created.push({
        id,
        title: after.title,
        date: after.date,
        time: after.time,
      });
    else if (!after) deleted.push({ id, title: before.title });
    else
      updated.push({
        id,
        title: after.title,
        fields: Object.keys(after).filter(
          (k) =>
            !["source", "updatedAt"].includes(k) && !same(before[k], after[k]),
        ),
        from: {
          date: before.date,
          time: before.time,
          duration: before.duration,
        },
        to: { date: after.date, time: after.time, duration: after.duration },
      });
  }
  return {
    created,
    updated,
    deleted,
    preferences: Object.keys(delta.preferences),
  };
}
export function summaryOf(changes) {
  const pieces = [];
  if (changes.created.length)
    pieces.push(`Added ${changes.created.map((t) => t.title).join(", ")}`);
  if (changes.updated.length)
    pieces.push(
      `Updated ${changes.updated.map((t) => t.title + " (" + (t.fields.some((f) => ["date", "time"].includes(f)) ? `${t.from.date} ${t.from.time} → ${t.to.date} ${t.to.time}; ` : "") + (t.fields.includes("duration") ? `${t.from.duration} → ${t.to.duration} min; ` : "") + t.fields.filter((f) => !["date", "time", "duration"].includes(f)).join(", ") + ")").join("; ")}`,
    );
  if (changes.deleted.length)
    pieces.push(`Removed ${changes.deleted.map((t) => t.title).join(", ")}`);
  if (changes.preferences.length)
    pieces.push("Changed " + changes.preferences.join(", "));
  return pieces.join(". ") || "No planner changes needed.";
}
export function reverseOperation(state, delta, targetOperationId) {
  const next = structuredClone(state);
  for (const change of delta.records) {
    const current = state.tasks.find((t) => t.id === change.id) || null;
    if (!same(current, change.after))
      problem(
        "RECOVERY_CONFLICT",
        "An activity changed after this operation; reread and replan instead of undoing it.",
        { id: change.id, targetOperationId },
      );
    protect(current, change.before, "AI");
    if (change.before) {
      const parsed = activitySchema.parse(
        Object.fromEntries(
          Object.entries(change.before).filter(
            ([k]) => !["status", "source", "updatedAt"].includes(k),
          ),
        ),
      );
      resolveStart(parsed, state.preferences.timezone);
    }
    next.tasks = next.tasks.filter((t) => t.id !== change.id);
    if (change.before) next.tasks.push(change.before);
  }
  for (const [key, values] of Object.entries(delta.preferences)) {
    if (!same(state.preferences[key], values.after))
      problem(
        "RECOVERY_CONFLICT",
        "Preferences changed after this operation; reread and replan.",
        { field: key, targetOperationId },
      );
    next.preferences[key] = values.before;
  }
  if (delta.preferences.timezone && state.tasks.length)
    problem(
      "RECOVERY_CONFLICT",
      "AI cannot reverse timezone changes on an existing planner. Ask the user.",
      { targetOperationId },
    );
  const changes = describe(changesBetween(state, next)),
    summary =
      "Reversed operation " + targetOperationId + ". " + summaryOf(changes);
  if (!delta.records.length && !Object.keys(delta.preferences).length)
    return {
      state: next,
      result: {
        restored: true,
        targetOperationId,
        changes,
        summary: "No planner changes to reverse.",
      },
      mutated: false,
    };
  next.history = [
    snapshot(state, "AI · reverse_operation", summary),
    ...state.history,
  ].slice(0, 12);
  next.lastAIUpdate = new Date().toISOString();
  return {
    state: next,
    result: { restored: true, targetOperationId, changes, summary },
    mutated: true,
  };
}
export function runTool(state, name, args, source = "AI") {
  const next = structuredClone(state);
  let result;
  if (name === "get_day_plan" || name === "get_planning_context") {
    const a = (
      name === "get_day_plan"
        ? z.object({
            date,
            offset: z.number().int().min(0).default(0),
            limit: z.number().int().min(1).max(200).default(100),
          })
        : z.object({
            date: date.optional(),
            days: z.number().int().min(1).max(14).default(7),
            offset: z.number().int().min(0).default(0),
            limit: z.number().int().min(1).max(200).default(100),
          })
    )
      .strict()
      .parse(args);
    const first = a.date || dayKey(state.preferences.timezone),
      last = name === "get_day_plan" ? first : shiftDay(first, a.days - 1);
    const all =
      name === "get_day_plan"
        ? tasksForDay(state.tasks, first, state.preferences.timezone)
        : state.tasks
            .filter(
              (t) =>
                (t.date >= first && t.date <= last) ||
                (t.date < first &&
                  tasksForDay([t], first, state.preferences.timezone).length),
            )
            .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    const tasks = all.slice(a.offset, a.offset + a.limit).map((t) => {
      const normalized = {
        ...t,
        kind: t.kind || (t.fixed ? "commitment" : "intention"),
        occurrence: t.occurrence ?? null,
      };
      try {
        const times = interval(t, state.preferences.timezone);
        return {
          ...normalized,
          startInstant: times.start.toInstant().toString(),
          endInstant: times.end.toInstant().toString(),
        };
      } catch {
        return normalized;
      }
    });
    return {
      state,
      result: {
        date: first,
        through: last,
        preferences: state.preferences,
        tasks,
        total: all.length,
        nextOffset:
          a.offset + tasks.length < all.length ? a.offset + tasks.length : null,
        lastAIUpdate: state.lastAIUpdate,
        updatedAt: state.updatedAt || null,
        lastChangeSummary: state.lastChangeSummary || null,
        timeIssues: tasks.flatMap((t) => {
          try {
            resolveStart(t, state.preferences.timezone);
            return [];
          } catch (e) {
            return [{ id: t.id, code: e.code, message: e.message }];
          }
        }),
        contextPolicy:
          "confirmed_routine = user-confirmed routine; commitment = dated commitment; deadline = due marker; intention = tentative/flexible. Do not turn intentions into fixed commitments or roll unfinished tasks forward automatically.",
      },
      mutated: false,
    };
  }
  if (name === "import_backup" && source !== "You")
    problem(
      "PROTECTED_ACTIVITY",
      "Backup import is available only through the authenticated app.",
    );
  if (name === "upsert_activities") {
    const a = z
      .object({
        activities: z.array(patchSchema).max(100).default([]),
        deleteIds: z.array(id).max(100).default([]),
        statusUpdates: z
          .array(z.object({ id, status: statusSchema }).strict())
          .max(100)
          .default([]),
      })
      .strict()
      .parse(args);
    if (
      a.activities.length + a.deleteIds.length + a.statusUpdates.length < 1 ||
      a.activities.length + a.deleteIds.length + a.statusUpdates.length > 100
    )
      throw Error("A batch must contain 1–100 total changes");
    const ids = new Set();
    const touch = (key) => {
      if (ids.has(key)) throw Error("Duplicate activity ID in batch");
      ids.add(key);
    };
    const saved = [];
    for (const patch of a.activities) {
      const key = patch.id || crypto.randomUUID();
      touch(key);
      const old = next.tasks.find((t) => t.id === key);
      const merged = { ...old, ...patch, id: key };
      if (
        old &&
        ((patch.date !== undefined && patch.date !== old.date) ||
          (patch.time !== undefined && patch.time !== old.time)) &&
        patch.occurrence === undefined
      )
        merged.occurrence = null;
      if (old && !old.kind)
        merged.kind = old.fixed ? "commitment" : "intention";
      if (!old && !patch.kind && patch.fixed && source === "You")
        merged.kind = "commitment";
      const clean = Object.fromEntries(
        Object.entries(merged).filter(
          ([k]) => !["status", "source", "updatedAt"].includes(k),
        ),
      );
      const item = activitySchema.parse(clean);
      if (item.fixed && item.kind === "intention" && !old)
        problem(
          "PROTECTED_ACTIVITY",
          "Tentative intentions cannot be fixed. A fixed activity must be an explicit commitment or confirmed routine.",
        );
      resolveStart(item, state.preferences.timezone);
      const candidate = {
        ...item,
        status: old?.status || "planned",
        source,
        updatedAt: new Date().toISOString(),
      };
      // An exact no-op must not make a completed item appear edited merely due to metadata.
      if (
        old &&
        Object.entries(item).every(([k, v]) =>
          same(
            old[k] ??
              (k === "occurrence"
                ? null
                : k === "kind"
                  ? old.fixed
                    ? "commitment"
                    : "intention"
                  : undefined),
            v,
          ),
        )
      ) {
        saved.push(old);
        continue;
      }
      protect(old, candidate, source);
      next.tasks = next.tasks.filter((t) => t.id !== key);
      next.tasks.push(candidate);
      saved.push(candidate);
    }
    for (const key of a.deleteIds) {
      touch(key);
      const old = next.tasks.find((t) => t.id === key);
      if (!old) throw Error("Activity not found");
      protect(old, null, source);
      next.tasks = next.tasks.filter((t) => t.id !== key);
    }
    for (const change of a.statusUpdates) {
      touch(change.id);
      const t = next.tasks.find((t) => t.id === change.id);
      if (!t) throw Error("Activity not found");
      if (t.status !== change.status) {
        const after = {
          ...t,
          status: change.status,
          updatedAt: new Date().toISOString(),
        };
        protect(t, after, source);
        Object.assign(t, after);
      }
    }
    if (next.tasks.length > 3000)
      throw Error("Task limit reached; export and remove older activities");
    result = { saved };
  } else if (name === "set_activity_status") {
    const a = z.object({ id, status: statusSchema }).strict().parse(args),
      t = next.tasks.find((t) => t.id === a.id);
    if (!t) throw Error("Activity not found");
    if (t.status !== a.status) {
      const after = {
        ...t,
        status: a.status,
        updatedAt: new Date().toISOString(),
      };
      protect(t, after, source);
      Object.assign(t, after);
    }
    result = { activity: t };
  } else if (name === "delete_activity") {
    const a = z.object({ id }).strict().parse(args),
      t = next.tasks.find((t) => t.id === a.id);
    if (!t) throw Error("Activity not found");
    protect(t, null, source);
    next.tasks = next.tasks.filter((t) => t.id !== a.id);
    result = { deleted: a.id };
  } else if (name === "import_backup") {
    const a = z
      .object({
        tasks: z
          .array(
            activitySchema.extend({
              id,
              status: statusSchema.default("planned"),
              source: z.string().optional(),
              updatedAt: z.string().optional(),
            }),
          )
          .max(3000),
        preferences: preferenceSchema,
      })
      .passthrough()
      .parse({
        ...args,
        tasks: Array.isArray(args?.tasks)
          ? args.tasks.map((t) => ({
              ...t,
              kind: t.kind || (t.fixed ? "commitment" : "intention"),
            }))
          : args?.tasks,
      });
    if (new Set(a.tasks.map((t) => t.id)).size !== a.tasks.length)
      throw Error("Backup has duplicate activity IDs");
    const merged = new Map(next.tasks.map((t) => [t.id, t]));
    for (const t of a.tasks) {
      resolveStart(t, a.preferences.timezone);
      merged.set(t.id, {
        ...t,
        source: "Import",
        updatedAt: new Date().toISOString(),
      });
    }
    if (merged.size > 3000)
      throw Error("Import would exceed the activity limit");
    if (a.preferences.timezone !== state.preferences.timezone)
      for (const t of merged.values()) resolveStart(t, a.preferences.timezone);
    next.tasks = [...merged.values()];
    next.preferences = a.preferences;
    result = { imported: a.tasks.length };
  } else if (name === "update_preferences") {
    const a = preferenceSchema
      .extend({ confirmTimezoneChange: z.boolean().optional() })
      .parse(args);
    const { confirmTimezoneChange, ...preferences } = a;
    if (
      preferences.timezone !== state.preferences.timezone &&
      state.tasks.length
    ) {
      if (source === "AI" || !confirmTimezoneChange)
        problem(
          "PROTECTED_ACTIVITY",
          "Changing timezone reinterprets existing wall-clock activities. Confirm this change in Dayweave.",
        );
      for (const t of state.tasks) resolveStart(t, preferences.timezone);
    }
    next.preferences = preferences;
    result = { preferences };
  } else if (name === "undo_last_change") {
    if (source === "AI")
      problem(
        "RECOVERY_CONFLICT",
        "AI reversal requires targetOperationId from an accepted AI operation.",
      );
    const h = next.history.shift();
    if (!h) throw Error("Nothing to undo");
    next.tasks = h.tasks;
    next.preferences = h.preferences;
    next.lastAIUpdate = h.lastAIUpdate;
    return {
      state: next,
      result: {
        restored: true,
        summary: "Undid the most recent saved change.",
      },
      mutated: true,
    };
  } else throw Error("Unknown tool");
  const delta = changesBetween(state, next),
    changes = describe(delta),
    summary = summaryOf(changes),
    mutated =
      delta.records.length > 0 || Object.keys(delta.preferences).length > 0;
  if (mutated) {
    next.history = [
      snapshot(state, source + " · " + name, summary),
      ...state.history,
    ].slice(0, 12);
    if (source === "AI") next.lastAIUpdate = new Date().toISOString();
  }
  return { state: next, result: { ...result, changes, summary }, mutated };
}

const props = {
  id: { type: "string" },
  title: { type: "string" },
  date: { type: "string", description: "YYYY-MM-DD in saved timezone" },
  time: { type: "string", description: "Local HH:mm" },
  duration: {
    type: "integer",
    minimum: 5,
    maximum: 1440,
    description: "Elapsed minutes, including across DST/midnight",
  },
  category: {
    type: "string",
    enum: ["Focus", "Learning", "Wellbeing", "Personal"],
  },
  notes: {
    type: "string",
    description:
      "Omitted preserves existing notes; empty string explicitly clears.",
  },
  fixed: { type: "boolean" },
  reminderMinutes: {
    type: ["integer", "null"],
    description: "Omitted preserves; null clears.",
  },
  occurrence: {
    type: ["string", "null"],
    enum: ["earlier", "later", null],
    description:
      "Explicit choice for repeated DST times; nonexistent times are rejected.",
  },
  kind: {
    type: "string",
    enum: ["intention", "commitment", "deadline", "confirmed_routine"],
  },
};
const obj = (properties, required = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const control = {
  operationId: {
    type: "string",
    minLength: 8,
    maxLength: 128,
    description:
      "Stable unique operation ID. Retry identical input/version with this same ID after lost response. New input requires a NEW ID.",
  },
  expectedVersion: {
    type: ["string", "null"],
    description:
      "Required version from last read; null only for an empty planner. A conflict requires reread/replan, not blind retry.",
  },
};
const tool = (name, description, schema, read = false) => ({
  name,
  description,
  inputSchema: read
    ? schema
    : {
        ...schema,
        properties: { ...schema.properties, ...control },
        required: [...schema.required, "operationId", "expectedVersion"],
      },
  annotations: {
    readOnlyHint: read,
    destructiveHint: ["delete_activity", "undo_last_change"].includes(name),
    idempotentHint: true,
    openWorldHint: false,
  },
});
export const tools = [
  tool(
    "get_day_plan",
    "Read activities intersecting this local day, including overnight spillover. Follow nextOffset until null before planning.",
    obj(
      {
        date: props.date,
        offset: { type: "integer", minimum: 0 },
        limit: { type: "integer", minimum: 1, maximum: 200 },
      },
      ["date"],
    ),
    true,
  ),
  tool(
    "get_planning_context",
    "Read bounded planning context (default today + 6 days, 100 records). Confirmed routines/commitments differ from tentative intentions. Follow nextOffset; never assume other conversations.",
    obj({
      date: props.date,
      days: { type: "integer", minimum: 1, maximum: 14 },
      offset: { type: "integer", minimum: 0 },
      limit: { type: "integer", minimum: 1, maximum: 200 },
    }),
    true,
  ),
  tool(
    "upsert_activities",
    "One atomic batch of 1–100 upserts, deletions and progress updates. Existing IDs use partial updates: omission preserves values. New activities require title/date/time/duration. All validate before committing. Fixed fields and completed records are protected. Never automatically roll unfinished intentions forward.",
    obj({
      activities: { type: "array", maxItems: 100, items: obj(props) },
      deleteIds: { type: "array", maxItems: 100, items: { type: "string" } },
      statusUpdates: {
        type: "array",
        maxItems: 100,
        items: obj(
          {
            id: props.id,
            status: {
              type: "string",
              enum: ["planned", "completed", "skipped"],
            },
          },
          ["id", "status"],
        ),
      },
    }),
  ),
  tool(
    "set_activity_status",
    "Mark progress; completed records cannot be reopened by AI.",
    obj(
      {
        id: props.id,
        status: { type: "string", enum: ["planned", "completed", "skipped"] },
      },
      ["id", "status"],
    ),
  ),
  tool(
    "delete_activity",
    "Delete one requested flexible, uncompleted activity.",
    obj({ id: props.id }, ["id"]),
  ),
  tool(
    "update_preferences",
    "Save user-confirmed routine anchors and a concise life brief. Existing planner timezone changes require explicit confirmation in the app.",
    obj(
      {
        timezone: { type: "string" },
        wakeTime: props.time,
        sleepTime: props.time,
        brief: { type: "string" },
      },
      ["timezone", "wakeTime", "sleepTime", "brief"],
    ),
  ),
  tool(
    "undo_last_change",
    "Reverse the identified accepted AI operation only if its touched records are still reversible. Preserves unrelated later edits; conflicts on changed/protected records. Manual app undo is separate.",
    obj(
      { targetOperationId: { type: "string", minLength: 8, maxLength: 128 } },
      ["targetOperationId"],
    ),
  ),
];
