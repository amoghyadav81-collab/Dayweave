export class PlannerError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "PlannerError";
    this.code = code;
    this.details = details;
    this.status = [
      "VERSION_CONFLICT",
      "OPERATION_ID_REUSED",
      "RECOVERY_CONFLICT",
      "PROTECTED_ACTIVITY",
    ].includes(code)
      ? 409
      : 400;
  }
}
export const problem = (code, message, details = {}) => {
  throw new PlannerError(code, message, details);
};
export function structuredError(error) {
  return {
    code: error.code || "INVALID_REQUEST",
    message: error.message || "Request failed",
    ...(error.details || {}),
    retryable: false,
    ...(["VERSION_CONFLICT", "RECOVERY_CONFLICT"].includes(error.code)
      ? {
          action: "REREAD_AND_REPLAN",
          instructions:
            "Read get_planning_context/get_day_plan again. Preserve newer user changes; review a new plan and use a NEW operationId. Do not blindly retry with a new version.",
        }
      : {}),
  };
}
