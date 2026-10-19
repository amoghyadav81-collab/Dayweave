import { test, expect } from "@playwright/test";
import { randomUUID, createHash } from "node:crypto";
const origin = "http://localhost:3100";
async function signup(web: any) {
  const r = await web.post("/auth/signup", {
    headers: { origin },
    form: {
      email: randomUUID() + "@example.com",
      password: "isolated test password here",
      invite: "local-test-invite",
    },
  });
  expect(r.ok()).toBeTruthy();
  return (await web.get("/api/planner")).json();
}
async function connect(web: any, anon: any) {
  const registered = await anon.post("/oauth/register", {
    data: {
      client_name: "Isolated reliability test",
      redirect_uris: ["https://client.example/callback"],
      token_endpoint_auth_method: "none",
    },
  });
  expect(registered.status()).toBe(201);
  const client = await registered.json(),
    verifier = "v".repeat(43);
  const values = {
    response_type: "code",
    client_id: client.client_id,
    redirect_uri: "https://client.example/callback",
    scope: "planner",
    resource: origin + "/mcp",
    state: randomUUID(),
    code_challenge_method: "S256",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
  };
  const accepted = await web.post("/oauth/authorize", {
    headers: { origin },
    form: { ...values, decision: "approve" },
    maxRedirects: 0,
  });
  expect(accepted.status()).toBe(303);
  const token = await (
    await anon.post("/oauth/token", {
      form: {
        grant_type: "authorization_code",
        client_id: client.client_id,
        redirect_uri: values.redirect_uri,
        code: new URL(accepted.headers().location).searchParams.get("code")!,
        code_verifier: verifier,
        resource: values.resource,
      },
    })
  ).json();
  expect(token.access_token).toBeTruthy();
  return token.access_token;
}
async function rpc(anon: any, token: string, name: string, args: any = {}) {
  const r = await anon.post("/mcp", {
    headers: { authorization: "Bearer " + token },
    data: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    },
  });
  expect(r.status()).toBe(200);
  return (await r.json()).result;
}
async function mutate(web: any, s: any, name: string, args: any) {
  return web.post("/api/planner", {
    headers: { origin },
    data: { scope: s.scope, expectedVersion: s.version, name, args },
  });
}
const task = {
  title: "Private A guitar",
  date: "2026-10-17",
  time: "18:00",
  duration: 30,
  notes: "Preserve my reminder",
  reminderMinutes: 15,
  category: "Learning",
};
test("a genuinely lost MCP response is replayed once; two OAuth users stay isolated and stale writes are structured", async ({
  page,
  playwright,
}) => {
  const web = page.request,
    initial = await signup(web),
    anon = await playwright.request.newContext({ baseURL: origin }),
    other = await playwright.request.newContext({ baseURL: origin });
  await signup(other);
  const token = await connect(web, anon),
    tokenB = await connect(other, anon);
  await page.goto("/");
  const args = {
      operationId: randomUUID(),
      expectedVersion: null,
      activities: [task],
    },
    body = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "upsert_activities", arguments: args },
    };
  let original: any;
  await page.route("**/mcp", async (route) => {
    const response = await route.fetch();
    original = await response.json();
    await route.abort("failed");
  });
  const delivered = await page.evaluate(
    async ({ token, body }) => {
      try {
        await fetch("/mcp", {
          method: "POST",
          headers: {
            authorization: "Bearer " + token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
        return true;
      } catch {
        return false;
      }
    },
    { token, body },
  );
  expect(delivered).toBe(false);
  await page.unroute("**/mcp");
  expect(original.result.isError).toBeUndefined();
  const retry = await rpc(anon, token, "upsert_activities", args);
  expect(retry).toEqual(original.result);
  let current = await (await web.get("/api/planner")).json();
  expect(current.tasks).toHaveLength(1);
  expect(current.history).toHaveLength(1);
  expect(
    (await rpc(anon, tokenB, "get_planning_context")).structuredContent.tasks,
  ).toHaveLength(0);
  expect(
    (await other.get("/api/planner?scope=" + initial.scope)).status(),
  ).toBe(200);
  expect((await (await other.get("/api/planner")).json()).tasks).toHaveLength(
    0,
  );
  const reused = await rpc(anon, token, "upsert_activities", {
    ...args,
    activities: [{ ...task, title: "Different" }],
  });
  expect(reused.structuredContent.error.code).toBe("OPERATION_ID_REUSED");
  const cross = await rpc(anon, tokenB, "delete_activity", {
    id: current.tasks[0].id,
    expectedVersion: null,
    operationId: randomUUID(),
  });
  expect(cross.isError).toBe(true);
  expect(
    (
      await other.post("/api/planner", {
        headers: { origin },
        data: {
          scope: initial.scope,
          expectedVersion: current.version,
          name: "import_backup",
          args: { tasks: [], preferences: current.preferences },
        },
      })
    ).status(),
  ).toBe(403);
  const stale = current.version;
  expect(
    (
      await mutate(web, current, "upsert_activities", {
        activities: [{ id: current.tasks[0].id, notes: "User later notes" }],
      })
    ).ok(),
  ).toBeTruthy();
  const conflict = await rpc(anon, token, "upsert_activities", {
    operationId: randomUUID(),
    expectedVersion: stale,
    activities: [{ id: current.tasks[0].id, time: "19:00" }],
  });
  expect(conflict.structuredContent.error.code).toBe("VERSION_CONFLICT");
  expect(conflict.structuredContent.error.action).toBe("REREAD_AND_REPLAN");
  current = await (await web.get("/api/planner")).json();
  const rescheduled = await rpc(anon, token, "upsert_activities", {
    operationId: randomUUID(),
    expectedVersion: current.version,
    activities: [{ id: current.tasks[0].id, time: "19:00" }],
  });
  expect(rescheduled.isError).toBeUndefined();
  expect(rescheduled.structuredContent.saved[0]).toMatchObject({
    notes: "User later notes",
    reminderMinutes: 15,
    category: "Learning",
  });
  await anon.dispose();
  await other.dispose();
});
test("account switching clears the old view/cache and logout clears snapshots", async ({
  page,
  playwright,
}) => {
  const a = await signup(page.request);
  await mutate(page.request, a, "upsert_activities", {
    activities: [{ ...task, id: "a-private" }],
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Data & backup settings" }).click();
  await page.getByLabel("Keep a snapshot on this device").check();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  expect(
    await page.evaluate(
      (uid) =>
        JSON.parse(localStorage.getItem("dayweave:v2:" + uid)!).state.scope,
      a.scope,
    ),
  ).toBe(a.scope);
  const other = await playwright.request.newContext({ baseURL: origin });
  const b = await signup(other);
  await mutate(other, b, "upsert_activities", {
    activities: [{ ...task, id: "b-private", title: "Private B activity" }],
  });
  await page.context().addCookies((await other.storageState()).cookies);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByRole("heading", { name: "Private A guitar" }),
  ).not.toBeVisible();
  await expect(
    page.getByText(/signed-in account changed/).first(),
  ).toBeVisible();
  expect(
    await page.evaluate(
      (uid) => localStorage.getItem("dayweave:v2:" + uid),
      a.scope,
    ),
  ).toBeNull();
  await page.reload();
  await page.getByLabel("Plan date").fill("2026-10-17");
  await expect(
    page.getByRole("heading", { name: "Private B activity" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Private A guitar" }),
  ).not.toBeVisible();
  await page.getByRole("link", { name: "Account", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/login/);
  expect((await page.request.get("/api/planner")).status()).toBe(401);
  expect(
    await page.evaluate(
      () =>
        Object.keys(localStorage).filter((k) => k.startsWith("dayweave:"))
          .length,
    ),
  ).toBe(0);
  await other.dispose();
});
test("DST choice is visible, gaps are rejected and overnight work appears on both days", async ({
  page,
}) => {
  let s = await signup(page.request);
  expect(
    (
      await mutate(page.request, s, "update_preferences", {
        timezone: "America/New_York",
        wakeTime: "07:00",
        sleepTime: "23:00",
        brief: "Test routine",
      })
    ).ok(),
  ).toBeTruthy();
  await page.goto("/");
  await page.getByRole("button", { name: "Add activity", exact: true }).click();
  await page
    .getByPlaceholder("What would you like to make time for?")
    .fill("Repeated time activity");
  await page.getByLabel("Date", { exact: true }).fill("2026-11-01");
  await page.getByLabel("Start time", { exact: true }).fill("01:30");
  await page
    .getByRole("button", { name: "Save activity", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Update not saved" }),
  ).toContainText("occurs twice");
  await page.getByLabel("Repeated DST time").selectOption("later");
  await page
    .getByRole("button", { name: "Save activity", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  s = await (await page.request.get("/api/planner")).json();
  expect(s.tasks[0].occurrence).toBe("later");
  const gap = await mutate(page.request, s, "upsert_activities", {
    activities: [{ ...task, id: "gap", date: "2026-03-08", time: "02:30" }],
  });
  expect(gap.status()).toBe(400);
  expect((await gap.json()).problem.code).toBe("NONEXISTENT_LOCAL_TIME");
  expect(
    (
      await mutate(page.request, s, "upsert_activities", {
        activities: [
          {
            ...task,
            id: "overnight",
            title: "Overnight work",
            date: "2026-11-01",
            time: "23:30",
            duration: 120,
          },
        ],
      })
    ).ok(),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Refresh plan" }).click();
  await page.getByLabel("Plan date").fill("2026-11-01");
  await expect(
    page.getByRole("heading", { name: "Overnight work" }),
  ).toBeVisible();
  await page.getByLabel("Plan date").fill("2026-11-02");
  await expect(
    page.getByRole("heading", { name: "Overnight work" }),
  ).toBeVisible();
  await expect(page.getByText(/Continues from 2026-11-01/)).toBeVisible();
});
