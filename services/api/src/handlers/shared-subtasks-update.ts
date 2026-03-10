import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import type { EntityType, TaskStatus, UpdateSubtaskRequest, UpdateSubtaskResponse, WorkflowState } from "@tm/shared";
import { badRequest, conflict, forbidden, internalError, notFound, ok, unauthorized } from "../lib/http";
import { withHttp } from "../lib/handler";
import type { HttpHandlerContext } from "../lib/handler";
import { parseJsonBody } from "../lib/request";
import { log, toErrorInfo } from "../lib/log";
import { getSubtask, updateSubtask } from "../tasks/repo";
import { getLookup, getSharedPointer } from "../tasks/sharing";
import { normalizeNullable, validateAttrs, validateDueDate, validateEffort, validateMinimumDuration, validatePriority } from "../tasks/validate";
import { canTransition, deriveV2Defaults, isEntityType, isWorkflowState, mergeTaskPatch, validateMergedTask } from "../tasks/gtd";

function isUuidV4(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function isStatus(v: any): v is TaskStatus {
  return v === "OPEN" || v === "COMPLETED";
}

function isBoundedString(v: unknown, maxLen: number): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= maxLen;
}

export const handler = withHttp(async (
  event: APIGatewayProxyEventV2,
  ctx: HttpHandlerContext
): Promise<APIGatewayProxyResultV2> => {
  const requestId = ctx.requestId;
  const viewerSub = ctx.sub;
  if (!viewerSub) return unauthorized("Unauthorized", requestId);

  const ownerSub = event.pathParameters?.ownerSub;
  if (!isBoundedString(ownerSub, 128)) return badRequest("Missing ownerSub", undefined, requestId);

  const rootTaskId = event.pathParameters?.rootTaskId;
  if (!rootTaskId) return badRequest("Missing rootTaskId", undefined, requestId);
  if (!isUuidV4(rootTaskId)) return badRequest("Invalid rootTaskId", undefined, requestId);

  const parentTaskId = event.pathParameters?.parentTaskId;
  if (!parentTaskId) return badRequest("Missing parentTaskId", undefined, requestId);
  if (!isUuidV4(parentTaskId)) return badRequest("Invalid parentTaskId", undefined, requestId);

  const subtaskId = event.pathParameters?.subtaskId;
  if (!subtaskId) return badRequest("Missing subtaskId", undefined, requestId);
  if (!isUuidV4(subtaskId)) return badRequest("Invalid subtaskId", undefined, requestId);

  const ptr = await getSharedPointer(viewerSub, ownerSub, rootTaskId);
  if (!ptr) return forbidden("Not shared with you", requestId);
  if (ptr.mode !== "EDIT") return forbidden("Read-only share", requestId);

  const lookup = await getLookup(ownerSub, subtaskId);
  if (!lookup || lookup.rootTaskId !== rootTaskId || lookup.parentTaskId !== parentTaskId) {
    return forbidden("Invalid subtask for this shared root", requestId);
  }

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
    if (body.description !== null && typeof body.description !== "string") return badRequest("description must be a string", undefined, requestId);
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

  if ((body as any).minimumDuration !== undefined) {
    const r = normalizeNullable((body as any).minimumDuration, validateMinimumDuration, "minimumDuration");
    if (!r.ok) return badRequest(r.message, undefined, requestId);
    patch.minimumDuration = r.value as any;
  }

  if ((body as any).attrs !== undefined) {
    const r = normalizeNullable((body as any).attrs, validateAttrs, "attrs");
    if (!r.ok) return badRequest(r.message, undefined, requestId);
    patch.attrs = r.value as any;
  }

  if ((body as any).entityType !== undefined) {
    const v = (body as any).entityType;
    if (!isEntityType(v)) return badRequest("entityType must be 'project' or 'action'", undefined, requestId);
    patch.entityType = v as EntityType;
  }

  if ((body as any).state !== undefined) {
    const v = (body as any).state;
    if (!isWorkflowState(v)) return badRequest("state is invalid", undefined, requestId);
    patch.state = v as WorkflowState;
  }

  if ((body as any).context !== undefined) {
    const v = (body as any).context;
    if (v !== null && typeof v !== "string") return badRequest("context must be a string or null", undefined, requestId);
    patch.context = v as any;
  }

  if ((body as any).waitingFor !== undefined) {
    const v = (body as any).waitingFor;
    if (v !== null && typeof v !== "string") return badRequest("waitingFor must be a string or null", undefined, requestId);
    patch.waitingFor = v as any;
  }

  if (body.status !== undefined) {
    if (!isStatus(body.status)) return badRequest("status must be OPEN or COMPLETED", undefined, requestId);
    patch.status = body.status;
    if ((body as any).state === undefined) patch.state = body.status === "COMPLETED" ? "completed" : "inbox";
  }

  let expectedRev: number | undefined;
  if (body.expectedRev !== undefined) {
    if (!Number.isInteger(body.expectedRev) || body.expectedRev < 0) return badRequest("expectedRev must be a non-negative integer", undefined, requestId);
    expectedRev = body.expectedRev;
  }

  if (Object.keys(patch).length === 0) return badRequest("No fields to update", undefined, requestId);

  const now = new Date().toISOString();

  try {
    const current = await getSubtask(ownerSub, parentTaskId, subtaskId);
    if (!current) return notFound("Subtask not found", requestId);

    const v2 = deriveV2Defaults(current);
    if (!current.schemaVersion || current.schemaVersion !== 2) {
      (patch as any).schemaVersion = 2;
      if (!current.entityType && (patch as any).entityType === undefined) (patch as any).entityType = v2.entityType;
      if (!current.state && (patch as any).state === undefined) (patch as any).state = v2.state;
    }

    const fromState = (current.state ?? v2.state) as WorkflowState;
    const merged = mergeTaskPatch({ ...current, ...v2 }, patch);
    if (!merged.state) return badRequest("Missing state", undefined, requestId);
    if (!canTransition(fromState, merged.state)) {
      return badRequest(`Invalid state transition ${fromState} -> ${merged.state}`, undefined, requestId);
    }

    const vr = validateMergedTask(merged);
    if (!vr.ok) return badRequest(vr.message, undefined, requestId);

    patch.status = merged.status;
    const updated = await updateSubtask(ownerSub, parentTaskId, subtaskId, patch, now, undefined, expectedRev);
    if (!updated) return notFound("Subtask not found", requestId);
    const resp: UpdateSubtaskResponse = { task: updated };
    return ok(resp, requestId);
  } catch (e: any) {
    if (e?.name === "ConditionalCheckFailedException") {
      if (expectedRev !== undefined) return conflict("Revision conflict", { expectedRev }, requestId);
      return notFound("Subtask not found", requestId);
    }
    log("error", "shared.subtasks_update_failed", { requestId, viewerSub, ownerSub, rootTaskId, parentTaskId, subtaskId, error: toErrorInfo(e) });
    return internalError("Failed to update shared subtask", undefined, requestId);
  }
});
