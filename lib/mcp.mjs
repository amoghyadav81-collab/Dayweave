import { tools } from "./core.mjs";
import { structuredError } from "./errors.mjs";
export const responseHeaders = {
  "MCP-Protocol-Version": "2025-11-25",
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
export async function handleMcp(body, invoke) {
  const id = body?.id ?? null;
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    body.jsonrpc !== "2.0" ||
    typeof body.method !== "string"
  )
    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32600, message: "Invalid JSON-RPC request" },
    };
  let result;
  switch (body.method) {
    case "server/discover":
      result = {
        supportedVersions: ["2025-11-25"],
        capabilities: { tools: {} },
      };
      break;
    case "initialize":
      result = {
        protocolVersion: [
          "2025-11-25",
          "2025-06-18",
          "2025-03-26",
          "2024-11-05",
        ].includes(body.params?.protocolVersion)
          ? body.params.protocolVersion
          : "2025-11-25",
        capabilities: { tools: {} },
        serverInfo: { name: "dayweave", version: "2.1.0" },
        instructions:
          "Read get_planning_context and get_day_plan before writing. Preserve fixed tasks and completed work, reuse IDs, and respect the saved timezone. All mutations require expectedVersion and a stable operationId. After a lost response retry IDENTICAL input/version/ID. On a conflict reread and replan with a NEW ID. Use one upsert_activities batch for related changes. AI undo requires targetOperationId; it never restores a global snapshot. Reminders are browser-only while the app is open. Scheduling must be configured separately in the AI client.",
      };
      break;
    case "notifications/initialized":
      return null;
    case "ping":
      result = {};
      break;
    case "tools/list":
      result = { tools };
      break;
    case "tools/call":
      try {
        if (!tools.some((t) => t.name === body.params?.name))
          throw Error("Unknown tool");
        const output = await invoke(
          body.params.name,
          body.params.arguments || {},
        );
        result = {
          structuredContent: {
            ...output.result,
            version: output.version,
            ...(output.operationId ? { operationId: output.operationId } : {}),
          },
          content: [
            {
              type: "text",
              text: JSON.stringify({
                ...output.result,
                version: output.version,
                ...(output.operationId
                  ? { operationId: output.operationId }
                  : {}),
              }),
            },
          ],
        };
      } catch (e) {
        result = {
          isError: true,
          structuredContent: { error: structuredError(e) },
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: structuredError(e) }),
            },
          ],
        };
      }
      break;
    default:
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: "Method not found" },
      };
  }
  return { jsonrpc: "2.0", id, result };
}
