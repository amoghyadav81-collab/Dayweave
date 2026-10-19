import { writeFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
const domain = process.argv[2];
if (
  !domain ||
  domain.length > 253 ||
  !/^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain) ||
  domain === "localhost"
)
  throw Error("Pass a public DNS hostname without https:// or a path");
if (existsSync(".env.production"))
  throw Error(
    "Existing .env.production preserved. Edit it securely instead of regenerating credentials.",
  );
writeFileSync(
  ".env.production",
  `DAYWEAVE_DOMAIN=${domain}\nSIGNUP_INVITE_CODE=${randomBytes(32).toString("base64url")}\nOAUTH_REDIRECT_URIS=["https://chatgpt.com/connector_platform/oauth_redirect"]\n`,
  { mode: 0o600, flag: "wx" },
);
console.log(
  "Created protected .env.production. It contains the invitation code; share that securely with invited users. No secret values were printed.",
);
