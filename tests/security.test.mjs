import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "dayweave-security-")),
  "test.sqlite",
);
process.env.APP_URL = "http://localhost:3000";
process.env.SIGNUP_INVITE_CODE = "test-invitation";
process.env.OAUTH_REDIRECT_URIS = '["https://client.example/callback"]';
const s = await import("../lib/security.mjs");
const { one, run } = await import("../lib/database.mjs");
const { invoke, load } = await import("../lib/store.ts");
const user = (email) => {
  const token = s.authenticate(
    email,
    "correct horse battery staple",
    "test-invitation",
    true,
  );
  return {
    token,
    user: s.sessionUser(new Headers({ cookie: s.cookie(token) })),
  };
};
const a = user("a@example.com"),
  b = user("b@example.com");
const client = s.register({
  redirect_uris: ["https://client.example/callback"],
  token_endpoint_auth_method: "none",
});
const verifier = "a".repeat(43);
const params = () =>
  new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: client.redirect_uris[0],
    response_type: "code",
    code_challenge_method: "S256",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    resource: s.base() + "/mcp",
    scope: "planner",
    state: "test-state",
  });
const code = async () =>
  new URL(await s.authorize(params(), a.user)).searchParams.get("code");
const exchange = (c, v = verifier) =>
  s.exchange({
    grant_type: "authorization_code",
    code: c,
    client_id: client.client_id,
    redirect_uri: client.redirect_uris[0],
    code_verifier: v,
    resource: s.base() + "/mcp",
  });
const bearer = (t) =>
  s.bearer(
    new Request(s.base() + "/mcp", {
      headers: { authorization: "Bearer " + t },
    }),
  );
