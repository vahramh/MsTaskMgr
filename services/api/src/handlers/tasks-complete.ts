import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import type { UpdateTaskResponse, WorkflowState } from "@tm/shared";
import { ok, badRequest, unauthorized, notFound, internalError, conflict } from "../lib/http";
import { withHttp } from "../lib/handler";
import type { HttpHandlerContext } from "../lib/handler";
import { getTask, listAllSubtasks, updateTask } from "../tasks/repo";
import { log, toErrorInfo } from "../lib/log";
import { parseJsonBody } from "../lib/request";
import { deriveV2Defaults } from "../tasks/gtd";
import { releaseTasksBlockedByTask } from "../tasks/dependencies";

function isUuidV4(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

type CompleteBody = { expectedRev?: number };

export const handler = withHttp(
  async (event: APIGatewayProxyEventV2, ctx: HttpHandlerContext): Promise<APIGatewayProxyResultV2> => {
    const requestId = ctx.requestId;
    const sub = ctx.sub;
    if (!sub) return unauthorized("Unauthorized", requestId);

    const taskId = event.pathParameters?.taskId;
    if (!taskId) return badRequest("Missing taskId", undefined, requestId);
    if (!isUuidV4(taskId)) return badRequest("Invalid taskId", undefined, requestId);

    let expectedRev: number | undefined;
    const body = parseJsonBody(event) as CompleteBody | null;
    if (body?.expectedRev !== undefined) {
      if (!Number.isInteger(body.expectedRev) || body.expectedRev < 0)
        return badRequest("expectedRev must be a non-negative integer", undefined, requestId);
      expectedRev = body.expectedRev;
    }

    const now = new Date().toISOString();

    try {
      const current = await getTask(sub, taskId);
      if (!current) return notFound("Task not found", requestId);

      const v2 = deriveV2Defaults(current);
      const entityType = current.entityType ?? v2.entityType;
      const state = (current.state ?? v2.state) as WorkflowState;

      // If this is already completed, idempotent success.
      if (state === "completed") {
        const resp: UpdateTaskResponse = { task: { ...current, ...v2, status: "COMPLETED", state: "completed" } as any };
        return ok(resp, requestId);
      }

      // Project completion constraint: cannot complete if any action is incomplete.
      if (entityType === "project") {
        const children = await listAllSubtasks(sub, taskId);

        // Projects must contain at least one action (Phase 4 invariant; enforce here too).
        const actionChildren = children.filter((c) => (c.entityType ?? deriveV2Defaults(c).entityType) === "action");
        if (actionChildren.length === 0) {
          return badRequest("Projects must contain at least one action", undefined, requestId);
        }

        const incomplete = actionChildren.filter((c) => {
          const cs = (c.state ?? deriveV2Defaults(c).state) as WorkflowState;
          return cs !== "completed";
        });

        if (incomplete.length > 0) {
          return badRequest("Projects cannot be completed while actions are incomplete", { incompleteCount: incomplete.length }, requestId);
        }
      }

      const patch: any = {
        // Persist v2 defaults if needed.
        schemaVersion: 2,
        entityType: current.entityType ?? v2.entityType,
        state: "completed",
      };

      const updated = await updateTask(sub, taskId, patch, now, "COMPLETED", expectedRev);
      if (!updated) return notFound("Task not found", requestId);

      await releaseTasksBlockedByTask(sub, taskId, now);

      const resp: UpdateTaskResponse = { task: updated };
      return ok(resp, requestId);
    } catch (e: any) {
      if (e?.name === "ConditionalCheckFailedException") {
        if (expectedRev !== undefined) return conflict("Revision conflict", { expectedRev }, requestId);
        return notFound("Task not found", requestId);
      }
      log("error", "tasks.complete_failed", { requestId, sub, taskId, error: toErrorInfo(e) });
      return internalError("Failed to complete task", undefined, requestId);
    }
  }
);
