import { DatabaseSync, backup } from "node:sqlite";
import { chmodSync, existsSync } from "node:fs";
import { resolve } from "node:path";
const [source, target] = process.argv.slice(2);
if (!source || !target || !existsSync(source) || existsSync(target))
  throw Error(
    "Usage: restore.mjs existing-backup.sqlite NEW-target.sqlite (never overwrites)",
  );
const input = new DatabaseSync(resolve(source), { readOnly: true });
if (input.prepare("PRAGMA integrity_check").get().integrity_check !== "ok")
  throw Error("Backup failed integrity check");
await backup(input, resolve(target));
input.close();
chmodSync(target, 0o600);
const db = new DatabaseSync(resolve(target));
db.exec(
  "PRAGMA foreign_keys=ON; BEGIN IMMEDIATE; DELETE FROM sessions; DELETE FROM codes; UPDATE grants SET revoked=1; COMMIT;",
);
if (
  db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok" ||
  db.prepare("PRAGMA foreign_key_check").all().length
)
  throw Error("Restored DB failed validation");
db.close();
console.log(
  "Restored into new file; browser sessions and OAuth grants revoked. Select it with DATABASE_PATH while the server is stopped.",
);
