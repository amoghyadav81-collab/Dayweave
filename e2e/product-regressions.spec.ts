import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";

const origin = "http://localhost:3100";
async function signup(request: APIRequestContext) {
  const response = await request.post("/auth/signup", {
    headers: { origin },
    form: {
      email: randomUUID() + "@example.com",
      password: "isolated product regression password",
      invite: "local-test-invite",
    },
  });
  expect(response.ok()).toBeTruthy();
}
async function mutate(request: APIRequestContext, name: string, args: unknown) {
  const state = await (await request.get("/api/planner")).json();
  const response = await request.post("/api/planner", {
    headers: { origin },
    data: { name, args, scope: state.scope, expectedVersion: state.version, operationId: randomUUID() },
  });
  expect(response.ok()).toBeTruthy();
}

test("clipboard rejection reports failure for endpoint and prompt", async ({ page }) => {
  await signup(page.request);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async () => { throw new DOMException("Clipboard denied", "NotAllowedError"); } },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "MCP connection", exact: true }).click();
  await page.getByRole("button", { name: "Copy MCP URL" }).click();
  await expect(page.getByText("Could not copy. Select the MCP endpoint above and copy it manually.")).toBeVisible();
  await expect(page.getByText("MCP endpoint copied", { exact: true })).not.toBeVisible();
  await page.getByRole("button", { name: "Copy prompt", exact: true }).click();
  await expect(page.getByText("Could not copy. Select the planning prompt above and copy it manually.")).toBeVisible();
  await expect(page.getByText("Prompt copied", { exact: true })).not.toBeVisible();
});

test("copying tomorrow preserves deadline kind and explicit DST occurrence", async ({ page }) => {
  await signup(page.request);
  await mutate(page.request, "update_preferences", {
    timezone: "America/New_York", wakeTime: "07:00", sleepTime: "23:00", brief: "",
  });
  await mutate(page.request, "upsert_activities", {
    activities: [{ id: "copy-deadline", title: "Deadline to copy", date: "2026-10-31", time: "01:30", duration: 30, kind: "deadline", occurrence: "later", reminderMinutes: 15 }],
  });
  await page.goto("/");
  await page.getByLabel("Plan date").fill("2026-10-31");
  await expect(page.getByRole("heading", { name: "Deadline to copy" })).toBeVisible();
  await page.getByRole("button", { name: "Copy to tomorrow" }).click();
  await expect(page.getByLabel("Plan date")).toHaveValue("2026-11-01");
  const state = await (await page.request.get("/api/planner")).json();
  const copied = state.tasks.find((task: any) => task.date === "2026-11-01");
  expect(copied).toMatchObject({ kind: "deadline", occurrence: "later", reminderMinutes: 15, status: "planned" });
  expect(state.tasks).toHaveLength(2);
});

test("an expired write immediately clears private activities and device snapshot", async ({ page }) => {
  await signup(page.request);
  await mutate(page.request, "upsert_activities", {
    activities: [{ id: "expired-private", title: "Private expired activity", date: "2026-10-17", time: "10:00", duration: 30 }],
  });
  await page.goto("/");
  await page.getByLabel("Plan date").fill("2026-10-17");
  await page.getByRole("button", { name: "Data & backup settings" }).click();
  await page.getByLabel("Keep a snapshot on this device").check();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  expect(await page.evaluate(() => Object.keys(localStorage).some(key => /^dayweave:v2:[^:]+$/.test(key)))).toBeTruthy();
  await page.context().clearCookies();
  const rejected = page.waitForResponse(response => response.url().endsWith("/api/planner") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Mark Private expired activity complete" }).click();
  expect((await rejected).status()).toBe(401);
  await expect(page.getByRole("heading", { name: "Private expired activity" })).not.toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith("dayweave:")).length)).toBe(0);
  await expect(page.getByText("Your session expired. Sign in again to continue.", { exact: true })).toBeVisible();
});
