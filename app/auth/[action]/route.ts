import { limitedText } from "@/lib/http.mjs";
import {
  authenticate,
  origin,
  cookie,
  hash,
  sessionUser,
  changePassword,
  deleteAccount,
} from "@/lib/security.mjs";
import { run } from "@/lib/database.mjs";
export async function POST(
  req: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  try {
    origin(req);
    if (Number(req.headers.get("content-length") || 0) > 10000)
      return new Response("Too large", { status: 413 });
    const p = Object.fromEntries(
      new URLSearchParams(await limitedText(req, 10000)),
    );
    const { action } = await params;
    if (action === "logout") {
      const token = req.headers
        .get("cookie")
        ?.match(/(?:^|; )dayweave_session=([^;]+)/)?.[1];
      if (token) run("DELETE FROM sessions WHERE hash=?", hash(token));
      return new Response(null, {
        status: 303,
        headers: {
          Location: "/login",
          "Set-Cookie": cookie("", 0),
          "Clear-Site-Data": '"cache", "cookies", "storage"',
        },
      });
    }
    if (action === "password" || action === "delete") {
      const u = sessionUser(req.headers);
      if (!u) return new Response("Unauthorized", { status: 401 });
      if (action === "password") {
        const token = changePassword(
          String(u.id),
          p.current_password,
          p.new_password,
        );
        return new Response(null, {
          status: 303,
          headers: {
            Location: "/account?notice=password-changed",
            "Set-Cookie": cookie(token),
            "Cache-Control": "no-store",
          },
        });
      }
      deleteAccount(String(u.id), p.password, p.confirmation);
      return new Response(null, {
        status: 303,
        headers: {
          Location: "/login?notice=account-deleted",
          "Clear-Site-Data": '"cache", "cookies", "storage"',
          "Set-Cookie": cookie("", 0),
          "Cache-Control": "no-store",
        },
      });
    }
    if (action === "revoke") {
      const u = sessionUser(req.headers);
      if (!u) return new Response("Unauthorized", { status: 401 });
      run(
        "UPDATE grants SET revoked=1 WHERE id=? AND user_id=?",
        String(p.grant),
        u.id,
      );
      return new Response(null, {
        status: 303,
        headers: { Location: "/account" },
      });
    }
    if (!["signup", "login"].includes(action))
      return new Response("Not found", { status: 404 });
    const token = authenticate(
      p.email,
      p.password,
      p.invite,
      action === "signup",
    );
    const path = String(p.return_to || "/");
    const dest = new URL(path, "http://safe.local");
    return new Response(null, {
      status: 303,
      headers: {
        Location:
          dest.origin === "http://safe.local"
            ? dest.pathname + dest.search
            : "/",
        "Set-Cookie": cookie(token),
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    if (req.headers.get("accept")?.includes("text/html")) {
      const action = (await params).action;
      const location = ["password", "delete", "revoke"].includes(action)
        ? "/account?notice=action-failed"
        : "/login?notice=sign-in-failed";
      return new Response(null, {
        status: 303,
        headers: { Location: location, "Cache-Control": "no-store" },
      });
    }
    return new Response(e.message, {
      status: e.status || 400,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
