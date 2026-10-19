// Disposable integration test only. Never point these fixture accounts at a live service.
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
const suffix = randomUUID().slice(0, 8),
  name = "dayweave-test-" + suffix,
  volume = name + "-data";
const origin = "http://localhost:3100",
  image = process.env.DAYWEAVE_TEST_IMAGE || "dayweave:release";
function docker(...args) {
  const p = spawnSync("docker", args, { encoding: "utf8" });
  if (p.status !== 0)
    throw Error("Docker operation failed: " + (p.stderr || p.stdout));
  return p.stdout.trim();
}
async function ready() {
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(origin + "/api/health", {
        signal: AbortSignal.timeout(1000),
      });
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw Error("Container did not become ready");
}
function start() {
  docker(
    "run",
    "-d",
    "--name",
    name,
    "-p",
    "127.0.0.1:3100:3000",
    "-e",
    "APP_URL=" + origin,
    "-e",
    "SIGNUP_INVITE_CODE=local-test-invite",
    "-e",
    'OAUTH_REDIRECT_URIS=["https://client.example/callback"]',
    "-v",
    volume + ":/data",
    image,
  );
}
let ownsContainer = false,
  ownsVolume = false;
try {
  // Abort if the test port is occupied; never stop another service.
  const { createServer } = await import("node:net");
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(3100, "127.0.0.1", () => server.close(resolve));
  });
  docker("volume", "create", volume);
  ownsVolume = true;
  start();
  ownsContainer = true;
  await ready();
  for (const args of [
    ["scripts/check-deployment.mjs", origin],
    ["node_modules/@playwright/test/cli.js", "test"],
  ]) {
    const test = spawnSync(process.execPath, args, {
      stdio: "inherit",
      env: { ...process.env, DAYWEAVE_TEST_URL: origin },
    });
    if (test.status !== 0) throw Error("Container integration checks failed");
  }
  const email = "durability-" + suffix + "@example.com";
  const signup = await fetch(origin + "/auth/signup", {
    method: "POST",
    redirect: "manual",
    headers: { origin, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      email,
      password: "disposable persistence test password",
      invite: "local-test-invite",
    }),
  });
  if (signup.status !== 303) throw Error("Persistence test signup failed");
  const cookie = signup.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw Error("Missing test session");
  let state = await (
    await fetch(origin + "/api/planner", { headers: { cookie } })
  ).json();
  const write = await fetch(origin + "/api/planner", {
    method: "POST",
    headers: { origin, cookie, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "upsert_activities",
      scope: state.scope,
      expectedVersion: state.version,
      args: {
        activities: [
          {
            id: "durable",
            title: "Survives container replacement",
            date: "2026-10-17",
            time: "09:00",
            duration: 30,
          },
        ],
      },
    }),
  });
  if (!write.ok) throw Error("Persistence fixture write failed");
  docker("rm", "-f", name);
  ownsContainer = false;
  start();
  ownsContainer = true;
  await ready();
  const restored = await fetch(origin + "/api/planner", {
    headers: { cookie },
  });
  state = await restored.json();
  if (!restored.ok || state.tasks?.[0]?.id !== "durable")
    throw Error("Persistent volume lost account/planner state");
  console.log(
    "Container replacement preserved account, session and planner on the persistent volume.",
  );
} finally {
  if (ownsContainer) docker("rm", "-f", name);
  if (ownsVolume) docker("volume", "rm", volume);
}
