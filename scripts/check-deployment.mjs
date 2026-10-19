// Read-only acceptance checks against a deployed origin. Never reads private planner data.
const target = new URL(
  process.argv[2] || process.env.APP_URL || "http://localhost:3000",
);
if (
  target.pathname !== "/" ||
  target.search ||
  target.hash ||
  target.username ||
  target.password
)
  throw Error("Pass an origin only");
if (
  target.protocol !== "https:" &&
  !["localhost", "127.0.0.1"].includes(target.hostname)
)
  throw Error("Public checks require HTTPS");
const origin = target.origin;
async function check(path, expected, options = {}) {
  const r = await fetch(origin + path, {
    signal: AbortSignal.timeout(15000),
    redirect: "manual",
    ...options,
  });
  if (r.status !== expected)
    throw Error(`${path}: expected ${expected}, got ${r.status}`);
  console.log(`${path}: ${r.status}`);
  return r;
}
await check("/api/health", 200);
await check("/login", 200);
const discovery = await (
  await check("/.well-known/oauth-authorization-server", 200)
).json();
for (const key of [
  "issuer",
  "authorization_endpoint",
  "token_endpoint",
  "registration_endpoint",
  "revocation_endpoint",
])
  if (
    key === "issuer"
      ? discovery[key] !== origin
      : new URL(discovery[key]).origin !== origin
  )
    throw Error("Incorrect origin in " + key);
const resource = await (
  await check("/.well-known/oauth-protected-resource/mcp", 200)
).json();
if (
  resource.resource !== origin + "/mcp" ||
  !resource.authorization_servers.includes(origin)
)
  throw Error("Incorrect protected resource metadata");
await check("/api/planner", 401, {
  headers: { "oai-authenticated-user-id": "not-trusted" },
});
const mcp = await check("/mcp", 401, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "oai-authenticated-user-id": "not-trusted",
  },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
});
if (
  !mcp.headers
    .get("www-authenticate")
    ?.includes(origin + "/.well-known/oauth-protected-resource/mcp")
)
  throw Error("Missing authentication challenge");
console.log(
  "Public readiness checks passed. Real account sign-in, two-user OAuth connection, disk persistence and off-host recovery still require acceptance testing.",
);