test("sign-in rejects wrong password, missing session and forged hosting headers", () => {
  assert.throws(() =>
    s.authenticate("a@example.com", "wrong password long enough"),
  );
  assert.equal(
    s.sessionUser(new Headers({ "oai-authenticated-user-id": a.user.id })),
    null,
  );
  assert.equal(
    s.sessionUser(new Headers({ cookie: "dayweave_session=forged" })),
    null,
  );
  assert.notEqual(a.user.id, b.user.id);
});
test("registration and authorization reject arbitrary redirects, plain PKCE and wrong resource", () => {
  assert.throws(() => s.register({ redirect_uris: ["https://evil.example/"] }));
  for (const [key, value] of [
    ["redirect_uri", "https://evil.example/"],
    ["code_challenge_method", "plain"],
    ["resource", "https://evil.example/mcp"],
    ["scope", "admin"],
  ]) {
    const p = params();
    p.set(key, value);
    assert.throws(() => s.authorization(p));
  }
});
test("PKCE, single-use codes, client binding, token expiry, refresh rotation and revocation", async () => {
  const bad = await code();
  await assert.rejects(() => exchange(bad, "b".repeat(43)));
  await assert.rejects(() => exchange(bad));
  const c = await code();
  const t = await exchange(c);
  await assert.rejects(() => exchange(c));
  assert.equal((await bearer(t.access_token)).user_id, a.user.id);
  assert.equal(
    (
      await s.bearer(
        new Request(s.base() + "/mcp", {
          headers: { authorization: "bearer " + t.access_token },
        }),
      )
    ).user_id,
    a.user.id,
  );
  assert.equal(await bearer("random"), null);
  const p = {
    grant_type: "refresh_token",
    refresh_token: t.refresh_token,
    client_id: client.client_id,
    resource: s.base() + "/mcp",
  };
  await assert.rejects(() => s.exchange({ ...p, client_id: "other" }));
  const rotated = await s.exchange(p);
  await assert.rejects(() => s.exchange(p));
  assert.equal(await bearer(rotated.access_token), null);
  s.revoke({ token: rotated.refresh_token, client_id: client.client_id });
  assert.equal(await bearer(rotated.access_token), null);
  assert.equal(await bearer(t.access_token), null);
  const expired = await exchange(await code());
  run("UPDATE tokens SET expires=0 WHERE hash=?", s.hash(expired.access_token));
  assert.equal(await bearer(expired.access_token), null);
});
const activity = {
  id: "private-a",
  title: "Private A",
  date: "2026-10-17",
  time: "09:00",
  duration: 30,
};
test("per-user records, all writes require versions, simultaneous stale writes cannot overwrite", async () => {
  await invoke(
    String(a.user.id),
    "upsert_activities",
    { activities: [activity] },
    "You",
    null,
  );
  assert.equal((await load(String(b.user.id))).state.tasks.length, 0);
  await assert.rejects(() =>
    invoke(
      String(b.user.id),
      "delete_activity",
      { id: activity.id },
      "AI",
      null,
    ),
  );
  await assert.rejects(() =>
    invoke(String(a.user.id), "delete_activity", { id: activity.id }, "AI"),
  );
  const { version } = await load(String(a.user.id));
  const results = await Promise.allSettled(
    ["completed", "skipped"].map((status) =>
      invoke(
        String(a.user.id),
        "set_activity_status",
        { id: activity.id, status },
        "AI",
        version,
        randomUUID(),
      ),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.filter((r) => r.status === "rejected").length, 1);
});
test("backup merge is atomic and undoable, invalid backup leaves saved version intact", async () => {
  const before = await load(String(a.user.id));
  await assert.rejects(() =>
    invoke(
      String(a.user.id),
      "import_backup",
      {
        tasks: [{ ...activity, date: "invalid" }],
        preferences: before.state.preferences,
      },
      "You",
      before.version,
    ),
  );
  assert.equal((await load(String(a.user.id))).version, before.version);
  const backup = {
    tasks: [{ ...activity, id: "recovered", status: "completed" }],
    preferences: before.state.preferences,
  };
  const out = await invoke(
    String(a.user.id),
    "import_backup",
    backup,
    "You",
    before.version,
  );
  assert.equal((await load(String(a.user.id))).state.tasks.length, 2);
  await invoke(String(a.user.id), "undo_last_change", {}, "You", out.version);
  assert.deepEqual(
    (await load(String(a.user.id))).state.tasks,
    before.state.tasks,
  );
});
test("consistent full SQLite backup restores records and invalidates credentials", async () => {
  const { execFileSync } = await import("node:child_process");
  const { DatabaseSync } = await import("node:sqlite");
  const dir = mkdtempSync(join(tmpdir(), "dayweave-recovery-"));
  const backup = join(dir, "backup.sqlite"),
    restored = join(dir, "restored.sqlite");
  execFileSync(process.execPath, ["scripts/backup.mjs", backup], {
    env: process.env,
  });
  execFileSync(process.execPath, ["scripts/restore.mjs", backup, restored], {
    env: process.env,
  });
  const recovered = new DatabaseSync(restored);
  assert.equal(
    recovered.prepare("PRAGMA integrity_check").get().integrity_check,
    "ok",
  );
  assert.equal(recovered.prepare("SELECT count(*) AS n FROM users").get().n, 2);
  assert.equal(
    recovered.prepare("SELECT count(*) AS n FROM sessions").get().n,
    0,
  );
  assert.equal(
    recovered.prepare("SELECT count(*) AS n FROM grants WHERE revoked=0").get()
      .n,
    0,
  );
  assert.equal(
    JSON.parse(
      recovered
        .prepare("SELECT payload FROM workspaces WHERE user_id=?")
        .get(a.user.id).payload,
    ).tasks[0].id,
    "private-a",
  );
  recovered.close();
});
test("password change revokes all old credentials and keeps only the new session", () => {
  const person = user("password-change@example.com");
  const token = s.changePassword(
    String(person.user.id),
    "correct horse battery staple",
    "new correct horse battery staple",
  );
  assert.equal(
    s.sessionUser(new Headers({ cookie: s.cookie(person.token) })),
    null,
  );
  assert.equal(
    s.sessionUser(new Headers({ cookie: s.cookie(token) })).id,
    person.user.id,
  );
  assert.throws(() =>
    s.authenticate(
      "password-change@example.com",
      "correct horse battery staple",
    ),
  );
  assert.ok(
    s.authenticate(
      "password-change@example.com",
      "new correct horse battery staple",
    ),
  );
  assert.throws(() =>
    s.changePassword(
      String(person.user.id),
      "incorrect",
      "another sufficiently long password",
    ),
  );
});
test("account deletion requires password/confirmation, removes only that user and their authorizations", async () => {
  const person = user("delete@example.com");
  await invoke(
    String(person.user.id),
    "upsert_activities",
    { activities: [activity] },
    "AI",
    null,
    randomUUID(),
  );
  const pending = await s.authorize(params(), person.user);
  const t = await exchange(new URL(pending).searchParams.get("code"));
  const grant = (await bearer(t.access_token)).id;
  assert.throws(() =>
    s.deleteAccount(String(person.user.id), "incorrect", "DELETE"),
  );
  assert.throws(() =>
    s.deleteAccount(
      String(person.user.id),
      "correct horse battery staple",
      "no",
    ),
  );
  s.deleteAccount(
    String(person.user.id),
    "correct horse battery staple",
    "DELETE",
  );
  assert.equal(
    one("SELECT * FROM users WHERE id=?", person.user.id),
    undefined,
  );
  assert.equal(
    one("SELECT * FROM planner_operations WHERE user_id=?", person.user.id),
    undefined,
  );
  assert.equal(
    one("SELECT * FROM workspaces WHERE user_id=?", person.user.id),
    undefined,
  );
  assert.equal(one("SELECT * FROM tokens WHERE grant_id=?", grant), undefined);
  assert.equal(
    s.sessionUser(new Headers({ cookie: s.cookie(person.token) })),
    null,
  );
  assert.equal(await bearer(t.access_token), null);
  assert.ok(one("SELECT * FROM users WHERE id=?", a.user.id));
  assert.ok((await load(String(a.user.id))).state.tasks.length);
});
