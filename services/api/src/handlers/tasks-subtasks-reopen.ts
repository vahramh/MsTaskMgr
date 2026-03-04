import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import type { UpdateSubtaskResponse, WorkflowState } from "@tm/shared";
import { ok, badRequest, unauthorized, notFound, internalError, conflict } from "../lib/http";
import { withHttp } from "../lib/handler";
import type { HttpHandlerContext } from "../lib/handler";
import { getSubtask, updateSubtask } from "../tasks/repo";
import { log, toErrorInfo } from "../lib/log";
import { parseJsonBody } from "../lib/request";
import { deriveV2Defaults, mergeTaskPatch, validateMergedTask } from "../tasks/gtd";

function isUuidV4(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

type ReopenBody = { expectedRev?: number };

/**
 * Explicit escape hatch: allows reopening a completed subtask.
 * - Only applies if current state is completed.
 * - Target state is derived strictly: if dueDate exists => scheduled, else inbox.
 */
export const handler = withHttp(
  async (event: APIGatewayProxyEventV2, ctx: HttpHandlerContext): Promise<APIGatewayProxyResultV2> => {
    const requestId = ctx.requestId;
    const sub = ctx.sub;
    if (!sub) return unauthorized("Unauthorized", requestId);

    const parentTaskId = event.pathParameters?.taskId;
    if (!parentTaskId) return badRequest("Missing taskId", undefined, requestId);
    if (!isUuidV4(parentTaskId)) return badRequest("Invalid taskId", undefined, requestId);

    const subtaskId = event.pathParameters?.subtaskId;
    if (!subtaskId) return badRequest("Missing subtaskId", undefined, requestId);
    if (!isUuidV4(subtaskId)) return badRequest("Invalid subtaskId", undefined, requestId);

    let expectedRev: number | undefined;
    const body = parseJsonBody(event) as ReopenBody | null;
    if (body?.expectedRev !== undefined) {
      if (!Number.isInteger(body.expectedRev) || body.expectedRev < 0)
        return badRequest("expectedRev must be a non-negative integer", undefined, requestId);
      expectedRev = body.expectedRev;
    }

    const now = new Date().toISOString();

    try {
      const current = await getSubtask(sub, parentTaskId, subtaskId);
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
      const updated = await updateSubtask(sub, parentTaskId, subtaskId, patch, now, undefined, expectedRev);
      if (!updated) return notFound("Subtask not found", requestId);

      const resp: UpdateSubtaskResponse = { task: updated };
      return ok(resp, requestId);
    } catch (e: any) {
      if (e?.name === "ConditionalCheckFailedException") {
        if (expectedRev !== undefined) return conflict("Revision conflict", { expectedRev }, requestId);
        return notFound("Subtask not found", requestId);
      }
      log("error", "subtasks.reopen_failed", { requestId, sub, parentTaskId, subtaskId, error: toErrorInfo(e) });
      return internalError("Failed to reopen subtask", undefined, requestId);
    }
  }
);
