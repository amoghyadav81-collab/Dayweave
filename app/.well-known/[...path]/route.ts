import { base, metadata } from "@/lib/security.mjs";
export const dynamic = "force-dynamic";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const path = (await params).path.join("/");
  if (path === "oauth-authorization-server") return Response.json(metadata());
  if (
    ["oauth-protected-resource", "oauth-protected-resource/mcp"].includes(path)
  )
    return Response.json({
      resource: base() + "/mcp",
      authorization_servers: [base()],
      scopes_supported: ["planner"],
      bearer_methods_supported: ["header"],
      resource_name: "Dayweave planner",
    });
  return new Response(null, { status: 404 });
}
