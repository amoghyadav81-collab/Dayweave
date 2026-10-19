// Protocol processing is delegated to the maintained node-oauth server.
// Application adapters enforce our fixed resource/audience and hashed SQLite storage.
import OAuth2Server from "@node-oauth/oauth2-server";
import { randomBytes } from "node:crypto";
import { one, run, transaction } from "./database.mjs";
import { base, hash, fail, authorization } from "./security.mjs";
const now = () => Math.floor(Date.now() / 1000);
const random = () => randomBytes(32).toString("base64url");
const clientRow = (id) => {
  const c = one("SELECT * FROM clients WHERE id=?", id);
  return c
    ? {
        id: c.id,
        grants: ["authorization_code", "refresh_token"],
        redirectUris: JSON.parse(c.redirects),
      }
    : null;
};
const userRow = (id) => {
  const user = one("SELECT id,password FROM users WHERE id=?", id);
  return user ? { id: user.id, passwordAtRead: user.password } : null;
};
function server() {
  let refreshGrant = null;
  let requestedClient = null;
  const model = {
    getClient(id) {
      requestedClient = id;
      return clientRow(id);
    },
    validateScope: (_user, _client, scope) =>
      scope?.length === 1 && scope[0] === "planner" ? scope : false,
    verifyScope: (token, scope) => scope.every((s) => token.scope.includes(s)),
    generateAccessToken: random,
    generateRefreshToken: random,
    generateAuthorizationCode: random,
    saveAuthorizationCode(code, client, user) {
      if (userRow(user.id)?.passwordAtRead !== user.passwordAtRead)
        throw new OAuth2Server.InvalidGrantError(
          "Authorization is no longer valid",
        );
      run("DELETE FROM codes WHERE expires<?", now());
      run(
        "INSERT INTO codes VALUES(?,?,?,?,?,?,?)",
        hash(code.authorizationCode),
        client.id,
        user.id,
        code.redirectUri,
        code.codeChallenge,
        base() + "/mcp",
        Math.floor(code.expiresAt.getTime() / 1000),
      );
      return { ...code, client, user };
    },
    getAuthorizationCode(value) {
      const c = one("SELECT * FROM codes WHERE hash=?", hash(value));
      if (!c || c.resource !== base() + "/mcp") return null;
      const user = userRow(c.user_id);
      if (!user) return null;
      return {
        authorizationCode: value,
        expiresAt: new Date(c.expires * 1000),
        redirectUri: c.redirect,
        scope: ["planner"],
        codeChallenge: c.challenge,
        codeChallengeMethod: "S256",
        client: clientRow(c.client_id),
        user,
      };
    },
    revokeAuthorizationCode(code) {
      return Boolean(
        run("DELETE FROM codes WHERE hash=?", hash(code.authorizationCode))
          .changes,
      );
    },
    getRefreshToken(value) {
      const t = one(
        "SELECT tokens.*,grants.client_id,grants.user_id,grants.revoked FROM tokens JOIN grants ON grants.id=tokens.grant_id WHERE hash=? AND kind=?",
        hash(value),
        "refresh",
      );
      if (t?.used && t.client_id === requestedClient)
        run("UPDATE grants SET revoked=1 WHERE id=?", t.grant_id);
      if (!t || t.used || t.revoked) return null;
      refreshGrant = t.grant_id;
      return {
        refreshToken: value,
        refreshTokenExpiresAt: new Date(t.expires * 1000),
        scope: ["planner"],
        client: clientRow(t.client_id),
        user: userRow(t.user_id),
      };
    },
    revokeToken(token) {
      const changed = run(
        "UPDATE tokens SET used=1 WHERE hash=? AND used=0",
        hash(token.refreshToken),
      ).changes;
      if (!changed && refreshGrant)
        run("UPDATE grants SET revoked=1 WHERE id=?", refreshGrant);
      return Boolean(changed);
    },
    saveToken(token, client, user) {
      return transaction(() => {
        const current = userRow(user.id);
        if (!current || current.passwordAtRead !== user.passwordAtRead)
          throw new OAuth2Server.InvalidGrantError(
            "Authorization is no longer valid",
          );
        let grant = refreshGrant;
        if (grant) {
          if (!one("SELECT id FROM grants WHERE id=? AND revoked=0", grant))
            throw new OAuth2Server.InvalidGrantError(
              "Authorization is no longer valid",
            );
        } else {
          grant = random();
          run(
            "INSERT INTO grants(id,user_id,client_id) VALUES(?,?,?)",
            grant,
            user.id,
            client.id,
          );
        }
        run(
          "INSERT INTO tokens VALUES(?,?,?,?,0)",
          hash(token.accessToken),
          grant,
          "access",
          Math.floor(token.accessTokenExpiresAt.getTime() / 1000),
        );
        run(
          "INSERT INTO tokens VALUES(?,?,?,?,0)",
          hash(token.refreshToken),
          grant,
          "refresh",
          Math.floor(token.refreshTokenExpiresAt.getTime() / 1000),
        );
        return { ...token, client, user };
      });
    },
    getAccessToken(value) {
      const t = one(
        "SELECT tokens.*,grants.user_id,grants.client_id,grants.revoked FROM tokens JOIN grants ON grants.id=tokens.grant_id WHERE tokens.hash=? AND kind=? AND used=0 AND revoked=0",
        hash(value),
        "access",
      );
      if (!t) return null;
      return {
        accessToken: value,
        accessTokenExpiresAt: new Date(t.expires * 1000),
        scope: ["planner"],
        client: clientRow(t.client_id),
        user: { id: t.user_id },
        grantId: t.grant_id,
      };
    },
  };
  return new OAuth2Server({
    model,
    accessTokenLifetime: 900,
    refreshTokenLifetime: 2592000,
    authorizationCodeLifetime: 300,
    requirePKCE: true,
    enablePlainPKCE: false,
    requireClientAuthentication: {
      authorization_code: false,
      refresh_token: false,
    },
    alwaysIssueNewRefreshToken: true,
  });
}
export async function authorize(params, user) {
  const { p } = authorization(params),
    response = new OAuth2Server.Response();
  await server().authorize(
    new OAuth2Server.Request({ method: "GET", query: p, headers: {} }),
    response,
    {
      authenticateHandler: {
        handle: () => {
          const current = userRow(user.id);
          return current?.passwordAtRead === user.password ? current : false;
        },
      },
      allowEmptyState: false,
    },
  );
  const url = new URL(response.headers.location);
  url.searchParams.set("iss", base());
  return url.href;
}
export async function exchange(p) {
  if (p.resource !== base() + "/mcp") fail("invalid_target");
  if (!["authorization_code", "refresh_token"].includes(p.grant_type))
    fail("unsupported_grant_type");
  if (p.grant_type === "refresh_token") {
    const old = one(
      "SELECT tokens.*,grants.client_id FROM tokens JOIN grants ON grants.id=tokens.grant_id WHERE hash=?",
      hash(p.refresh_token || ""),
    );
    if (old?.used && old.client_id === p.client_id) {
      run("UPDATE grants SET revoked=1 WHERE id=?", old.grant_id);
      throw new OAuth2Server.InvalidGrantError(
        "Authorization is no longer valid",
      );
    }
  }
  const response = new OAuth2Server.Response();
  try {
    await server().token(
      new OAuth2Server.Request({
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "content-length": String(
            Buffer.byteLength(new URLSearchParams(p).toString()),
          ),
        },
        body: p,
        query: {},
      }),
      response,
    );
    return {
      ...response.body,
      scope: Array.isArray(response.body.scope)
        ? response.body.scope.join(" ")
        : response.body.scope,
    };
  } catch (error) {
    throw Object.assign(
      Error(error.name || "invalid_request", { cause: error }),
      {
        status: error.status || error.code || 400,
      },
    );
  }
}
export async function bearer(req) {
  if (!req.headers.get("authorization")) return null;
  try {
    const token = await server().authenticate(
      new OAuth2Server.Request({
        method: req.method,
        // HTTP authentication schemes are case-insensitive; the library parser expects canonical casing.
        headers: {
          authorization: req.headers
            .get("authorization")
            .replace(/^Bearer[ \t]+/i, "Bearer "),
        },
        query: {},
      }),
      new OAuth2Server.Response(),
      { scope: ["planner"], allowBearerTokensInQueryString: false },
    );
    return { user_id: token.user.id, id: token.grantId };
  } catch {
    return null;
  }
}
