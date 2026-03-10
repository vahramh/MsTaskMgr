import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { randomUUID } from "node:crypto";
import type { CreateSubtaskRequest, CreateSubtaskResponse, EntityType, Task, WorkflowState } from "@tm/shared";
import { badRequest, conflict, created, forbidden, internalError, unauthorized } from "../lib/http";
import { withHttp } from "../lib/handler";
import type { HttpHandlerContext } from "../lib/handler";
import { parseJsonBody } from "../lib/request";
import { log, toErrorInfo } from "../lib/log";
import { createSubtask } from "../tasks/repo";
import { getLookup, getSharedPointer } from "../tasks/sharing";
import { validateAttrs, validateDueDate, validateEffort, validateMinimumDuration, validatePriority } from "../tasks/validate";
import { isEntityType, isWorkflowState, stateToStatus, validateMergedTask } from "../tasks/gtd";

function isUuidV4(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
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

  const ptr = await getSharedPointer(viewerSub, ownerSub, rootTaskId);
  if (!ptr) return forbidden("Not shared with you", requestId);
  if (ptr.mode !== "EDIT") return forbidden("Read-only share", requestId);

  const lookup = await getLookup(ownerSub, parentTaskId);
  if (!lookup || lookup.rootTaskId !== rootTaskId) return forbidden("Invalid parent for this shared root", requestId);

  const body = parseJsonBody(event) as CreateSubtaskRequest | null;
  if (!body) return badRequest("Invalid JSON body", undefined, requestId);

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : undefined;

  if (!title) return badRequest("title is required", undefined, requestId);
  if (title.length > 200) return badRequest("title too long (max 200 chars)", undefined, requestId);
  if (description && description.length > 2000) return badRequest("description too long (max 2000 chars)", undefined, requestId);

  const dueDateR = validateDueDate(body.dueDate);
  if (!dueDateR.ok) return badRequest(dueDateR.message, undefined, requestId);

  const priorityR = validatePriority((body as any).priority);
  if (!priorityR.ok) return badRequest(priorityR.message, undefined, requestId);

  const effortR = validateEffort((body as any).effort);
  if (!effortR.ok) return badRequest(effortR.message, undefined, requestId);

  const minimumDurationR = validateMinimumDuration((body as any).minimumDuration);
  if (!minimumDurationR.ok) return badRequest(minimumDurationR.message, undefined, requestId);

  const attrsR = validateAttrs((body as any).attrs);
  if (!attrsR.ok) return badRequest(attrsR.message, undefined, requestId);

  let entityType: EntityType = "action";
  if ((body as any).entityType !== undefined) {
    const v = (body as any).entityType;
    if (!isEntityType(v)) return badRequest("entityType must be 'project' or 'action'", undefined, requestId);
    entityType = v as EntityType;
  }

  let state: WorkflowState | undefined;
  if ((body as any).state !== undefined) {
    const v = (body as any).state;
    if (!isWorkflowState(v)) return badRequest("state is invalid", undefined, requestId);
    state = v as WorkflowState;
  } else {
    state = dueDateR.value ? "scheduled" : "inbox";
  }

  const context = (body as any).context;
  if (context !== undefined && context !== null && typeof context !== "string") {
    return badRequest("context must be a string or null", undefined, requestId);
  }

  const waitingFor = (body as any).waitingFor;
  if (waitingFor !== undefined && waitingFor !== null && typeof waitingFor !== "string") {
    return badRequest("waitingFor must be a string or null", undefined, requestId);
  }

  const now = new Date().toISOString();
  const task: Task = {
    taskId: randomUUID(),
    parentTaskId,
    title,
    description,
    status: stateToStatus(state),
    schemaVersion: 2,
    entityType,
    state,
    context: typeof context === "string" ? context : undefined,
    waitingFor: typeof waitingFor === "string" ? waitingFor : undefined,
    createdAt: now,
    updatedAt: now,
    rev: 0,
    dueDate: dueDateR.value,
    priority: priorityR.value,
    effort: effortR.value,
    minimumDuration: minimumDurationR.value,
    attrs: attrsR.value,
  };

  const vr = validateMergedTask(task);
  if (!vr.ok) return badRequest(vr.message, undefined, requestId);

  try {
    const createdTask = await createSubtask(ownerSub, parentTaskId, task);
    const resp: CreateSubtaskResponse = { task: createdTask };
    return created(resp, requestId);
  } catch (e: any) {
    if (e?.name === "ParentLookupMissingError") {
      return conflict(
        "Parent lookup missing (Phase 3). Backfill LOOKUP items for existing data.",
        { reason: "ParentLookupMissing" },
        requestId
      );
    }
    if (e?.name === "TransactionCanceledException") return conflict("Conflict", undefined, requestId);
    log("error", "shared.subtasks_create_failed", { requestId, viewerSub, ownerSub, rootTaskId, parentTaskId, error: toErrorInfo(e) });
    return internalError("Failed to create shared subtask", undefined, requestId);
  }
});
