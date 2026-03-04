import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { randomUUID } from "node:crypto";
import type { CreateSubtaskRequest, CreateSubtaskResponse, Task } from "@tm/shared";
import { created, badRequest, unauthorized, internalError, conflict } from "../lib/http";
import { withHttp } from "../lib/handler";
import type { HttpHandlerContext } from "../lib/handler";
import { createSubtask } from "../tasks/repo";
import { log, toErrorInfo } from "../lib/log";
import { parseJsonBody } from "../lib/request";
import { validateAttrs, validateDueDate, validateEffort, validatePriority } from "../tasks/validate";

function isUuidV4(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
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

  const body = parseJsonBody(event) as CreateSubtaskRequest | null;
  if (!body) return badRequest("Invalid JSON body", undefined, requestId);

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : undefined;

  if (!title) return badRequest("title is required", undefined, requestId);
  if (title.length > 200) return badRequest("title too long (max 200 chars)", undefined, requestId);
  if (description && description.length > 2000)
    return badRequest("description too long (max 2000 chars)", undefined, requestId);

  const dueDateR = validateDueDate(body.dueDate);
  if (!dueDateR.ok) return badRequest(dueDateR.message, undefined, requestId);

  const priorityR = validatePriority((body as any).priority);
  if (!priorityR.ok) return badRequest(priorityR.message, undefined, requestId);

  const effortR = validateEffort((body as any).effort);
  if (!effortR.ok) return badRequest(effortR.message, undefined, requestId);

  const attrsR = validateAttrs((body as any).attrs);
  if (!attrsR.ok) return badRequest(attrsR.message, undefined, requestId);

  const now = new Date().toISOString();
  const task: Task = {
    taskId: randomUUID(),
    parentTaskId,
    title,
    description,
    status: "OPEN",
    createdAt: now,
    updatedAt: now,
    rev: 0,
    dueDate: dueDateR.value,
    priority: priorityR.value,
    effort: effortR.value,
    attrs: attrsR.value,
  };

  try {
    const createdTask = await createSubtask(sub, parentTaskId, task);
    const resp: CreateSubtaskResponse = { task: createdTask };
    return created(resp, requestId);
  } catch (e: any) {
    if (e?.name === "ParentLookupMissingError") {
      return conflict(
        "Parent lookup missing (Phase 3). Backfill LOOKUP items for existing data before creating deeper subtasks.",
        { reason: "ParentLookupMissing" },
        requestId
      );
    }
    if (e?.name === "TransactionCanceledException") {
      // Most likely: duplicate PK/SK (should be extremely rare with UUID), or lookup/task already exists.
      return conflict("Conflict", undefined, requestId);
    }
    log("error", "subtasks.create_failed", { requestId, sub, parentTaskId, error: toErrorInfo(e) });
    return internalError("Failed to create subtask", undefined, requestId);
  }
});
