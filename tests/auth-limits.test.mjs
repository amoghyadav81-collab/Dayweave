import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "dayweave-auth-limits-")),
  "test.sqlite",
);
process.env.SIGNUP_INVITE_CODE = "test-invitation";
const { authenticate, rate, sessionUser, cookie } = await import("../lib/security.mjs");
const { run, one } = await import("../lib/database.mjs");
const email = "existing@example.com";
const password = "correct horse battery staple";
authenticate(email, password, "test-invitation", true);
beforeEach(() => run("DELETE FROM limits"));

test("invalid invitation floods cannot consume sign-in or registration budgets", () => {
  for (let i = 0; i < 250; i++) {
    assert.throws(
      () => authenticate(i % 2 ? email : `unknown${i}@example.com`, password, "wrong", true),
      (error) => error.status === 403,
    );
  }
  assert.equal(one("SELECT count(*) AS n FROM limits").n, 0);
  const token = authenticate(email, password);
  assert.equal(sessionUser(new Headers({ cookie: cookie(token) })).email, email);
});

test("exhausted invited-signup budget leaves existing sign-in available", () => {
  for (let i = 0; i < 100; i++) rate("signup:global", 100);
  assert.throws(
    () => authenticate("new@example.com", password, "test-invitation", true),
    (error) => error.status === 429,
  );
  assert.ok(authenticate(email, password));
});

test("real failed password attempts still enforce the per-email sign-in limit", () => {
  for (let i = 0; i < 10; i++) {
    assert.throws(
      () => authenticate(email, "an incorrect but long password"),
      (error) => error.status === 401,
    );
  }
  assert.throws(() => authenticate(email, password), (error) => error.status === 429);
});

test("the shared sign-in budget remains enforced", () => {
  for (let i = 0; i < 100; i++) rate("auth:global", 100);
  assert.throws(() => authenticate(email, password), (error) => error.status === 429);
});
