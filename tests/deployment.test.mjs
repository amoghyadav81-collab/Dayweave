import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
const configure = resolve("scripts/configure-production.mjs"),
  host = resolve("scripts/start-host.mjs");
test("production configuration validates a hostname, keeps secrets private and never overwrites", () => {
  const cwd = mkdtempSync(join(tmpdir(), "dayweave-config-"));
  let r = spawnSync(
    process.execPath,
    [configure, "https://invalid.example/path"],
    { cwd },
  );
  assert.notEqual(r.status, 0);
  r = spawnSync(process.execPath, [configure, "planner.example.com"], {
    cwd,
    encoding: "utf8",
  });
  assert.equal(r.status, 0);
  const file = join(cwd, ".env.production"),
    contents = readFileSync(file, "utf8");
  assert.match(contents, /DAYWEAVE_DOMAIN=planner.example.com/);
  const secret = contents.match(/SIGNUP_INVITE_CODE=(.+)/)[1];
  assert.ok(secret.length >= 43);
  assert.ok(!r.stdout.includes(secret));
  assert.equal(statSync(file).mode & 0o777, 0o600);
  r = spawnSync(process.execPath, [configure, "other.example.com"], { cwd });
  assert.notEqual(r.status, 0);
  assert.equal(readFileSync(file, "utf8"), contents);
});
test("host startup rejects missing/unsafe origin, ephemeral path and unsafe callback configuration", () => {
  for (const config of [
    { APP_URL: "http://public.example.com", DATABASE_PATH: "/tmp/db.sqlite" },
    {
      APP_URL: "https://user:pass@public.example.com",
      DATABASE_PATH: "/tmp/db.sqlite",
    },
    { APP_URL: "https://public.example.com", DATABASE_PATH: "relative.sqlite" },
    {
      APP_URL: "https://public.example.com",
      DATABASE_PATH: "/tmp/db.sqlite",
      OAUTH_REDIRECT_URIS: '["http://callback.example.com"]',
    },
  ]) {
    const out = spawnSync(process.execPath, [host], {
      env: { ...process.env, ...config },
      encoding: "utf8",
    });
    assert.notEqual(out.status, 0);
    assert.ok(!out.stdout.includes("Ready"));
  }
});
test("importing server database code does not touch an unavailable production disk at build time", () => {
  const r = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", 'await import("./lib/database.mjs")'],
    {
      env: {
        ...process.env,
        DATABASE_PATH: "/sys/dayweave-unavailable/planner.sqlite",
      },
      encoding: "utf8",
    },
  );
  assert.equal(r.status, 0, r.stderr);
});

test("production Render installation explicitly includes build-time dependencies", () => {
  const blueprint = readFileSync(resolve("render.yaml"), "utf8");
  assert.match(blueprint, /buildCommand: npm ci --include=dev && npm run build/);
});

test("backup refuses missing database sources without creating source or target", () => {
  const cwd = mkdtempSync(join(tmpdir(), "dayweave-backup-missing-"));
  const source = join(cwd, "missing", "planner.sqlite");
  const target = join(cwd, "backup.sqlite");
  const result = spawnSync(process.execPath, [resolve("scripts/backup.mjs"), target], {
    cwd,
    env: { ...process.env, DATABASE_PATH: source },
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /existing database file/);
  assert.equal(existsSync(source), false);
  assert.equal(existsSync(join(cwd, "missing")), false);
  assert.equal(existsSync(target), false);
});
