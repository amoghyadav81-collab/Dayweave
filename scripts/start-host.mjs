// Provider-neutral startup with optional Render origin discovery. Never infer identity from headers.
import { spawn } from "node:child_process";
import { isAbsolute } from "node:path";
process.env.APP_URL ||= process.env.RENDER_EXTERNAL_URL;
if (!process.env.APP_URL) throw Error("Set APP_URL to the public HTTPS origin");
const u = new URL(process.env.APP_URL);
if (
  u.protocol !== "https:" ||
  u.pathname !== "/" ||
  u.search ||
  u.hash ||
  u.username ||
  u.password
)
  throw Error("Hosted APP_URL must be an HTTPS origin");
if (!process.env.DATABASE_PATH || !isAbsolute(process.env.DATABASE_PATH))
  throw Error("Set DATABASE_PATH to an absolute path on a persistent disk");
const redirects = JSON.parse(
  process.env.OAUTH_REDIRECT_URIS ||
    '["https://chatgpt.com/connector_platform/oauth_redirect"]',
);
if (
  !Array.isArray(redirects) ||
  !redirects.length ||
  redirects.some((value) => {
    try {
      const uri = new URL(value);
      return (
        uri.protocol !== "https:" ||
        Boolean(uri.username || uri.password || uri.hash)
      );
    } catch {
      return true;
    }
  })
)
  throw Error("Configure exact trusted HTTPS OAuth callbacks");
await import("./migrate.mjs");
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "0.0.0.0",
    "--port",
    process.env.PORT || "3000",
  ],
  { stdio: "inherit", env: process.env },
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.once(signal, () => child.kill(signal));
child.once("error", () => process.exit(1));
child.once("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
