export {authorize,exchange,bearer} from './oauth.mjs';
import {
  randomBytes,
  createHash,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { one, run, transaction } from "./database.mjs";
export const base = () => {
  const u = new URL(process.env.APP_URL || "http://localhost:3000");
  if (u.pathname !== "/" || u.search || u.hash || u.username || u.password)
    throw Error("APP_URL must be an origin");
  if (
    u.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(u.hostname)
  )
    throw Error("Public APP_URL requires HTTPS");
  return u.origin;
};
export const hash = (s) => createHash("sha256").update(s).digest("hex");
const secret = () => randomBytes(32).toString("base64url");
const now = () => Math.floor(Date.now() / 1000);
export function fail(message, status = 400) {
  throw Object.assign(Error(message), { status });
}
export function origin(req) {
  if (req.headers.get("origin") !== base()) fail("Invalid origin", 403);
}
export function sessionUser(headers) {
  const token = headers
    .get("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("dayweave_session="))
    ?.slice(17);
  if (!token) return null;
  return (
    one(
      "SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE hash=? AND expires>?",
      hash(token),
      now(),
    ) || null
  );
}
export function cookie(token, age = 604800) {
  return `dayweave_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${base().startsWith("https:") ? "; Secure" : ""}`;
}
export function rate(key, max = 20) {
  const t = now();
  run("DELETE FROM limits WHERE expires<?", t);
  run(
    "INSERT INTO limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1",
    key,
    t + 900,
  );
  if (Number(one("SELECT count FROM limits WHERE key=?", key).count) > max)
    fail("Too many attempts; retry in 15 minutes", 429);
}
const passwordHash = (p) => {
  const salt = secret();
  return salt + ":" + scryptSync(p, salt, 64).toString("hex");
};
const verify = (p, h) => {
  const [salt, key] = h.split(":");
  return timingSafeEqual(Buffer.from(key, "hex"), scryptSync(p, salt, 64));
};
export function authenticate(email, password, invite, signup = false) {
  email = String(email || "")
    .trim()
    .toLowerCase();
  password = String(password || "");
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254 ||
    password.length < 12 ||
    password.length > 256
  )
    fail("Use a valid email and a password of 12–256 characters");
  if (signup) {
    if (
      !process.env.SIGNUP_INVITE_CODE ||
      !invite ||
      hash(String(invite)) !== hash(process.env.SIGNUP_INVITE_CODE)
    )
      fail("Invalid invitation code", 403);
  }
  // Invalid invitations must not consume an existing user's sign-in budget.
  // Keep invited registration separate from password authentication limits.
  rate((signup ? "signup:" : "login:") + hash(email), 10);
  rate(signup ? "signup:global" : "auth:global", 100);
  if (signup) {
    try {
      run(
        "INSERT INTO users VALUES(?,?,?)",
        secret(),
        email,
        passwordHash(password),
      );
    } catch {
      fail("Unable to create account");
    }
  }
  const user = one("SELECT * FROM users WHERE email=?", email);
  const dummy =
    "dummy:" + scryptSync("not-the-password", "dummy", 64).toString("hex");
  if (!verify(password, user?.password || dummy) || !user)
    fail("Invalid email or password", 401);
  const token = secret();
  run("DELETE FROM sessions WHERE expires<?", now());
  run(
    "INSERT INTO sessions VALUES(?,?,?)",
    hash(token),
    user.id,
    now() + 604800,
  );
  return token;
}
const redirects = () =>
  JSON.parse(
    process.env.OAUTH_REDIRECT_URIS ||
      '["https://chatgpt.com/connector_platform/oauth_redirect"]',
  );
export function register(body) {
  rate("registration", 50);
  if (
    body.token_endpoint_auth_method &&
    body.token_endpoint_auth_method !== "none"
  )
    fail(
      "Only public clients with token_endpoint_auth_method=none are supported",
    );
  if (
    body.grant_types?.some(
      (x) => !["authorization_code", "refresh_token"].includes(x),
    ) ||
    body.response_types?.some((x) => x !== "code")
  )
    fail("Unsupported grant or response type");
  if (
    !Array.isArray(body.redirect_uris) ||
    !body.redirect_uris.length ||
    body.redirect_uris.length > 10 ||
    body.redirect_uris.some(
      (u) => typeof u !== "string" || !redirects().includes(u),
    )
  )
    fail(
      "Redirect URI is not allowed; administrator must configure the exact callback URI",
    );
  const id = secret();
  const name = String(body.client_name || "MCP client").slice(0, 100);
  run(
    "INSERT INTO clients VALUES(?,?,?)",
    id,
    name,
    JSON.stringify(body.redirect_uris),
  );
  return {
    client_id: id,
    client_id_issued_at: now(),
    client_name: name,
    redirect_uris: body.redirect_uris,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  };
}
export function authorization(params) {
  const p = Object.fromEntries(params);
  const client = one("SELECT * FROM clients WHERE id=?", p.client_id || "");
  if (!client || !JSON.parse(client.redirects).includes(p.redirect_uri))
    fail("Invalid client or redirect_uri");
  if (
    p.response_type !== "code" ||
    p.code_challenge_method !== "S256" ||
    !/^[-\w]{43}$/.test(p.code_challenge || "") ||
    p.resource !== base() + "/mcp" ||
    p.scope !== "planner" ||
    !p.state ||
    p.state.length > 2048
  )
    fail(
      "Authorization requires code, S256 PKCE, state, resource and planner scope",
    );
  return { p, client };
}
export function revoke(p) {
  const t = one(
    "SELECT grants.id,grants.client_id FROM tokens JOIN grants ON grants.id=tokens.grant_id WHERE hash=?",
    hash(p.token || ""),
  );
  if (t && t.client_id === p.client_id)
    run("UPDATE grants SET revoked=1 WHERE id=?", t.id);
}
export const metadata = () => ({
  issuer: base(),
  authorization_endpoint: base() + "/oauth/authorize",
  token_endpoint: base() + "/oauth/token",
  registration_endpoint: base() + "/oauth/register",
  revocation_endpoint: base() + "/oauth/revoke",
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  code_challenge_methods_supported: ["S256"],
  token_endpoint_auth_methods_supported: ["none"],
  revocation_endpoint_auth_methods_supported: ["none"],
  scopes_supported: ["planner"],
  authorization_response_iss_parameter_supported: true,
});

function requirePassword(userId, password) {
  rate("account:" + userId, 10);
  const user = one("SELECT * FROM users WHERE id=?", userId);
  if (!user || !verify(String(password || ""), user.password))
    fail("Current password is incorrect", 403);
  return user;
}
function revokeUserCredentials(userId) {
  run("DELETE FROM sessions WHERE user_id=?", userId);
  run("DELETE FROM codes WHERE user_id=?", userId);
  run("UPDATE grants SET revoked=1 WHERE user_id=?", userId);
}
export function changePassword(userId, current, next) {
  requirePassword(userId, current);
  if (typeof next !== "string" || next.length < 12 || next.length > 256)
    fail("Use a password of 12–256 characters");
  const encoded = passwordHash(next);
  const token = secret();
  transaction(() => {
    run("UPDATE users SET password=? WHERE id=?", encoded, userId);
    revokeUserCredentials(userId);
    run(
      "INSERT INTO sessions VALUES(?,?,?)",
      hash(token),
      userId,
      now() + 604800,
    );
  });
  return token;
}
export function deleteAccount(userId, password, confirmation) {
  requirePassword(userId, password);
  if (confirmation !== "DELETE")
    fail("Type DELETE to confirm account deletion");
  transaction(() => {
    revokeUserCredentials(userId);
    run(
      "DELETE FROM tokens WHERE grant_id IN (SELECT id FROM grants WHERE user_id=?)",
      userId,
    );
    run("DELETE FROM grants WHERE user_id=?", userId);
    run("DELETE FROM planner_operations WHERE user_id=?", userId);
    run("DELETE FROM workspaces WHERE user_id=?", userId);
    run("DELETE FROM users WHERE id=?", userId);
  });
}
