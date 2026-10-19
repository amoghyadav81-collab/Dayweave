import { handleMcp, responseHeaders } from "@/lib/mcp.mjs";
import { invoke, AuthError } from "@/lib/store";
import { bearer, base } from "@/lib/security.mjs";
import { limitedText } from "@/lib/http.mjs";
export async function POST(req: Request) {
  try {
    const auth = await bearer(req);
    if (!auth) throw new AuthError("Authentication required");
    const uid = String(auth.user_id);
    const origin = req.headers.get("origin");
    if (origin && origin !== base())
      return new Response("Invalid origin", { status: 403 });
    if (Number(req.headers.get("content-length") || 0) > 500000)
      return Response.json(
        { error: "Request too large" },
        { status: 413, headers: responseHeaders },
      );
    const raw = await limitedText(req, 500000);
    if (raw.length > 500000)
      return Response.json(
        { error: "Request too large" },
        { status: 413, headers: responseHeaders },
      );
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return Response.json(
        {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: "Invalid JSON" },
        },
        { status: 400, headers: responseHeaders },
      );
    }
    const result = await handleMcp(
      body,
      async (name: string, args: Record<string, unknown>) => {
        const { expectedVersion, operationId, ...argumentsOnly } = args;
        return invoke(
          uid,
          name,
          argumentsOnly,
          "AI",
          typeof expectedVersion === "string" || expectedVersion === null
            ? expectedVersion
            : undefined,
          typeof operationId === "string" ? operationId : undefined,
        );
      },
    );
    return result === null
      ? new Response(null, { status: 202, headers: responseHeaders })
      : Response.json(result, { headers: responseHeaders });
  } catch (e) {
    return Response.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32000,
          message:
            e instanceof AuthError
              ? "Authentication required"
              : "MCP request failed",
        },
      },
      {
        status: e instanceof AuthError ? 401 : 500,
        headers: {
          ...responseHeaders,
          ...(e instanceof AuthError
            ? {
                "WWW-Authenticate": `Bearer ${req.headers.has("authorization") ? 'error="invalid_token", ' : ""}resource_metadata="${base()}/.well-known/oauth-protected-resource/mcp", scope="planner"`,
              }
            : {}),
        },
      },
    );
  }
}

export async function GET() {
  return new Response(null, {
    status: 405,
    headers: { Allow: "POST", "Cache-Control": "no-store" },
  });
}
