import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import type {
  UpdateSubtaskRequest,
  UpdateSubtaskResponse,
  TaskStatus,
  WorkflowState,
  EntityType,
} from "@tm/shared";
import { ok, badRequest, unauthorized, notFound, internalError, conflict } from "../lib/http";
import { withHttp } from "../lib/handler";
import type { HttpHandlerContext } from "../lib/handler";
import { getSubtask, updateSubtask } from "../tasks/repo";
import { log, toErrorInfo } from "../lib/log";
import { parseJsonBody } from "../lib/request";
import { normalizeNullable, validateAttrs, validateDueDate, validateEffort, validatePriority } from "../tasks/validate";
import {
  canTransition,
  deriveV2Defaults,
  isEntityType,
  isWorkflowState,
  mergeTaskPatch,
  validateMergedTask,
} from "../tasks/gtd";

function isUuidV4(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function isStatus(v: any): v is TaskStatus {
  return v === "OPEN" || v === "COMPLETED";
}

export const handler = withHttp(async (
  event: APIGatewayProxyEventV2,
  ctx: HttpHandlerContext
): Promise<APIGatewayProxyResultV2> => {
  const requestId = ctx.requestId;
  const sub = ctx.sub;
  if (!sub) return unauthorized("Unauthorized", requestId);

  const parentTaskId = event.pathParameters?.taskId;
  if (!parentTaskId) return badRequest("Missing taskId", undefined, requestId);
  if (!isUuidV4(parentTaskId)) return badRequest("Invalid taskId", undefined, requestId);

  const subtaskId = event.pathParameters?.subtaskId;
  if (!subtaskId) return badRequest("Missing subtaskId", undefined, requestId);
  if (!isUuidV4(subtaskId)) return badRequest("Invalid subtaskId", undefined, requestId);

  const body = parseJsonBody(event) as UpdateSubtaskRequest | null;
  if (!body) return badRequest("Invalid JSON body", undefined, requestId);

  const patch: UpdateSubtaskRequest = {};

  if (body.title !== undefined) {
    if (typeof body.title !== "string") return badRequest("title must be a string", undefined, requestId);
    const t = body.title.trim();
    if (!t) return badRequest("title cannot be empty", undefined, requestId);
    if (t.length > 200) return badRequest("title too long (max 200 chars)", undefined, requestId);
    patch.title = t;
  }

  if (body.description !== undefined) {
    if (body.description !== null && typeof body.description !== "string") {
      return badRequest("description must be a string", undefined, requestId);
    }
    const d = typeof body.description === "string" ? body.description.trim() : "";
    if (d.length > 2000) return badRequest("description too long (max 2000 chars)", undefined, requestId);
    patch.description = d || undefined;
  }

  if (body.dueDate !== undefined) {
    const r = normalizeNullable(body.dueDate, validateDueDate, "dueDate");
    if (!r.ok) return badRequest(r.message, undefined, requestId);
    patch.dueDate = r.value as any;
  }

  if ((body as any).priority !== undefined) {
    const r = normalizeNullable((body as any).priority, validatePriority, "priority");
    if (!r.ok) return badRequest(r.message, undefined, requestId);
    patch.priority = r.value as any;
  }

  if ((body as any).effort !== undefined) {
    const r = normalizeNullable((body as any).effort, validateEffort, "effort");
    if (!r.ok) return badRequest(r.message, undefined, requestId);
    patch.effort = r.value as any;
  }

  if ((body as any).attrs !== undefined) {
    const r = normalizeNullable((body as any).attrs, validateAttrs, "attrs");
    if (!r.ok) return badRequest(r.message, undefined, requestId);
    patch.attrs = r.value as any;
  }

  let expectedRev: number | undefined;
  if (body.expectedRev !== undefined) {
    if (!Number.isInteger(body.expectedRev) || body.expectedRev < 0) {
      return badRequest("expectedRev must be a non-negative integer", undefined, requestId);
    }
    expectedRev = body.expectedRev;
  }

  // v2 fields
  if ((body as any).entityType !== undefined) {
    const v = (body as any).entityType;
    if (!isEntityType(v)) return badRequest("entityType must be 'project' or 'action'", undefined, requestId);
    (patch as any).entityType = v as EntityType;
  }

  if ((body as any).state !== undefined) {
    const v = (body as any).state;
    if (!isWorkflowState(v)) return badRequest("state is invalid", undefined, requestId);
    (patch as any).state = v as WorkflowState;
  }

  if ((body as any).context !== undefined) {
    const v = (body as any).context;
    if (v !== null && typeof v !== "string") return badRequest("context must be a string or null", undefined, requestId);
    (patch as any).context = v as any;
  }

  if ((body as any).waitingFor !== undefined) {
    const v = (body as any).waitingFor;
    if (v !== null && typeof v !== "string") return badRequest("waitingFor must be a string or null", undefined, requestId);
    (patch as any).waitingFor = v as any;
  }

  // Legacy status mapping:
  // - If state is provided, status is derived server-side.
  // - If only status is provided, map it to a state transition.
  if ((body as any).status !== undefined) {
    const v = (body as any).status;
    if (!isStatus(v)) return badRequest("status must be OPEN or COMPLETED", undefined, requestId);
    patch.status = v;
    if ((body as any).state === undefined) {
      (patch as any).state = v === "COMPLETED" ? "completed" : "inbox";
    }
  }

  if (Object.keys(patch).length === 0) return badRequest("No fields to update", undefined, requestId);

  const now = new Date().toISOString();

  try {
    const current = await getSubtask(sub, parentTaskId, subtaskId);
    if (!current) return notFound("Subtask not found", requestId);

    const v2 = deriveV2Defaults(current);

    // If current is v1, persist v2 defaults as part of this update.
    if (!current.schemaVersion || current.schemaVersion !== 2) {
      (patch as any).schemaVersion = 2;
      if (!current.entityType && (patch as any).entityType === undefined) (patch as any).entityType = v2.entityType;
      if (!current.state && (patch as any).state === undefined) (patch as any).state = v2.state;
    }

    const fromState = (current.state ?? v2.state);
    const merged = mergeTaskPatch({ ...current, ...v2 }, patch);

    if (!merged.state) return badRequest("Missing state", undefined, requestId);
    if (!canTransition(fromState, merged.state)) {
      return badRequest(`Invalid state transition ${fromState} -> ${merged.state}`, undefined, requestId);
    }

    const vr = validateMergedTask(merged);
    if (!vr.ok) return badRequest(vr.message, undefined, requestId);

    // Always derive legacy status from state
    patch.status = merged.status;

    const updated = await updateSubtask(sub, parentTaskId, subtaskId, patch, now, undefined, expectedRev);
    if (!updated) return notFound("Subtask not found", requestId);

    const resp: UpdateSubtaskResponse = { task: updated };
    return ok(resp, requestId);
  } catch (e: any) {
    if (e?.name === "ConditionalCheckFailedException") {
      if (expectedRev !== undefined) return conflict("Revision conflict", { expectedRev }, requestId);
      return notFound("Subtask not found", requestId);
    }
    log("error", "subtasks.update_failed", { requestId, sub, parentTaskId, subtaskId, error: toErrorInfo(e) });
    return internalError("Failed to update subtask", undefined, requestId);
  }
});