import {
  base,
  register,
  authorization,
  authorize,
  exchange,
  revoke,
  origin,
  sessionUser,
} from "@/lib/security.mjs";
import { limitedText, privateHeaders } from "@/lib/http.mjs";
export const runtime = "nodejs";
const esc = (s: unknown) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
function error(e: any, action?: string) {
  const known = new Set([
    "invalid_request",
    "invalid_client",
    "invalid_grant",
    "unauthorized_client",
    "unsupported_grant_type",
    "invalid_scope",
    "invalid_target",
    "access_denied",
    "server_error",
    "temporarily_unavailable",
    "invalid_redirect_uri",
    "invalid_client_metadata",
  ]);
  const code = known.has(e.name)
    ? e.name
    : known.has(e.message)
      ? e.message
      : action === "register"
        ? "invalid_client_metadata"
        : "invalid_request";
  const status = Number(e.status || e.code || 400);
  return Response.json(
    { error: code, error_description: e.message },
    {
      status:
        Number.isInteger(status) && status >= 400 && status <= 599
          ? status
          : 400,
      headers: privateHeaders,
    },
  );
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  try {
    if ((await params).action !== "authorize")
      return new Response(null, { status: 404 });
    const url = new URL(req.url);
    const { p, client } = authorization(url.searchParams);
    const user = sessionUser(req.headers);
    if (!user)
      return new Response(null, {
        status: 303,
        headers: {
          ...privateHeaders,
          Location:
            "/login?return_to=" + encodeURIComponent(url.pathname + url.search),
        },
      });
    return new Response(
      `<!doctype html><html><head><meta name="viewport" content="width=device-width"><title>Authorize Dayweave</title></head><body style="font:18px system-ui;max-width:540px;margin:40px auto;padding:20px"><h1>Connect ${esc(client!.name)}?</h1><p>Signed in as ${esc(user.email)}.</p><p>This client can read your life brief and planner, create and edit activities, change preferences, and undo changes. It cannot access other users’ records. Only approve a client you trust.</p><form method="post">${Object.entries(
        p,
      )
        .map(
          ([k, v]) =>
            `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`,
        )
        .join(
          "",
        )}<button name="decision" value="approve">Approve planner access</button> <button name="decision" value="deny">Deny</button></form></body></html>`,
      {
        headers: {
          ...privateHeaders,
          "Content-Security-Policy": `frame-ancestors 'none'; base-uri 'none'; form-action 'self' ${new URL(p.redirect_uri).origin}`,
          "Content-Type": "text/html; charset=utf-8",
        },
      },
    );
  } catch (e) {
    return error(e, (await params).action);
  }
}
export async function POST(
  req: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  try {
    const { action } = await params;
    const raw = await limitedText(req, 16000);
    if (action === "register")
      return Response.json(register(JSON.parse(raw)), {
        status: 201,
        headers: privateHeaders,
      });
    const p = Object.fromEntries(new URLSearchParams(raw));
    if (action === "authorize") {
      origin(req);
      const u = sessionUser(req.headers);
      if (!u) return new Response(null, { status: 401 });
      const { p: checked } = authorization(new URLSearchParams(raw));
      let location;
      if (p.decision === "approve")
        location = await authorize(new URLSearchParams(raw), u);
      else {
        const url = new URL(checked.redirect_uri);
        url.searchParams.set("error", "access_denied");
        url.searchParams.set("state", checked.state);
        url.searchParams.set("iss", base());
        location = url.href;
      }
      return new Response(null, {
        status: 303,
        headers: { ...privateHeaders, Location: location },
      });
    }
    if (action === "token")
      return Response.json(await exchange(p), { headers: privateHeaders });
    if (action === "revoke") {
      revoke(p);
      return new Response(null, { status: 200, headers: privateHeaders });
    }
    return new Response(null, { status: 404 });
  } catch (e) {
    return error(e, (await params).action);
  }
}
