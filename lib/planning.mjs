import { Temporal } from "@js-temporal/polyfill";
import { problem } from "./errors.mjs";
export function dayKey(timezone, instant = new Date()) {
  return Temporal.Instant.from(instant.toISOString())
    .toZonedDateTimeISO(timezone)
    .toPlainDate()
    .toString();
}
export function shiftDay(day, n) {
  return Temporal.PlainDate.from(day).add({ days: n }).toString();
}
export function weekDays(day) {
  const d = Temporal.PlainDate.from(day);
  const monday = d.subtract({ days: d.dayOfWeek - 1 });
  return Array.from({ length: 7 }, (_, i) =>
    monday.add({ days: i }).toString(),
  );
}
export function minutes(time) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
export function resolveStart(task, timezone) {
  const local = Temporal.PlainDateTime.from(task.date + "T" + task.time);
  const fields = {
    timeZone: timezone,
    year: local.year,
    month: local.month,
    day: local.day,
    hour: local.hour,
    minute: local.minute,
  };
  const early = Temporal.ZonedDateTime.from(fields, {
      disambiguation: "earlier",
    }),
    late = Temporal.ZonedDateTime.from(fields, { disambiguation: "later" });
  if (
    !early.toPlainDateTime().equals(local) ||
    !late.toPlainDateTime().equals(local)
  )
    problem(
      "NONEXISTENT_LOCAL_TIME",
      `${task.date} ${task.time} does not exist in ${timezone}. Choose another time.`,
      { id: task.id, date: task.date, time: task.time, timezone },
    );
  if (
    early.epochNanoseconds !== late.epochNanoseconds &&
    !["earlier", "later"].includes(task.occurrence)
  )
    problem(
      "AMBIGUOUS_LOCAL_TIME",
      `${task.date} ${task.time} occurs twice in ${timezone}. Choose occurrence earlier or later.`,
      { id: task.id, choices: ["earlier", "later"], timezone },
    );
  return task.occurrence === "later" ? late : early;
}
export function interval(task, timezone = "UTC") {
  const start = resolveStart(task, timezone);
  return { start, end: start.add({ minutes: task.duration || 0 }) };
}
export function appearsOnDay(task, day, timezone) {
  try {
    const { start, end } = interval(task, timezone);
    const begin = Temporal.PlainDate.from(day).toZonedDateTime(timezone),
      finish = Temporal.PlainDate.from(day)
        .add({ days: 1 })
        .toZonedDateTime(timezone);
    return (
      start.epochNanoseconds < finish.epochNanoseconds &&
      end.epochNanoseconds > begin.epochNanoseconds
    );
  } catch {
    return task.date === day;
  }
}
export function tasksForDay(tasks, day, timezone) {
  return tasks
    .filter((t) => appearsOnDay(t, day, timezone))
    .sort((a, b) => {
      try {
        return (
          Number(interval(a, timezone).start.epochMilliseconds) -
          Number(interval(b, timezone).start.epochMilliseconds)
        );
      } catch {
        return a.time.localeCompare(b.time);
      }
    });
}
export function conflicts(tasks, timezone = "UTC") {
  const active = tasks
    .filter((t) => t.status !== "skipped")
    .flatMap((t) => {
      try {
        const { start, end } = interval(t, timezone);
        return [
          {
            ...t,
            start: Number(start.epochMilliseconds),
            end: Number(end.epochMilliseconds),
          },
        ];
      } catch {
        return [];
      }
    })
    .sort((a, b) => a.start - b.start);
  const ids = new Set();
  for (let i = 0; i < active.length; i++)
    for (
      let j = i + 1;
      j < active.length && active[j].start < active[i].end;
      j++
    ) {
      ids.add(active[i].id);
      ids.add(active[j].id);
    }
  return ids;
}
export function notifyDue(task, timezone, now = new Date()) {
  if (task.status !== "planned" || task.reminderMinutes == null) return false;
  try {
    const start = Number(resolveStart(task, timezone).epochMilliseconds),
      due = start - task.reminderMinutes * 60000;
    return +now >= due && +now < start + 60000;
  } catch {
    return false;
  }
}
export function endLabel(task, timezone) {
  try {
    const end = interval(task, timezone).end;
    return `${end.hour.toString().padStart(2, "0")}:${end.minute.toString().padStart(2, "0")}${end.toPlainDate().toString() !== task.date ? " · " + end.toPlainDate() : ""}`;
  } catch {
    return "Time needs review";
  }
}
export function currentAndNext(tasks, timezone, now = new Date()) {
  const valid = tasks
    .filter((t) => t.status === "planned")
    .flatMap((t) => {
      try {
        const i = interval(t, timezone);
        return [
          {
            task: t,
            start: Number(i.start.epochMilliseconds),
            end: Number(i.end.epochMilliseconds),
          },
        ];
      } catch {
        return [];
      }
    })
    .sort((a, b) => a.start - b.start);
  return {
    current: valid.find((t) => t.start <= +now && t.end > +now)?.task || null,
    nextFixed: valid.find((t) => t.task.fixed && t.start > +now)?.task || null,
  };
}
