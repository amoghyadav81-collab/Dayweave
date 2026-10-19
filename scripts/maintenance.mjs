import { run } from "../lib/database.mjs";
const now = Math.floor(Date.now() / 1000);
for (const table of ["sessions", "codes", "tokens", "limits"])
  run(`DELETE FROM ${table} WHERE expires<?`, now);
console.log("Expired authentication records removed.");
