import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import type { UpdateSubtaskResponse, WorkflowState } from "@tm/shared";
import { badRequest, conflict, forbidden, internalError, notFound, ok, unauthorized } from "../lib/http";
import { withHttp } from "../lib/handler";
import type { HttpHandlerContext } from "../lib/handler";
import { parseJsonBody } from "../lib/request";
import { log, toErrorInfo } from "../lib/log";
import { getSubtask, updateSubtask } from "../tasks/repo";
import { getLookup, getSharedPointer } from "../tasks/sharing";
import { deriveV2Defaults, mergeTaskPatch, validateMergedTask } from "../tasks/gtd";

function isUuidV4(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function isBoundedString(v: unknown, maxLen: number): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= maxLen;
}

type ReopenBody = { expectedRev?: number };

/**
 * Reopen a completed shared subtask (EDIT shares only).
 * Also enforces that the subtask belongs to the shared root via LOOKUP guard.
 */
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

  // LOOKUP guard: ensure the target task is part of the shared root.
  const lookup = await getLookup(ownerSub, subtaskId);
  if (!lookup || lookup.rootTaskId !== rootTaskId || lookup.parentTaskId !== parentTaskId) {
    return forbidden("Invalid subtask for this shared root", requestId);
  }

  let expectedRev: number | undefined;
  const body = parseJsonBody(event) as ReopenBody | null;
  if (body?.expectedRev !== undefined) {
    if (!Number.isInteger(body.expectedRev) || body.expectedRev < 0)
      return badRequest("expectedRev must be a non-negative integer", undefined, requestId);
    expectedRev = body.expectedRev;
  }

  const now = new Date().toISOString();

  try {
    const current = await getSubtask(ownerSub, parentTaskId, subtaskId);
    if (!current) return notFound("Subtask not found", requestId);

    const v2 = deriveV2Defaults(current);
    const state = (current.state ?? v2.state) as WorkflowState;
    if (state !== "completed") {
      return badRequest("Only completed subtasks can be reopened", { state }, requestId);
    }

    const targetState: WorkflowState = current.dueDate ? "scheduled" : "inbox";
    const patch: any = {
      schemaVersion: 2,
      entityType: current.entityType ?? v2.entityType,
      state: targetState,
    };

    const merged = mergeTaskPatch({ ...current, ...v2 }, patch);
    const vr = validateMergedTask(merged);
    if (!vr.ok) return badRequest(vr.message, undefined, requestId);

    patch.status = "OPEN";
    const updated = await updateSubtask(ownerSub, parentTaskId, subtaskId, patch, now, undefined, expectedRev);
    if (!updated) return notFound("Subtask not found", requestId);

    const resp: UpdateSubtaskResponse = { task: updated };
    return ok(resp, requestId);
  } catch (e: any) {
    if (e?.name === "ConditionalCheckFailedException") {
      if (expectedRev !== undefined) return conflict("Revision conflict", { expectedRev }, requestId);
      return notFound("Subtask not found", requestId);
    }
    log("error", "shared.subtask_reopen_failed", {
      requestId,
      viewerSub,
      ownerSub,
      rootTaskId,
      parentTaskId,
      subtaskId,
      error: toErrorInfo(e),
    });
    return internalError("Failed to reopen shared subtask", undefined, requestId);
  }
});
