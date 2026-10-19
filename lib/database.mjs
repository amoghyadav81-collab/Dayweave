import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
/** @type {DatabaseSync | undefined} */
let connection;
// Opening the database is runtime work. Builds must not require a mounted production disk.
export function getDatabase() {
  if (connection) return connection;
  const path = resolve(
    /* turbopackIgnore: true */ process.env.DATABASE_PATH ||
      "data/dayweave.sqlite",
  );
  mkdirSync(dirname(path), { recursive: true });
  const opened = new DatabaseSync(path);
  try {
    opened.exec(
      "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
    );
    opened.exec(
      readFileSync(resolve(process.cwd(), "migrations/001.sql"), "utf8"),
    );
    opened.exec(readFileSync(resolve(process.cwd(), "migrations/002_operations.sql"), "utf8"));
    connection = opened;
    return connection;
  } catch (error) {
    opened.close();
    throw error;
  }
}
export const one = (sql, ...args) =>
  getDatabase()
    .prepare(sql)
    .get(...args);
export const run = (sql, ...args) =>
  getDatabase()
    .prepare(sql)
    .run(...args);
export function transaction(fn) {
  const db = getDatabase();
  db.exec("BEGIN IMMEDIATE");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
