import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import type { UpdateTaskResponse, WorkflowState } from "@tm/shared";
import { badRequest, conflict, forbidden, internalError, notFound, ok, unauthorized } from "../lib/http";
import { withHttp } from "../lib/handler";
import type { HttpHandlerContext } from "../lib/handler";
import { parseJsonBody } from "../lib/request";
import { log, toErrorInfo } from "../lib/log";
import { getTask, updateTask } from "../tasks/repo";
import { getSharedPointer } from "../tasks/sharing";
import { deriveV2Defaults, mergeTaskPatch, validateMergedTask } from "../tasks/gtd";

function isUuidV4(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function isBoundedString(v: unknown, maxLen: number): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= maxLen;
}

type ReopenBody = { expectedRev?: number };

/**
 * Reopen a completed shared root task (EDIT shares only).
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

  const ptr = await getSharedPointer(viewerSub, ownerSub, rootTaskId);
  if (!ptr) return forbidden("Not shared with you", requestId);
  if (ptr.mode !== "EDIT") return forbidden("Read-only share", requestId);

  let expectedRev: number | undefined;
  const body = parseJsonBody(event) as ReopenBody | null;
  if (body?.expectedRev !== undefined) {
    if (!Number.isInteger(body.expectedRev) || body.expectedRev < 0)
      return badRequest("expectedRev must be a non-negative integer", undefined, requestId);
    expectedRev = body.expectedRev;
  }

  const now = new Date().toISOString();

  try {
    const current = await getTask(ownerSub, rootTaskId);
    if (!current) return notFound("Task not found", requestId);

    const v2 = deriveV2Defaults(current);
    const state = (current.state ?? v2.state) as WorkflowState;
    if (state !== "completed") {
      return badRequest("Only completed tasks can be reopened", { state }, requestId);
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
    const updated = await updateTask(ownerSub, rootTaskId, patch, now, undefined, expectedRev);
    if (!updated) return notFound("Task not found", requestId);

    const resp: UpdateTaskResponse = { task: updated };
    return ok(resp, requestId);
  } catch (e: any) {
    if (e?.name === "ConditionalCheckFailedException") {
      if (expectedRev !== undefined) return conflict("Revision conflict", { expectedRev }, requestId);
      return notFound("Task not found", requestId);
    }
    log("error", "shared.root_reopen_failed", { requestId, viewerSub, ownerSub, rootTaskId, error: toErrorInfo(e) });
    return internalError("Failed to reopen shared task", undefined, requestId);
  }
});
