import { test, expect } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
const origin = "http://localhost:3100";
async function signup(request: any) {
  const email = randomUUID() + "@example.com";
  const r = await request.post("/auth/signup", {
    form: {
      email,
      password: "test password for local only",
      invite: "local-test-invite",
    },
    headers: { origin },
  });
  expect(r.ok()).toBeTruthy();
  return email;
}
async function state(r: any) {
  const out = await r.get("/api/planner");
  expect(out.status()).toBe(200);
  return out.json();
}
async function mutate(r: any, name: string, args: any, s?: any) {
  s = s || (await state(r));
  return r.post("/api/planner", {
    headers: { origin },
    data: { name, args, scope: s.scope, expectedVersion: s.version },
  });
}
for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
])
  test(`planner browser ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const email = await signup(page.request);
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Make room for your day." }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Add activity", exact: true })
      .click();
    await page.locator("input").filter({ visible: true }).first().waitFor();
    await page
      .getByPlaceholder("What would you like to make time for?")
      .fill("Browser test activity");
    await page
      .getByRole("button", { name: "Save activity", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Browser test activity" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Mark Browser test activity complete" })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Mark Browser test activity incomplete",
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Focus on Browser test activity" })
      .click();
    await page.getByRole("button", { name: "Start focus" }).click();
    await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
    await page.getByRole("button", { name: "Pause" }).click();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("button", { name: "Week", exact: true }).click();
    await expect(page.locator(".weekgrid")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: `test-results/planner-${viewport.width}.png`,
      fullPage: true,
    });
    await page.getByRole("link", { name: "Account", exact: true }).click();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/login/);
    await page
      .locator('form[action="/auth/login"]')
      .getByLabel("Email", { exact: true })
      .fill(email);
    await page
      .locator('form[action="/auth/login"]')
      .getByLabel("Password", { exact: true })
      .fill("test password for local only");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Browser test activity" }),
    ).toBeVisible();
  });
test("HTTP authentication, isolation, OAuth PKCE, seven MCP tools, conflict and backup recovery", async ({
  request,
  playwright,
}) => {
  const anon = await playwright.request.newContext({ baseURL: origin });
  expect((await anon.get("/api/planner")).status()).toBe(401);
  const denied = await anon.post("/mcp", {
    data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
    headers: { "oai-authenticated-user-id": "forged" },
  });
  expect(denied.status()).toBe(401);
  expect(denied.headers()["www-authenticate"]).toContain("resource_metadata");
  await signup(request);
  const other = await playwright.request.newContext({ baseURL: origin });
  await signup(other);
  const meta = await (
    await anon.get("/.well-known/oauth-authorization-server")
  ).json();
  expect(meta.code_challenge_methods_supported).toEqual(["S256"]);
  expect(
    (await anon.get("/.well-known/oauth-protected-resource/mcp")).status(),
  ).toBe(200);
  const reg = await anon.post("/oauth/register", {
    data: {
      client_name: "Integration test",
      redirect_uris: ["https://client.example/callback"],
      token_endpoint_auth_method: "none",
    },
  });
  expect(reg.status()).toBe(201);
  const client = await reg.json();
  const verifier = "v".repeat(43);
  const p = new URLSearchParams({
    response_type: "code",
    client_id: client.client_id,
    redirect_uri: client.redirect_uris[0],
    scope: "planner",
    resource: origin + "/mcp",
    state: "opaque-state",
    code_challenge_method: "S256",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
  });
  const consent = await request.get("/oauth/authorize?" + p);
  expect(await consent.text()).toContain("Approve planner access");
  const approved = await request.post("/oauth/authorize", {
    form: { ...Object.fromEntries(p), decision: "approve" },
    headers: { origin },
    maxRedirects: 0,
  });
  expect(approved.status()).toBe(303);
  const callback = new URL(approved.headers().location);
  expect(callback.searchParams.get("state")).toBe("opaque-state");
  const tokenRequest = {
    grant_type: "authorization_code",
    code: callback.searchParams.get("code")!,
    client_id: client.client_id,
    redirect_uri: client.redirect_uris[0],
    resource: origin + "/mcp",
    code_verifier: verifier,
  };
  expect(
    (
      await anon.post("/oauth/token", {
        form: { ...tokenRequest, code_verifier: "x".repeat(43) },
      })
    ).status(),
  ).toBe(400);
  // The maintained OAuth server consumes a code on an invalid PKCE attempt.
  const approvedAgain = await request.post("/oauth/authorize", {
    form: { ...Object.fromEntries(p), decision: "approve" },
    headers: { origin },
    maxRedirects: 0,
  });
  tokenRequest.code = new URL(
    approvedAgain.headers().location,
  ).searchParams.get("code")!;
  const t = await (
    await anon.post("/oauth/token", { form: tokenRequest })
  ).json();
  expect(t.access_token).toBeTruthy();
  expect(
    (await anon.post("/oauth/token", { form: tokenRequest })).status(),
  ).toBe(400);
  const rpc = async (method: string, params: any = {}) => {
    const r = await anon.post("/mcp", {
      headers: { authorization: "Bearer " + t.access_token },
      data: { jsonrpc: "2.0", id: 1, method, params },
    });
    expect(r.status()).toBe(200);
    return r.json();
  };
  const init = await rpc("initialize", { protocolVersion: "2025-11-25" });
  expect(init.result.protocolVersion).toBe("2025-11-25");
  expect((await rpc("tools/list")).result.tools).toHaveLength(7);
  const call = async (name: string, args: any = {}) => {
    const out = await rpc("tools/call", {
      name,
      arguments: ["get_day_plan", "get_planning_context"].includes(name)
        ? args
        : { operationId: randomUUID(), ...args },
    });
    expect(out.result.isError, JSON.stringify(out)).toBeUndefined();
    return JSON.parse(out.result.content[0].text);
  };
  let s = await call("get_planning_context");
  s = await call("upsert_activities", {
    expectedVersion: s.version,
    activities: [
      {
        id: "mcp-task",
        title: "Shared MCP task",
        date: "2026-10-17",
        time: "09:00",
        duration: 30,
      },
    ],
  });
  expect((await state(request)).tasks[0].title).toBe("Shared MCP task");
  expect((await state(other)).tasks).toHaveLength(0);
  const cross = await mutate(other, "delete_activity", { id: "mcp-task" });
  expect(cross.status()).toBe(400);
  s = await call("get_day_plan", { date: "2026-10-17" });
  s = await call("set_activity_status", {
    expectedVersion: s.version,
    id: "mcp-task",
    status: "skipped",
  });
  s = await call("update_preferences", {
    expectedVersion: s.version,
    timezone: "Asia/Kolkata",
    wakeTime: "07:00",
    sleepTime: "23:00",
    brief: "Private routine",
  });
  s = await call("delete_activity", {
    expectedVersion: s.version,
    id: "mcp-task",
  });
  s = await call("undo_last_change", {
    expectedVersion: s.version,
    targetOperationId: s.operationId,
  });
  expect((await state(request)).tasks).toHaveLength(1);
  const snapshot = await state(request);
  const results = await Promise.all(
    ["planned", "completed"].map((status) =>
      mutate(
        request,
        "set_activity_status",
        { id: "mcp-task", status },
        snapshot,
      ),
    ),
  );
  expect(results.map((r) => r.status()).sort()).toEqual([200, 409]);
  const backup = await state(request);
  expect(
    (await mutate(request, "delete_activity", { id: "mcp-task" })).status(),
  ).toBe(200);
  expect((await mutate(request, "import_backup", backup)).status()).toBe(200);
  expect((await state(request)).tasks).toEqual(
    backup.tasks.map((a: any) => ({
      ...a,
      source: "Import",
      updatedAt: expect.any(String),
    })),
  );
  const before = await state(request);
  expect(
    (
      await mutate(request, "import_backup", {
        tasks: [{ title: "invalid" }],
        preferences: before.preferences,
      })
    ).status(),
  ).toBe(400);
  expect((await state(request)).version).toBe(before.version);
  expect(
    (
      await request.post("/api/planner", {
        headers: { origin: "https://evil.example" },
        data: {},
      })
    ).status(),
  ).toBe(403);
  const refreshed = await (
    await anon.post("/oauth/token", {
      form: {
        grant_type: "refresh_token",
        refresh_token: t.refresh_token,
        client_id: client.client_id,
        resource: origin + "/mcp",
      },
    })
  ).json();
  expect(refreshed.access_token).toBeTruthy();
  // Rehearse headless token mechanics only; this is NOT a ChatGPT scheduled run.
  const refreshedRead = await (
    await anon.post("/mcp", {
      headers: { authorization: "Bearer " + refreshed.access_token },
      data: {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "get_planning_context", arguments: {} },
      },
    })
  ).json();
  expect(refreshedRead.result.isError).toBeUndefined();
  const headless = await (
    await anon.post("/mcp", {
      headers: { authorization: "Bearer " + refreshed.access_token },
      data: {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "upsert_activities",
          arguments: {
            expectedVersion: refreshedRead.result.structuredContent.version,
            operationId: randomUUID(),
            activities: [
              {
                title: "Headless auth rehearsal",
                date: "2026-10-17",
                time: "20:00",
                duration: 30,
              },
            ],
          },
        },
      },
    })
  ).json();
  expect(headless.result.isError).toBeUndefined();
  await anon.post("/oauth/revoke", {
    form: { token: refreshed.refresh_token, client_id: client.client_id },
  });
  expect(
    (
      await anon.post("/mcp", {
        headers: { authorization: "Bearer " + refreshed.access_token },
        data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
      })
    ).status(),
  ).toBe(401);
  await anon.dispose();
  await other.dispose();
});
test("browser OAuth consent posts with CSRF protection intact", async ({
  page,
}) => {
  await signup(page.request);
  const registered = await page.request.post("/oauth/register", {
    data: {
      client_name: "Browser consent test",
      redirect_uris: ["https://client.example/callback"],
    },
  });
  const client = await registered.json();
  const verifier = "b".repeat(43);
  const p = new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: client.redirect_uris[0],
    response_type: "code",
    scope: "planner",
    resource: origin + "/mcp",
    state: "browser-state",
    code_challenge_method: "S256",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
  });
  await page.goto("/oauth/authorize?" + p);
  await expect(
    page.getByRole("button", { name: "Approve planner access" }),
  ).toBeVisible();
  await page.route("https://client.example/callback**", (r) =>
    r.fulfill({ body: "Authorization returned to client" }),
  );
  await page.getByRole("button", { name: "Approve planner access" }).click();
  await expect(page).toHaveURL(/^https:\/\/client\.example\/callback\?code=/);
  expect(new URL(page.url()).searchParams.get("state")).toBe("browser-state");
});
test("account password change, sign-in and deletion work in the browser", async ({
  page,
}) => {
  const email = await signup(page.request);
  await page.goto("/account");
  const form = page.locator('form[action="/auth/password"]');
  await form
    .getByLabel("Current password")
    .fill("test password for local only");
  await form
    .getByLabel("New password")
    .fill("new test password for local only");
  await form.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByRole("status")).toContainText("Password changed");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  const login = page.locator('form[action="/auth/login"]');
  await login.getByLabel("Email", { exact: true }).fill(email);
  await login
    .getByLabel("Password", { exact: true })
    .fill("new test password for local only");
  await login.getByRole("button", { name: "Sign in" }).click();
  await page.goto("/account");
  await page
    .getByText("Delete my account and planner", { exact: true })
    .click();
  const deletion = page.locator('form[action="/auth/delete"]');
  await deletion
    .getByLabel("Password", { exact: true })
    .fill("new test password for local only");
  await deletion.getByLabel("Type DELETE to confirm").fill("DELETE");
  await deletion
    .getByRole("button", { name: "Permanently delete my account" })
    .click();
  await expect(page).toHaveURL(/account-deleted/);
  expect((await page.request.get("/api/planner")).status()).toBe(401);
});
test("large valid browser backups restore above the old 1.5MB boundary", async ({
  request,
}) => {
  await signup(request);
  const before = await state(request);
  const tasks = Array.from({ length: 550 }, (_, i) => ({
    id: "large-" + i,
    title: "Recovered " + i,
    date: "2026-10-17",
    time: "09:00",
    duration: 30,
    notes: "x".repeat(3000),
    status: "planned",
  }));
  const backup = { tasks, preferences: before.preferences };
  expect(Buffer.byteLength(JSON.stringify(backup))).toBeGreaterThan(1500000);
  const restored = await mutate(request, "import_backup", backup, before);
  expect(restored.status()).toBe(200);
  expect((await state(request)).tasks).toHaveLength(550);
});
