"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import FocusTimer from "./focus-timer";
import {
  cachePrefix,
  readDeviceSnapshot,
  clearDeviceSnapshot,
} from "@/lib/device-cache.mjs";
import {
  dayKey,
  shiftDay,
  weekDays,
  conflicts,
  notifyDue,
  tasksForDay,
  currentAndNext,
  endLabel,
  resolveStart,
} from "@/lib/planning.mjs";
import {
  Sun,
  CalendarDays,
  Check,
  Plus,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  PlugZap,
  Settings2,
  Undo2,
  X,
  Clock,
  MoreHorizontal,
  Download,
  Bell,
  Leaf,
  Sparkles,
  BookOpen,
  Target,
  CheckCircle2,
  Copy,
  Trash2,
  Search,
  WifiOff,
  RefreshCw,
  Upload,
  ShieldCheck,
  History,
  Play,
  CalendarRange,
  Lock,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
type Task = {
  id: string;
  title: string;
  date: string;
  time: string;
  duration: number;
  category: string;
  notes: string;
  fixed: boolean;
  reminderMinutes: number | null;
  kind?: "intention" | "commitment" | "deadline" | "confirmed_routine";
  occurrence?: "earlier" | "later" | null;
  status: string;
  source: string;
};
type Pref = {
  timezone: string;
  wakeTime: string;
  sleepTime: string;
  brief: string;
};
type State = {
  tasks: Task[];
  preferences: Pref;
  history: any[];
  lastAIUpdate: string | null;
  version?: string | null;
  scope?: string;
};
const defaults: Pref = {
  timezone: "Asia/Kolkata",
  wakeTime: "07:00",
  sleepTime: "23:00",
  brief: "",
};
const localDate = (tz: string) => dayKey(tz);
const clock = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};
const end = (t: Task) => {
  const [h, m] = t.time.split(":").map(Number);
  let n = (h * 60 + m + t.duration) % 1440;
  return clock(`${Math.floor(n / 60)}:${n % 60}`);
};
const blank = {
  title: "",
  time: "09:00",
  duration: 30,
  category: "Focus",
  notes: "",
  fixed: false,
  reminderMinutes: null as number | null,
};
export default function Planner({
  userId,
  displayName,
}: {
  userId: string;
  displayName: string;
}) {
  const [mcpUrl, setMcpUrl] = useState("/mcp");
  useEffect(() => setMcpUrl(window.location.origin + "/mcp"), []);
  const cacheKey = cachePrefix(userId);
  const [online, setOnline] = useState(true);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [focusTask, setFocusTask] = useState<Task | null>(null);
  const [importData, setImportData] = useState<any>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [cacheEnabled, setCacheEnabled] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const cacheRef = useRef(false);
  const loadSeq = useRef(0);
  const editVersion = useRef<string | null>(null);

  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);
  const [writeError, setWriteError] = useState("");
  const [lastReminderAttempt, setLastReminderAttempt] = useState("");
  const [timezoneConfirmed, setTimezoneConfirmed] = useState(false);
  const [state, setState] = useState<State>({
    tasks: [],
    preferences: defaults,
    history: [],
    lastAIUpdate: null,
  });
  const [date, setDate] = useState("");
  const [view, setView] = useState("Today");
  const [modal, setModal] = useState<string | null>(null);
  const [form, setForm] = useState<any>(blank);
  const [prefs, setPrefs] = useState(defaults);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [reminders, setReminders] = useState(false);
  const [filter, setFilter] = useState("All");
  function clearPrivateView() {
    try {
      clearDeviceSnapshot(localStorage, userId);
    } catch {}
    setState({
      tasks: [],
      preferences: defaults,
      history: [],
      lastAIUpdate: null,
    });
    setSyncedAt(null);
    setModal(null);
    setFocusTask(null);
    cacheRef.current = false;
    setCacheEnabled(false);
  }
  const load = useCallback(async () => {
    const sequence = ++loadSeq.current;
    try {
      const r = await fetch("/api/planner", { cache: "no-store" });
      if (r.status === 401) {
        clearPrivateView();
      }
      if (!r.ok)
        throw Error(
          r.status === 401
            ? "Your session expired. Sign in again to continue."
            : "Could not sync your planner. Your last view is still available.",
        );
      const s = (await r.json()) as State;
      if (sequence !== loadSeq.current) return;
      if (s.scope !== userId) {
        clearPrivateView();
        setOnline(false);
        throw Error("Your signed-in account changed. Reload this page.");
      }
      setState(s);
      setDate((d) => d || localDate(s.preferences.timezone));
      setOnline(true);
      setError("");
      const at = new Date().toISOString();
      setSyncedAt(at);
      if (cacheRef.current) {
        try {
          localStorage.setItem(cacheKey, JSON.stringify({ state: s, at }));
        } catch {
          setToast("Device storage is full. Your cloud plan is still saved.");
        }
      }
      setLoaded(true);
    } catch (e) {
      if (sequence !== loadSeq.current) return;
      setOnline(false);
      setError(e instanceof Error ? e.message : "Could not load planner");
      setLoaded(true);
    }
  }, [cacheKey, userId]);
  useEffect(() => {
    try {
      const enabled = localStorage.getItem(cacheKey + ":enabled") === "yes";
      cacheRef.current = enabled;
      setCacheEnabled(enabled);
      if (enabled) {
        const cached = readDeviceSnapshot(localStorage, userId);
        if (cached) {
          setState(cached.state);
          setDate(localDate(cached.state.preferences.timezone));
          setSyncedAt(cached.at);
          setLoaded(true);
        }
      }
      setReminders(localStorage.getItem(cacheKey + ":reminders") === "yes");
      setShowWelcome(!localStorage.getItem(cacheKey + ":welcome"));
    } catch {}
    load();
    const refresh = () => {
      if (document.visibilityState === "visible") load();
    };
    const onOffline = () => setOnline(false);
    const timer = setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", load);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", load);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load, cacheKey]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (!reminders) return;
    const tick = () => {
      for (const t of state.tasks) {
        if (!notifyDue(t, state.preferences.timezone)) continue;
        const key =
          cacheKey +
          `:reminded:${t.id}:${resolveStart(t, state.preferences.timezone).toInstant().toString()}:${t.reminderMinutes}`;
        try {
          if (localStorage.getItem(key)) continue;
          localStorage.setItem(key, "1");
        } catch {}
        setToast(`Coming up: ${t.title} at ${clock(t.time)}`);
        setLastReminderAttempt(new Date().toISOString());
        if ("Notification" in window && Notification.permission === "granted") {
          try {
            new Notification("Dayweave · Coming up", {
              body: `${t.title} · ${clock(t.time)}`,
            });
          } catch {}
        }
      }
    };
    tick();
    const id = setInterval(tick, 15000);
    return () => clearInterval(id);
  }, [state, reminders, cacheKey]);
  async function act(name: string, args: any, versionOverride?: string | null) {
    if (!online) {
      setToast("You’re viewing a saved snapshot. Reconnect to make changes.");
      return false;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/planner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          args,
          operationId: crypto.randomUUID(),
          expectedVersion:
            versionOverride === undefined
              ? (state.version ?? null)
              : versionOverride,
          scope: userId,
        }),
      });
      const data = (await r.json()) as {
        error?: string;
        result?: { summary?: string };
      };
      if (!r.ok) {
        if (r.status === 401) {
          ++loadSeq.current;
          clearPrivateView();
          setOnline(false);
          setError("Your session expired. Sign in again to continue.");
        }
        if (r.status === 409) await load();
        throw Error(data.error || "Could not save");
      }
      await load();
      setWriteError("");
      if (data.result?.summary) setToast(data.result.summary);
      return true;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not save";
      setWriteError(message);
      setToast(message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  function toggleCache(enabled: boolean) {
    cacheRef.current = enabled;
    setCacheEnabled(enabled);
    try {
      localStorage.setItem(cacheKey + ":enabled", enabled ? "yes" : "no");
      if (enabled)
        localStorage.setItem(cacheKey, JSON.stringify({ state, at: syncedAt }));
      else localStorage.removeItem(cacheKey);
      setToast(
        enabled
          ? "Device snapshot enabled. Avoid this on shared devices."
          : "Device snapshot removed.",
      );
    } catch {
      setToast("Device storage is unavailable.");
    }
  }
  async function readBackup(file?: File) {
    if (!file) return;
    try {
      if (file.size > 8000000)
        throw Error("Choose a JSON backup smaller than 8 MB.");
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.tasks) || !data.preferences)
        throw Error("This is not a Dayweave backup.");
      setImportData(data);
      setModal("import");
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Could not read backup");
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  }
  async function copyDay() {
    const target = shiftDay(date, 1);
    const activities = dayTasks
      .filter((t) => t.status !== "skipped" && t.date === date)
      .map(
        ({
          id,
          title,
          time,
          duration,
          category,
          notes,
          fixed,
          reminderMinutes,
          kind,
          occurrence,
        }) => ({
          id: `copy-${id.slice(0, 55)}-${target}`,
          title,
          date: target,
          time,
          duration,
          category,
          notes,
          fixed,
          reminderMinutes,
          kind,
          occurrence,
        }),
      );
    if (!activities.length) {
      setToast("There are no activities to copy.");
      return;
    }
    if (await act("upsert_activities", { activities })) {
      setDate(target);
      setToast("Copied to tomorrow. Existing matching copies were updated.");
    }
  }
  useEffect(() => {
    if (!modal) return;
    setTimezoneConfirmed(false);
    editVersion.current = state.version ?? null;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector('[role="dialog"]');
    const controls = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary",
        ) || [],
      ).filter((el) => el.offsetParent !== null);
    const timer = setTimeout(() => controls()[0]?.focus(), 0);
    const keyboard = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setModal(null);
        return;
      }
      if (e.key === "Tab") {
        const els = controls();
        const first = els[0],
          last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", keyboard);
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", keyboard);
      document.body.style.overflow = old;
      previous?.focus();
    };
  }, [modal]);
  const dayTasks: Task[] = date
    ? tasksForDay(state.tasks, date, state.preferences.timezone)
    : [];
  const done = dayTasks.filter((t) => t.status === "completed").length;
  const totalMinutes = dayTasks
    .filter((t) => t.status !== "skipped")
    .reduce((n, t) => n + t.duration, 0);
  const tasks = dayTasks.filter(
    (t) =>
      (view !== "Completed" || t.status === "completed") &&
      (filter === "All" || t.category === filter) &&
      `${t.title} ${t.notes}`.toLowerCase().includes(query.toLowerCase()),
  );
  const overlaps = conflicts(state.tasks, state.preferences.timezone);
  const live = currentAndNext(state.tasks, state.preferences.timezone, now);
  const week = date ? weekDays(date) : [];
  const dateLabel = date
    ? new Date(date + "T12:00:00").toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      })
    : "Your day";
  function move(n: number) {
    const d = new Date(
      (date || localDate(state.preferences.timezone)) + "T12:00:00",
    );
    d.setDate(d.getDate() + n);
    setDate(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    );
  }
  function edit(t?: Task) {
    setForm(
      t
        ? { ...t }
        : { ...blank, date: date || localDate(state.preferences.timezone) },
    );
    setModal("task");
  }
  async function sample() {
    const d = date || localDate(state.preferences.timezone);
    const data = [
      {
        id: `demo-meeting-${d}`,
        title: "Demo: team meeting",
        time: "10:00",
        duration: 60,
        category: "Personal",
        notes: "Fictional fixed commitment.",
        fixed: true,
        kind: "commitment",
      },
      {
        id: `demo-work-${d}`,
        title: "Demo: assignment focus",
        time: "13:00",
        duration: 90,
        category: "Focus",
        notes: "Flexible work; leave the rest of the afternoon open.",
        fixed: false,
        kind: "intention",
      },
      {
        id: `demo-guitar-${d}`,
        title: "Demo: guitar practice",
        time: "18:00",
        duration: 30,
        category: "Learning",
        notes: "A little practice, with unscheduled time around it.",
        fixed: false,
        kind: "intention",
      },
      {
        id: `demo-bed-${d}`,
        title: "Demo: bedtime",
        time: "23:00",
        duration: 60,
        category: "Wellbeing",
        notes: "Fictional fixed wind-down anchor.",
        fixed: true,
        kind: "confirmed_routine",
      },
    ].map((t) => ({ ...t, date: d, reminderMinutes: 5 }));
    if (await act("upsert_activities", { activities: data })) {
      setToast(
        "Fictional demonstration added: fixed meeting/bedtime, flexible work and free time. You can edit or undo.",
      );
    }
  }
  async function enableReminders() {
    if (reminders) {
      setReminders(false);
      try {
        localStorage.setItem(cacheKey + ":reminders", "no");
      } catch {}
      return;
    }
    let permission = "unavailable";
    if ("Notification" in window) {
      try {
        permission = await Notification.requestPermission();
      } catch {}
    }
    setReminders(true);
    try {
      localStorage.setItem(cacheKey + ":reminders", "yes");
    } catch {}
    setToast(
      permission === "granted"
        ? "Browser notifications enabled while this app is open."
        : "In-app nudges enabled. Browser notifications are unavailable or blocked.",
    );
  }
  async function exportData() {
    try {
      const r = await fetch("/api/planner", { cache: "no-store" });
      if (!r.ok) {
        clearPrivateView();
        setToast("Sign in again before exporting.");
        return;
      }
      const fresh = await r.json();
      if (fresh.scope !== userId) {
        clearPrivateView();
        setToast("Account changed. Reload before exporting.");
        return;
      }
      const blob = new Blob(
        [
          JSON.stringify(
            {
              format: "dayweave-backup",
              schemaVersion: 2,
              exportedAt: new Date().toISOString(),
              tasks: fresh.tasks,
              preferences: fresh.preferences,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      );
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "dayweave-backup.json";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      setWriteError(
        "Backup export could not recheck your account. Reconnect and retry.",
      );
    }
  }
  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href="/">
          <span className="brandmark">
            <Sun size={24} />
          </span>
          dayweave<span className="branddot">.</span>
        </a>
        <div className="workspace">YOUR LITTLE CORNER OF CALM</div>
        <nav>
          {[
            ["Today", Sun],
            ["Week", CalendarRange],
            ["Completed", CheckCircle2],
            ["Activity log", History],
            ["AI connection", PlugZap],
            ["Your routine", Settings2],
          ].map(([label, Icon]: any) => (
            <button
              key={label}
              className={view === label ? "nav active" : "nav"}
              onClick={() => {
                setView(label);
                if (label === "Your routine") {
                  setPrefs(state.preferences);
                  setModal("prefs");
                }
                if (label === "AI connection") setModal("connect");
              }}
            >
              <Icon size={19} />
              {label}
              {label === "Today" && (
                <span className="navcount">{dayTasks.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div
          className="sidebar-note"
          style={state.tasks.length ? { display: "none" } : {}}
        >
          <span className="tiny-star">✳</span>
          <h3>
            A plan that moves
            <br />
            with your life.
          </h3>
          <p>
            Let your AI handle the planning.
            <br />
            Make space for the doing.
          </p>
          <button onClick={() => setModal("connect")}>
            Connect your AI <ArrowUpRight size={16} />
          </button>
        </div>
        <div className="sidebottom">
          <span className="avatar">D</span>
          <div>
            {displayName.includes("@")
              ? "My personal space"
              : displayName.split(" ")[0] + "’s space"}
            <small>Private planner · v2.1</small>
          </div>
          <button
            aria-label="Routine settings"
            onClick={() => {
              setPrefs(state.preferences);
              setModal("prefs");
            }}
          >
            <Settings2 size={17} />
          </button>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <a className="textbutton" href="/account">
            Account
          </a>
          <span>
            <span className="online-dot" /> YOUR DAY, A LITTLE LIGHTER
          </span>
          <button className="textbutton" onClick={() => setModal("connect")}>
            <PlugZap size={15} /> MCP connection <ArrowUpRight size={14} />
          </button>
        </header>
        <div className={"content" + (state.tasks.length ? " has-plan" : "")}>
          {writeError && (
            <div className="offlinebanner" role="alert">
              <div>
                <strong>Update not saved</strong>
                <small>{writeError}</small>
              </div>
              <button onClick={() => setWriteError("")}>Dismiss</button>
            </div>
          )}
          {!online && (
            <div className="offlinebanner" role="status">
              <WifiOff size={17} />
              <div>
                <strong>Viewing your last loaded plan</strong>
                <small>
                  {error}{" "}
                  {syncedAt
                    ? "Last synced " + new Date(syncedAt).toLocaleString()
                    : ""}{" "}
                  · Editing is paused.
                </small>
              </div>
              <button onClick={load}>
                <RefreshCw size={15} /> Retry
              </button>
            </div>
          )}
          {showWelcome && !state.tasks.length && (
            <section className="welcome">
              <Sparkles size={25} />
              <div>
                <strong>Welcome to your calmer corner of the day.</strong>
                <p>
                  Start with a few daily anchors, then let your connected AI
                  build around them.
                </p>
              </div>
              <button
                className="primary"
                onClick={() => {
                  setPrefs(state.preferences);
                  setModal("prefs");
                  setShowWelcome(false);
                  localStorage.setItem(cacheKey + ":welcome", "yes");
                }}
              >
                Set my routine <ArrowRight size={14} />
              </button>
              <button
                aria-label="Dismiss welcome"
                onClick={() => {
                  setShowWelcome(false);
                  localStorage.setItem(cacheKey + ":welcome", "yes");
                }}
              >
                <X size={17} />
              </button>
            </section>
          )}
          <section className="heading">
            <div>
              <div className="eyebrow">A LITTLE INTENTION GOES A LONG WAY</div>
              <h1>
                Make room for your day<span>.</span>
              </h1>
              <p>
                A clear plan. A little breathing room. Time for what matters.
              </p>
            </div>
            <button className="primary" onClick={() => edit()}>
              <Plus size={17} /> Add activity
            </button>
          </section>
          <section className="schedule-now" aria-label="Current plan">
            <div>
              <strong>Now</strong>
              <p>
                {live.current
                  ? live.current.title
                  : "Unscheduled time — leave room for interruptions."}
              </p>
            </div>
            <div>
              <strong>Next fixed commitment</strong>
              <p>
                {live.nextFixed
                  ? `${live.nextFixed.title} · ${live.nextFixed.date} ${live.nextFixed.time}`
                  : "No upcoming fixed commitment"}
              </p>
            </div>
          </section>
          {view === "Week" && (
            <section className="weeksection">
              <div className="sectionhead">
                <div>
                  <h2>Your week, at a glance</h2>
                  <p>Click a day to open its daily canvas.</p>
                </div>
                <div className="datecontrols">
                  <button aria-label="Previous week" onClick={() => move(-7)}>
                    <ChevronLeft size={17} />
                  </button>
                  <button
                    onClick={() =>
                      setDate(localDate(state.preferences.timezone))
                    }
                  >
                    This week
                  </button>
                  <button aria-label="Next week" onClick={() => move(7)}>
                    <ChevronRight size={17} />
                  </button>
                </div>
              </div>
              <div className="weekgrid">
                {week.map((d: string) => {
                  const ts: Task[] = tasksForDay(
                    state.tasks,
                    d,
                    state.preferences.timezone,
                  );
                  return (
                    <div
                      className={
                        "weekday " +
                        (d === localDate(state.preferences.timezone)
                          ? "istoday"
                          : "")
                      }
                      key={d}
                    >
                      <button
                        className="dayheading"
                        onClick={() => {
                          setDate(d);
                          setView("Today");
                        }}
                      >
                        <span>
                          {new Date(d + "T12:00:00Z").toLocaleDateString(
                            "en-US",
                            { weekday: "short", timeZone: "UTC" },
                          )}
                        </span>
                        <strong>{Number(d.slice(-2))}</strong>
                        <small>
                          {ts.filter((t) => t.status === "completed").length}/
                          {ts.length} done
                        </small>
                      </button>
                      {ts.map((t) => (
                        <button
                          className={
                            "weekitem " +
                            t.category.toLowerCase() +
                            (t.status === "completed" ? " completed" : "")
                          }
                          key={t.id}
                          onClick={() => edit(t)}
                        >
                          <small>
                            {clock(t.time)} · {t.duration}m
                          </small>
                          <strong>{t.title}</strong>
                          {t.fixed && <Lock size={11} />}
                        </button>
                      ))}
                      <button
                        className="weekadd"
                        onClick={() => {
                          setForm({ ...blank, date: d });
                          setModal("task");
                        }}
                      >
                        <Plus size={14} /> Add
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
          {view === "Activity log" && (
            <section className="activitysection">
              <div className="sectionhead">
                <div>
                  <h2>A little history of your day</h2>
                  <p>
                    The latest {state.history.length} changes. The most recent
                    change can be undone.
                  </p>
                </div>
                <button
                  className="textbutton"
                  disabled={!online || busy || !state.history.length}
                  onClick={() => act("undo_last_change", {})}
                >
                  <Undo2 size={15} /> Undo latest
                </button>
              </div>
              {!state.history.length ? (
                <div className="empty">
                  <History size={30} />
                  <h3>Your changes will appear here.</h3>
                </div>
              ) : (
                state.history.map((h, i) => (
                  <div className="historyrow" key={h.at + "-" + i}>
                    <span
                      className={
                        "historyicon " + (h.label.startsWith("AI") ? "ai" : "")
                      }
                    >
                      {h.label.startsWith("AI") ? (
                        <Sparkles size={17} />
                      ) : (
                        <Check size={17} />
                      )}
                    </span>
                    <div>
                      <strong>
                        {h.label.startsWith("AI") ? "Your AI" : "You"}{" "}
                        {(
                          {
                            upsert_activities: "updated activities",
                            set_activity_status: "updated progress",
                            delete_activity: "removed an activity",
                            update_preferences: "updated your routine",
                            import_backup: "restored a backup",
                          } as Record<string, string>
                        )[h.label.split(" · ")[1]] || "updated the planner"}
                      </strong>
                      <p>
                        {new Date(h.at).toLocaleString()} ·{" "}
                        {h.summary ||
                          `${h.tasks.length} activities before this change`}
                      </p>
                    </div>
                    {i === 0 && <span className="pill">UNDO AVAILABLE</span>}
                  </div>
                ))
              )}
            </section>
          )}
          <div
            className="columns"
            style={
              view === "Week" || view === "Activity log"
                ? { display: "none" }
                : {}
            }
          >
            <section className="planner-section">
              <div className="sectionhead">
                <div>
                  <h2>
                    {view === "Completed"
                      ? "Completed activities"
                      : "Your daily canvas"}
                  </h2>
                  <p>
                    {dateLabel} · {done}/{dayTasks.length} completed
                  </p>
                </div>
                <div className="datecontrols">
                  <button aria-label="Previous day" onClick={() => move(-1)}>
                    <ChevronLeft size={17} />
                  </button>
                  <input
                    aria-label="Plan date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                  <button aria-label="Next day" onClick={() => move(1)}>
                    <ChevronRight size={17} />
                  </button>
                  <button
                    onClick={() =>
                      setDate(localDate(state.preferences.timezone))
                    }
                  >
                    Today
                  </button>
                </div>
              </div>
              <div className="searchrow">
                <Search size={15} />
                <input
                  aria-label="Search this day"
                  placeholder="Find something in your day…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query && (
                  <button
                    aria-label="Clear search"
                    onClick={() => setQuery("")}
                  >
                    <X size={14} />
                  </button>
                )}
                <button
                  className="textbutton"
                  aria-label="Refresh plan"
                  onClick={load}
                >
                  <RefreshCw size={14} />
                </button>
              </div>
              <div className="filters">
                {["All", "Focus", "Learning", "Wellbeing", "Personal"].map(
                  (f) => (
                    <button
                      key={f}
                      className={filter === f ? "selected" : ""}
                      onClick={() => setFilter(f)}
                    >
                      {f}
                    </button>
                  ),
                )}
              </div>
              {error && !state.tasks.length && !syncedAt ? (
                <div className="empty">
                  <h3>Let’s open your personal space.</h3>
                  <p>{error}</p>
                  <a className="primary" href="/login" target="_top">
                    Sign in
                  </a>
                </div>
              ) : !loaded ? (
                <div className="empty">Loading your day…</div>
              ) : !tasks.length ? (
                <div className="empty">
                  <span className="emptyicon">
                    <CalendarDays size={31} />
                  </span>
                  <h3>
                    {query || filter !== "All"
                      ? "No activities match your filters."
                      : view === "Completed"
                        ? "Your wins will live here."
                        : "Good days start with a little space."}
                  </h3>
                  <p>
                    {query || filter !== "All"
                      ? "Try another category or clear your search."
                      : view === "Completed"
                        ? "Complete an activity to see it here."
                        : "Start with one thing you want to make time for.\nYour plan doesn’t have to be perfect."}
                  </p>
                  <button className="primary" onClick={() => edit()}>
                    <Plus size={16} /> Plan your first activity
                  </button>
                  {view !== "Completed" && filter === "All" && (
                    <button
                      className="textbutton sample"
                      disabled={busy}
                      onClick={sample}
                    >
                      Or explore with a sample day <ArrowUpRight size={14} />
                    </button>
                  )}
                </div>
              ) : (
                <div className="timeline">
                  {tasks.map((t) => (
                    <article
                      className={
                        "taskrow " + (t.status === "completed" ? "isdone" : "")
                      }
                      key={t.id}
                    >
                      <div className="time">
                        <strong>{clock(t.time)}</strong>
                        <span>{endLabel(t, state.preferences.timezone)}</span>
                      </div>
                      <div className={"taskcard " + t.category.toLowerCase()}>
                        <button
                          className={
                            "checkbox " +
                            (t.status === "completed" ? "checked" : "")
                          }
                          disabled={busy}
                          aria-label={
                            "Mark " +
                            t.title +
                            (t.status === "completed"
                              ? " incomplete"
                              : " complete")
                          }
                          onClick={() =>
                            act("set_activity_status", {
                              id: t.id,
                              status:
                                t.status === "completed"
                                  ? "planned"
                                  : "completed",
                            })
                          }
                        >
                          {t.status === "completed" && <Check size={14} />}
                        </button>
                        <button className="taskbody" onClick={() => edit(t)}>
                          <span className="taskmeta">
                            {t.date !== date
                              ? "Continues from " + t.date + " · "
                              : ""}
                            {t.category}
                            {t.fixed ? " · Fixed" : ""}
                            {t.source === "AI" ? " · AI planned" : ""}
                            {t.status === "skipped" ? " · Skipped" : ""}
                            {overlaps.has(t.id) ? " · Overlap" : ""}
                          </span>
                          <h3>{t.title}</h3>
                          {t.notes && <p>{t.notes}</p>}
                          <span className="duration">
                            <Clock size={12} />
                            {t.duration} min{" "}
                            {t.reminderMinutes !== null && (
                              <>
                                <Bell size={12} />
                                {t.reminderMinutes}m before
                              </>
                            )}
                          </span>
                        </button>
                        <button
                          className="focusstart"
                          aria-label={"Focus on " + t.title}
                          onClick={() => {
                            setFocusTask(t);
                            setModal("focus");
                          }}
                        >
                          <Play size={14} />
                        </button>
                        <button
                          className="more"
                          aria-label={"Edit " + t.title}
                          onClick={() => edit(t)}
                        >
                          <MoreHorizontal size={19} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
              <button className="addline" onClick={() => edit()}>
                <Plus size={16} /> A little more room for something?
              </button>
              <footer className="planfooter">
                <span>
                  <span className="online-dot" />
                  {online ? "Synced" : "Offline snapshot"}
                  {syncedAt
                    ? " · " +
                      new Date(syncedAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : ""}
                </span>
                <button
                  disabled={
                    !online || busy || !dayTasks.length || dayTasks.length > 100
                  }
                  onClick={copyDay}
                >
                  <Copy size={13} /> Copy to tomorrow
                </button>
                <button
                  disabled={!state.history.length || busy}
                  onClick={() => act("undo_last_change", {})}
                >
                  <Undo2 size={14} /> Undo last change
                </button>
              </footer>
            </section>
            <aside className="rightcolumn">
              <section
                className="aicard"
                style={state.tasks.length ? { display: "none" } : {}}
              >
                <div className="aiicon">
                  <Sparkles size={22} />
                </div>
                <span className="pill">BUILT FOR YOUR AI</span>
                <h2>
                  Your AI thinks.
                  <br />
                  Your day takes shape.
                </h2>
                <p>
                  Connect your assistant to turn conversations into a plan you
                  can actually follow.
                </p>
                <div className="promptpreview">
                  “Make time for guitar practice and my assignment today.”
                </div>
                <button
                  className="darkbutton"
                  onClick={() => setModal("connect")}
                >
                  Set up MCP connection <ArrowUpRight size={16} />
                </button>
                <small>
                  {state.lastAIUpdate
                    ? "Last AI update: " +
                      new Date(state.lastAIUpdate).toLocaleString()
                    : "Real tools. Shared tasks. No copying and pasting."}
                </small>
              </section>
              <section className="routinecard">
                <div className="cardlabel">
                  <Leaf size={17} /> A rhythm that feels like you
                </div>
                <p>
                  Give your AI a few anchors.
                  <br />
                  Leave the rest flexible.
                </p>
                <div className="routine-times">
                  <span>
                    Start the day
                    <strong>{clock(state.preferences.wakeTime)}</strong>
                  </span>
                  <span>
                    Wind down
                    <strong>{clock(state.preferences.sleepTime)}</strong>
                  </span>
                </div>
                <button
                  className="textbutton"
                  onClick={() => {
                    setPrefs(state.preferences);
                    setModal("prefs");
                  }}
                >
                  Edit your routine <ArrowUpRight size={14} />
                </button>
              </section>
              <button className="reminderbutton" onClick={enableReminders}>
                <Bell size={17} />
                <div>
                  {reminders
                    ? "Reminders on · tap to disable"
                    : "A gentle nudge, right on time"}
                  <small>While this app is open</small>
                </div>
                <Plus size={16} />
              </button>
              <button
                className="textbutton export"
                onClick={() => setModal("data")}
              >
                <ShieldCheck size={14} /> Data & backup settings
              </button>
            </aside>
          </div>
          <section className="overview">
            <div className="overview-main">
              <span className="sun-circle">
                <Sun size={31} />
              </span>
              <div>
                <div className="muted small">YOUR DAILY RHYTHM</div>
                <h2>
                  {dayTasks.length
                    ? `${done === dayTasks.length ? "A day well spent." : "Small steps, meaningful progress."}`
                    : "A fresh page, just for you."}
                </h2>
                <p>
                  {dayTasks.length
                    ? `${done} of ${dayTasks.length} activities completed. Keep a little space for yourself.`
                    : "Add your first activity, or let your AI weave a plan together."}
                </p>
              </div>
            </div>
            <div className="overview-stat">
              <strong>{dayTasks.length}</strong>
              <span>activities</span>
            </div>
            <div className="overview-stat">
              <strong>
                {Math.floor(totalMinutes / 60)}
                <small>h</small> {totalMinutes % 60}
                <small>m</small>
              </strong>
              <span>planned time</span>
            </div>
          </section>
          {((state as any).lastChangeSummary || state.history[0]?.summary) && (
            <div className="latest-change">
              <strong>Latest saved change</strong>
              <p>
                {(state as any).lastChangeSummary || state.history[0]?.summary}
              </p>
              <small>
                Server saved{" "}
                {(state as any).updatedAt
                  ? new Date((state as any).updatedAt).toLocaleString()
                  : "before this session"}{" "}
                · page received{" "}
                {syncedAt ? new Date(syncedAt).toLocaleTimeString() : "not yet"}
              </small>
            </div>
          )}
          <div className="bottomquote">
            You don’t have to do it all. Just make room for what matters.
          </div>
        </div>
      </main>
      {modal && (
        <div className="modalback" onClick={() => setModal(null)}>
          <section
            className={"modal " + (modal === "connect" ? "wide" : "")}
            role="dialog"
            aria-modal="true"
            aria-label={
              modal === "connect"
                ? "Connect your AI"
                : modal === "prefs"
                  ? "Your routine"
                  : "Activity editor"
            }
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close"
              aria-label="Close"
              onClick={() => setModal(null)}
            >
              <X size={20} />
            </button>
            {modal === "focus" && focusTask && (
              <FocusTimer
                title={focusTask.title}
                onComplete={async () => {
                  if (
                    await act("set_activity_status", {
                      id: focusTask.id,
                      status: "completed",
                    })
                  ) {
                    setModal(null);
                    setToast("Activity complete. Nice work.");
                  }
                }}
              />
            )}
            {modal === "data" && (
              <>
                <div className="eyebrow">YOUR DATA, YOUR CHOICE</div>
                <h2>A safe place for your plans.</h2>
                <div className="datasetting">
                  <ShieldCheck size={20} />
                  <div>
                    <strong>Private cloud sync</strong>
                    <p>
                      Your activities and life brief are stored in an
                      authenticated cloud database. Connected AI tools can read
                      and update them. This is not a local-only product yet.
                    </p>
                  </div>
                </div>
                <div className="datasetting">
                  <Download size={20} />
                  <div>
                    <strong>Device snapshot</strong>
                    <p>
                      Keep your last synced plan on this browser for connection
                      outages. It is unencrypted device storage; avoid enabling
                      on shared devices. Offline edits are paused. A cold
                      offline launch is not supported.
                    </p>
                    <label className="checklabel">
                      <input
                        type="checkbox"
                        checked={cacheEnabled}
                        onChange={(e) => toggleCache(e.target.checked)}
                      />
                      Keep a snapshot on this device
                    </label>
                  </div>
                </div>
                <div className="dataactions">
                  <button className="primary" onClick={exportData}>
                    <Download size={16} /> Export JSON backup
                  </button>
                  <button
                    className="secondary"
                    onClick={() => importRef.current?.click()}
                  >
                    <Upload size={16} /> Restore backup
                  </button>
                </div>
                <p className="hint">
                  Backups include activities and routine preferences. Restore
                  merges by activity ID and can be undone. Exports do not
                  include the change history.
                </p>
                <div className="notice">
                  <Bell size={18} />
                  <p>
                    <strong>Web reminder limits</strong>Notifications run while
                    this page is open and the browser allows execution. Sleep
                    mode, closed tabs and device settings can prevent delivery.
                    Use a native phone alarm for critical reminders.
                  </p>
                </div>
                <div className="connectionfacts">
                  <span>
                    Version<strong>2.1 · reliability beta</strong>
                  </span>
                  <span>
                    Timezone<strong>{state.preferences.timezone}</strong>
                  </span>
                  <span>
                    Server last saved
                    <strong>
                      {(state as any).updatedAt
                        ? new Date((state as any).updatedAt).toLocaleString()
                        : "None yet"}
                    </strong>
                  </span>
                  <span>
                    Page last received
                    <strong>
                      {syncedAt
                        ? new Date(syncedAt).toLocaleString()
                        : "Not synced"}
                    </strong>
                  </span>
                  <span>
                    Local reminder attempt
                    <strong>
                      {lastReminderAttempt
                        ? new Date(lastReminderAttempt).toLocaleString() +
                          " · OS delivery unconfirmed"
                        : "None on this page"}
                    </strong>
                  </span>
                  <span>
                    AI update
                    <strong>
                      {state.lastAIUpdate
                        ? new Date(state.lastAIUpdate).toLocaleString()
                        : "None yet"}
                    </strong>
                  </span>
                </div>
              </>
            )}
            {modal === "import" && importData && (
              <>
                <div className="eyebrow">RESTORE YOUR PLANNER</div>
                <h2>Bring your plans back.</h2>
                <p>
                  This backup contains{" "}
                  <strong>{importData.tasks.length} activities</strong>.
                  Activities with matching IDs will be updated, new IDs will be
                  added, and your routine preferences will be replaced. Other
                  existing activities stay in place.
                </p>
                <p className="hint">
                  You can undo this restore from the activity log. Nothing
                  changes until you confirm.
                </p>
                <div className="modalactions">
                  <button onClick={() => setModal("data")}>Cancel</button>
                  <button
                    className="primary"
                    disabled={busy || !online}
                    onClick={async () => {
                      if (await act("import_backup", importData)) {
                        setModal("data");
                        setImportData(null);
                        setToast("Backup restored. You can undo this change.");
                      }
                    }}
                  >
                    {busy ? "Restoring…" : "Merge backup"}
                  </button>
                </div>
              </>
            )}
            {modal === "task" && (
              <>
                <div className="eyebrow">MAKE A LITTLE SPACE</div>
                <h2>
                  {form.id ? "Edit activity" : "Something to look forward to"}
                </h2>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const { status, source, updatedAt, ...data } = form;
                    if (
                      await act(
                        "upsert_activities",
                        {
                          activities: [
                            { ...data, duration: Number(data.duration) },
                          ],
                        },
                        editVersion.current,
                      )
                    )
                      setModal(null);
                  }}
                >
                  <label>
                    Activity
                    <input
                      required
                      autoFocus
                      maxLength={180}
                      value={form.title}
                      placeholder="What would you like to make time for?"
                      onChange={(e) =>
                        setForm({ ...form, title: e.target.value })
                      }
                    />
                  </label>
                  <div className="formgrid">
                    <label>
                      Date
                      <input
                        required
                        type="date"
                        value={form.date}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            date: e.target.value,
                            occurrence: null,
                          })
                        }
                      />
                    </label>
                    <label>
                      Start time
                      <input
                        required
                        type="time"
                        value={form.time}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            time: e.target.value,
                            occurrence: null,
                          })
                        }
                      />
                    </label>
                    <label>
                      Duration (minutes)
                      <input
                        required
                        type="number"
                        min="5"
                        max="1440"
                        value={form.duration}
                        onChange={(e) =>
                          setForm({ ...form, duration: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Category
                      <select
                        value={form.category}
                        onChange={(e) =>
                          setForm({ ...form, category: e.target.value })
                        }
                      >
                        {["Focus", "Learning", "Wellbeing", "Personal"].map(
                          (c) => (
                            <option key={c}>{c}</option>
                          ),
                        )}
                      </select>
                    </label>
                  </div>
                  <label>
                    Notes
                    <textarea
                      value={form.notes}
                      onChange={(e) =>
                        setForm({ ...form, notes: e.target.value })
                      }
                      placeholder="A small intention or a few useful details"
                    />
                  </label>
                  <label>
                    Repeated DST time
                    <select
                      value={form.occurrence || ""}
                      onChange={(e) =>
                        setForm({ ...form, occurrence: e.target.value || null })
                      }
                    >
                      <option value="">No occurrence chosen</option>
                      <option value="earlier">Earlier occurrence</option>
                      <option value="later">Later occurrence</option>
                    </select>
                  </label>
                  <label>
                    Planning type
                    <select
                      value={
                        form.kind || (form.fixed ? "commitment" : "intention")
                      }
                      onChange={(e) =>
                        setForm({ ...form, kind: e.target.value })
                      }
                    >
                      {[
                        "intention",
                        "commitment",
                        "deadline",
                        "confirmed_routine",
                      ].map((k) => (
                        <option key={k}>{k}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Reminder
                    <select
                      value={
                        form.reminderMinutes === null
                          ? "off"
                          : form.reminderMinutes
                      }
                      onChange={(e) =>
                        setForm({
                          ...form,
                          reminderMinutes:
                            e.target.value === "off"
                              ? null
                              : Number(e.target.value),
                        })
                      }
                    >
                      <option value="off">No reminder</option>
                      {[0, 5, 10, 15, 30, 60].map((n) => (
                        <option key={n} value={n}>
                          {n === 0 ? "At start time" : n + " minutes before"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="checklabel">
                    <input
                      type="checkbox"
                      checked={form.fixed}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          fixed: e.target.checked,
                          kind: e.target.checked
                            ? "commitment"
                            : form.kind || "intention",
                        })
                      }
                    />
                    Fixed commitment — keep this time when replanning
                  </label>
                  {form.time &&
                    form.date &&
                    conflicts(
                      [
                        ...state.tasks.filter((t) => t.id !== form.id),
                        {
                          ...form,
                          id: "draft",
                          duration: Number(form.duration),
                          status: "planned",
                        },
                      ],
                      state.preferences.timezone,
                    ).has("draft") && (
                      <div className="overlapnote">
                        <AlertTriangle size={15} />
                        This overlaps another activity. You can still save it.
                      </div>
                    )}
                  <p className="hint">
                    Times use {state.preferences.timezone}. Browser reminders
                    require this app to stay open.
                  </p>
                  <div className="modalactions">
                    {form.id && (
                      <>
                        <button
                          type="button"
                          className="danger"
                          disabled={busy}
                          onClick={async () => {
                            if (await act("delete_activity", { id: form.id }))
                              setModal(null);
                          }}
                        >
                          <Trash2 size={16} /> Delete
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (
                              await act("set_activity_status", {
                                id: form.id,
                                status: "skipped",
                              })
                            )
                              setModal(null);
                          }}
                        >
                          Skip
                        </button>
                      </>
                    )}
                    <button className="primary" disabled={busy || !online}>
                      {busy ? "Saving…" : "Save activity"}
                    </button>
                  </div>
                </form>
              </>
            )}
            {modal === "prefs" && (
              <>
                <div className="eyebrow">YOUR DAILY ANCHORS</div>
                <h2>A routine that fits your life.</h2>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (
                      await act(
                        "update_preferences",
                        { ...prefs, confirmTimezoneChange: timezoneConfirmed },
                        editVersion.current,
                      )
                    ) {
                      setModal(null);
                      setToast(
                        "Routine saved. Your AI can read these preferences.",
                      );
                    }
                  }}
                >
                  <label>
                    Timezone
                    <input
                      required
                      value={prefs.timezone}
                      onChange={(e) =>
                        setPrefs({ ...prefs, timezone: e.target.value })
                      }
                      placeholder="America/New_York"
                    />
                  </label>
                  <div className="formgrid">
                    <label>
                      Wake time
                      <input
                        type="time"
                        required
                        value={prefs.wakeTime}
                        onChange={(e) =>
                          setPrefs({ ...prefs, wakeTime: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Wind-down time
                      <input
                        required
                        type="time"
                        value={prefs.sleepTime}
                        onChange={(e) =>
                          setPrefs({ ...prefs, sleepTime: e.target.value })
                        }
                      />
                    </label>
                  </div>
                  {prefs.timezone !== state.preferences.timezone &&
                    state.tasks.length > 0 && (
                      <label className="checklabel">
                        <input
                          type="checkbox"
                          checked={timezoneConfirmed}
                          onChange={(e) =>
                            setTimezoneConfirmed(e.target.checked)
                          }
                        />
                        Confirm reinterpreting existing dates/times in this
                        timezone, including fixed activities.
                      </label>
                    )}
                  <label>
                    Your life brief
                    <textarea
                      className="brief"
                      maxLength={6000}
                      value={prefs.brief}
                      onChange={(e) =>
                        setPrefs({ ...prefs, brief: e.target.value })
                      }
                      placeholder="My usual commitments, priorities, deadlines and things I want to make time for…"
                    />
                  </label>
                  <p className="hint">
                    Your connected AI can read this brief and your task
                    progress. Dayweave cannot retrieve your other AI
                    conversations.
                  </p>
                  <button className="primary" disabled={busy || !online}>
                    Save routine
                  </button>
                </form>
              </>
            )}
            {modal === "connect" && (
              <>
                <div className="aiicon">
                  <PlugZap size={24} />
                </div>
                <div className="eyebrow">A REAL MCP CONNECTION</div>
                <h2>Give your AI a place to put the plan.</h2>
                <p>
                  Dayweave exposes seven authenticated tools. Your assistant
                  reads and updates the same activities you see here.
                </p>
                <div className="connectstep">
                  <b>01</b>
                  <div>
                    <h3>Use the Dayweave plugin</h3>
                    <p>
                      In ChatGPT Settings → Apps, enable developer mode if
                      available and create a custom app using the MCP URL below
                      and OAuth authentication. Sign in to Dayweave and approve
                      access. Each account connects to this same deployment and
                      sees only its own planner. See START-HERE.md for exact
                      steps and account limitations.
                    </p>
                  </div>
                </div>
                <div className="endpoint">
                  <span>MCP endpoint · OAuth authorization required</span>
                  <code>{mcpUrl}</code>
                  <button
                    aria-label="Copy MCP URL"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(location.origin + "/mcp");
                        setToast("MCP endpoint copied");
                      } catch {
                        setToast("Could not copy. Select the MCP endpoint above and copy it manually.");
                      }
                    }}
                  >
                    <Copy size={17} />
                  </button>
                </div>
                <p className="hint">
                  OAuth discovery and public client registration are supported.
                  Never paste your password or tokens into a conversation.
                  Connections require consent and can be revoked in Account
                  settings.
                </p>
                <div className="connectstep">
                  <b>02</b>
                  <div>
                    <h3>Try a real plan update</h3>
                    <p>Ask your connected assistant:</p>
                    <blockquote>
                      Read my Dayweave planning context and tomorrow’s plan. Add
                      an hour of guitar practice at 6 PM tomorrow. Preserve
                      fixed activities and reuse existing IDs.
                    </blockquote>
                    <button
                      className="textbutton"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(
                            "Read my Dayweave planning context and tomorrow’s plan. Add an hour of guitar practice at 6 PM tomorrow. Preserve fixed activities and reuse existing IDs.",
                          );
                          setToast("Prompt copied");
                        } catch {
                          setToast("Could not copy. Select the planning prompt above and copy it manually.");
                        }
                      }}
                    >
                      <Copy size={14} /> Copy prompt
                    </button>
                  </div>
                </div>
                <details className="automationhelp">
                  <summary>Recurring planning status</summary>
                  <p>
                    No scheduling service is connected. An instruction does not
                    execute itself. Unattended ChatGPT app authentication and
                    write approvals have not been verified. Use the manual
                    planning prompt until a real scheduled run can authenticate,
                    read and write successfully. See RECURRING-WORKFLOW.md.
                  </p>
                </details>
                <div className="toolchips">
                  {[
                    "get_day_plan",
                    "get_planning_context",
                    "upsert_activities",
                    "set_activity_status",
                    "delete_activity",
                    "update_preferences",
                    "undo_last_change",
                  ].map((t) => (
                    <code key={t}>{t}</code>
                  ))}
                </div>
                <div className="notice">
                  <Bell size={18} />
                  <p>
                    <strong>About automatic mornings</strong>Recurring planning
                    is not enabled or verified. A server update must first reach
                    an open device page before it can attempt a browser
                    notification; phone-style background alarms are not
                    included.
                  </p>
                </div>
              </>
            )}
          </section>
        </div>
      )}
      <input
        ref={importRef}
        type="file"
        accept="application/json,.json"
        aria-label="Import planner backup"
        className="visuallyhidden"
        onChange={(e) => readBackup(e.target.files?.[0])}
      />
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
          <button aria-label="Dismiss" onClick={() => setToast("")}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
