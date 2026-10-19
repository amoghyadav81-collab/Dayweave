import { createHash } from "node:crypto";
import { one, run, transaction } from "./database.mjs";
import {
  emptyState,
  runTool,
  changesBetween,
  reverseOperation,
} from "./core.mjs";
import { PlannerError, problem } from "./errors.mjs";
import { sessionUser } from "./security.mjs";
export class ConflictError extends PlannerError {
  constructor(message: string) {
    super("VERSION_CONFLICT", message);
  }
}
export class AuthError extends Error {}
function read(userId: string) {
  const row = one(
    "SELECT payload,version FROM workspaces WHERE user_id=?",
    userId,
  );
  return {
    state: row ? JSON.parse(String(row.payload)) : emptyState(),
    version: row ? String(row.version) : null,
  };
}
export async function load(userId: string) {
  return read(userId);
}
function canonical(value: any): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .filter((k) => value[k] !== undefined)
        .map((k) => JSON.stringify(k) + ":" + canonical(value[k]))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export async function invoke(
  userId: string,
  name: string,
  args: any,
  source: string,
  expectedVersion?: string | null,
  operationId?: string,
) {
  const isRead = ["get_day_plan", "get_planning_context"].includes(name);
  if (isRead) {
    const { state, version } = read(userId);
    const out = runTool(state, name, args, source);
    return { result: out.result, version };
  }
  if (source === "AI" && !operationId)
    problem(
      "OPERATION_ID_REQUIRED",
      "Every AI mutation requires a stable operationId. Reuse it only for an identical retry.",
    );
  if (operationId && !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(operationId))
    problem(
      "INVALID_OPERATION_ID",
      "operationId must be 8–128 ASCII letters, digits, dots, colons, underscores or hyphens.",
    );
  if (expectedVersion === undefined)
    throw new ConflictError(
      "Read the current plan and include expectedVersion before writing.",
    );
  if (expectedVersion !== null && typeof expectedVersion !== "string")
    throw new ConflictError("Invalid version. Reread the planner.");
  const fingerprint = createHash("sha256")
    .update(canonical({ name, args, source, expectedVersion }))
    .digest("hex");
  return transaction(() => {
    if (operationId) {
      const receipt = one(
        "SELECT * FROM planner_operations WHERE user_id=? AND operation_id=?",
        userId,
        operationId,
      );
      if (receipt) {
        if (receipt.fingerprint !== fingerprint)
          problem(
            "OPERATION_ID_REUSED",
            "This operationId was already accepted with different input. Use a NEW ID for a new reviewed operation.",
          );
        return JSON.parse(String(receipt.response));
      }
    }
    const { state, version } = read(userId);
    if (expectedVersion !== version)
      throw new ConflictError(
        "Your plan changed after the read. Reread and replan; preserve newer user edits.",
      );
    let out, target: any;
    if (source === "AI" && name === "undo_last_change") {
      if (
        !args ||
        typeof args.targetOperationId !== "string" ||
        Object.keys(args).some((k) => k !== "targetOperationId")
      )
        problem(
          "RECOVERY_CONFLICT",
          "Specify only targetOperationId of the AI operation to reverse.",
        );
      target = one(
        "SELECT * FROM planner_operations WHERE user_id=? AND operation_id=? AND source=?",
        userId,
        args.targetOperationId,
        "AI",
      );
      if (!target || target.reversed_by)
        problem(
          "RECOVERY_CONFLICT",
          "That operation is unavailable or was already reversed. Reread and replan.",
        );
      out = reverseOperation(
        state,
        JSON.parse(String(target.inverse)),
        args.targetOperationId,
      );
    } else out = runTool(state, name, args, source);
    let nextVersion = version;
    if (out.mutated) {
      nextVersion = crypto.randomUUID();
      out.state.updatedAt = new Date().toISOString();
      out.state.lastChangeSummary = out.result.summary || "Planner updated";
      if (
        Buffer.byteLength(JSON.stringify({ ...out.state, history: [] })) >
        8000000
      )
        throw Error(
          "Planner storage limit reached. Export and remove older activities.",
        );
      let payload = JSON.stringify(out.state);
      while (
        out.state.history.length > 1 &&
        Buffer.byteLength(payload) > 32000000
      ) {
        out.state.history.pop();
        payload = JSON.stringify(out.state);
      }
      if (Buffer.byteLength(payload) > 32000000)
        throw Error("Planner history storage limit reached");
      const result = version
        ? run(
            "UPDATE workspaces SET payload=?,version=? WHERE user_id=? AND version=?",
            payload,
            nextVersion,
            userId,
            version,
          )
        : run(
            "INSERT OR IGNORE INTO workspaces(user_id,payload,version) VALUES(?,?,?)",
            userId,
            payload,
            nextVersion,
          );
      if (!result.changes)
        throw new ConflictError(
          "Another write won. Read the latest plan and replan.",
        );
    }
    const response = {
      result: out.result,
      version: nextVersion,
      ...(operationId ? { operationId } : {}),
    };
    if (operationId) {
      const usage = one(
        "SELECT count(*) AS n,coalesce(sum(length(CAST(response AS BLOB))+length(CAST(inverse AS BLOB))),0) AS bytes FROM planner_operations WHERE user_id=?",
        userId,
      )!;
      const inverse = JSON.stringify(changesBetween(state, out.state)),
        serialized = JSON.stringify(response);
      if (
        Number(usage.n) >= 10000 ||
        Number(usage.bytes) +
          Buffer.byteLength(inverse) +
          Buffer.byteLength(serialized) >
          64000000
      )
        problem(
          "OPERATION_STORAGE_LIMIT",
          "Operation receipt limit reached. Contact the operator; accepted operation IDs are never silently discarded.",
        );
      run(
        "INSERT INTO planner_operations(user_id,operation_id,fingerprint,name,source,response,inverse,created_at) VALUES(?,?,?,?,?,?,?,?)",
        userId,
        operationId,
        fingerprint,
        name,
        source,
        serialized,
        inverse,
        new Date().toISOString(),
      );
      if (target)
        run(
          "UPDATE planner_operations SET reversed_by=? WHERE user_id=? AND operation_id=?",
          operationId,
          userId,
          args.targetOperationId,
        );
    }
    return response;
  });
}
export function identity(req: Request) {
  const user = sessionUser(req.headers);
  if (!user) throw new AuthError("Sign in to access your planner");
  return String(user.id);
}
