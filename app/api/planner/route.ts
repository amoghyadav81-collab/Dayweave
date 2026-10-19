import { PlannerError, structuredError } from "@/lib/errors.mjs";
import { base } from "@/lib/security.mjs";
import { limitedText } from "@/lib/http.mjs";
import { identity, load, invoke, ConflictError, AuthError } from "@/lib/store";
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
export async function GET(req: Request) {
  try {
    const uid = identity(req);
    const data = await load(uid);
    return Response.json(
      { ...data.state, scope: uid, version: data.version },
      { headers },
    );
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof AuthError
            ? "Sign in to load your planner."
            : "Your planner could not be loaded. Please retry.",
      },
      { status: e instanceof AuthError ? 401 : 503, headers },
    );
  }
}
export async function POST(req: Request) {
  try {
    const uid = identity(req);
    const origin = req.headers.get("origin");
    if (!origin || origin !== base())
      return Response.json(
        { error: "Invalid origin" },
        { status: 403, headers },
      );
    if (Number(req.headers.get("content-length") || 0) > 9000000)
      return Response.json(
        { error: "Request too large" },
        { status: 413, headers },
      );
    const raw = await limitedText(req, 9000000);
    if (raw.length > 9000000)
      return Response.json(
        { error: "Request too large" },
        { status: 413, headers },
      );
    const { name, args, expectedVersion, operationId, scope } = JSON.parse(raw);
    if (scope !== uid)
      return Response.json(
        { error: "Your signed-in account changed. Reload the page." },
        { status: 403, headers },
      );
    if (
      ![
        "upsert_activities",
        "set_activity_status",
        "delete_activity",
        "update_preferences",
        "undo_last_change",
        "import_backup",
      ].includes(name)
    )
      throw Error("Unsupported action");
    if (expectedVersion === undefined)
      throw Error("Missing plan version. Refresh and retry.");
    return Response.json(
      await invoke(uid, name, args, "You", expectedVersion, operationId),
      { headers },
    );
  } catch (e) {
    const status =
      e instanceof AuthError ? 401 : e instanceof PlannerError ? e.status : 400;
    return Response.json(
      {
        error: e instanceof Error ? e.message : "Update failed",
        ...(e instanceof PlannerError ? { problem: structuredError(e) } : {}),
      },
      { status, headers },
    );
  }
}
