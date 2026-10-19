import { DatabaseSync, backup } from "node:sqlite";
import { chmodSync, existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
const target = process.argv[2];
if (!target || existsSync(target))
  throw Error(
    "Provide a NEW backup path; existing files are never overwritten",
  );
const source = resolve(process.env.DATABASE_PATH || "data/dayweave.sqlite");
if (!existsSync(source) || !statSync(source).isFile())
  throw Error("Backup source must be an existing database file; verify DATABASE_PATH");
// Read-only opening cannot create/migrate an empty database on a mistyped path.
const database = new DatabaseSync(source, { readOnly: true });
try {
  if (database.prepare("PRAGMA integrity_check").get().integrity_check !== "ok")
    throw Error("Backup source failed integrity check");
  await backup(database, resolve(target));
} finally {
  database.close();
}
chmodSync(target, 0o600);
console.log(
  "Consistent database backup created. Protect it: it contains all users, password hashes and authorization records.",
);
