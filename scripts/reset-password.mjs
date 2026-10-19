// Administrative, local machine access only. Password is read from stdin, never command arguments.
import { randomBytes, scryptSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { one, run, transaction } from "../lib/database.mjs";
const email = process.argv[2]?.toLowerCase();
const password = readFileSync(0, "utf8").trimEnd();
if (password.length < 12 || password.length > 256)
  throw Error("Password must be 12–256 characters");
const user = one("SELECT id FROM users WHERE email=?", email || "");
if (!user) throw Error("Account not found");
const salt = randomBytes(32).toString("base64url");
transaction(() => {
  run(
    "UPDATE users SET password=? WHERE id=?",
    salt + ":" + scryptSync(password, salt, 64).toString("hex"),
    user.id,
  );
  run("DELETE FROM sessions WHERE user_id=?", user.id);
  run("DELETE FROM codes WHERE user_id=?", user.id);
  run("UPDATE grants SET revoked=1 WHERE user_id=?", user.id);
});
console.log("Password reset; sessions and OAuth grants revoked.");
