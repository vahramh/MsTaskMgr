import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { randomUUID } from "node:crypto";
import type { CreateSubtaskRequest, CreateSubtaskResponse, EntityType, Task, WorkflowState } from "@tm/shared";
import { created, badRequest, unauthorized, internalError, conflict } from "../lib/http";
import { withHttp } from "../lib/handler";
import type { HttpHandlerContext } from "../lib/handler";
import { createSubtask } from "../tasks/repo";
import { log, toErrorInfo } from "../lib/log";
import { parseJsonBody } from "../lib/request";
import { validateAttrs, validateDueDate, validateEffort, validateMinimumDuration, validateMinutesField, validatePriority } from "../tasks/validate";
import { isEntityType, isWorkflowState, stateToStatus, validateMergedTask } from "../tasks/gtd";
import { validateStructuredDependencyForCreate } from "../tasks/dependencies";

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
  if (description && description.length > 2000) {
    return badRequest("description too long (max 2000 chars)", undefined, requestId);
  }

  const dueDateR = validateDueDate(body.dueDate);
  if (!dueDateR.ok) return badRequest(dueDateR.message, undefined, requestId);

  const priorityR = validatePriority((body as any).priority);
  if (!priorityR.ok) return badRequest(priorityR.message, undefined, requestId);

  const effortR = validateEffort((body as any).effort);
  if (!effortR.ok) return badRequest(effortR.message, undefined, requestId);

  const minimumDurationR = validateMinimumDuration((body as any).minimumDuration);
  if (!minimumDurationR.ok) return badRequest(minimumDurationR.message, undefined, requestId);

  const estimatedMinutesR = validateMinutesField((body as any).estimatedMinutes, "estimatedMinutes");
  if (!estimatedMinutesR.ok) return badRequest(estimatedMinutesR.message, undefined, requestId);

  const remainingMinutesR = validateMinutesField((body as any).remainingMinutes, "remainingMinutes");
  if (!remainingMinutesR.ok) return badRequest(remainingMinutesR.message, undefined, requestId);

  const timeSpentMinutesR = validateMinutesField((body as any).timeSpentMinutes, "timeSpentMinutes");
  if (!timeSpentMinutesR.ok) return badRequest(timeSpentMinutesR.message, undefined, requestId);

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

  const waitingForTaskId = (body as any).waitingForTaskId;
  if (waitingForTaskId !== undefined && waitingForTaskId !== null && typeof waitingForTaskId !== "string") {
    return badRequest("waitingForTaskId must be a string or null", undefined, requestId);
  }

  const waitingForTaskTitle = (body as any).waitingForTaskTitle;
  if (waitingForTaskTitle !== undefined && waitingForTaskTitle !== null && typeof waitingForTaskTitle !== "string") {
    return badRequest("waitingForTaskTitle must be a string or null", undefined, requestId);
  }

  const resumeStateAfterWait = (body as any).resumeStateAfterWait;
  if (resumeStateAfterWait !== undefined && resumeStateAfterWait !== null && resumeStateAfterWait !== "next" && resumeStateAfterWait !== "inbox") {
    return badRequest("resumeStateAfterWait must be 'next', 'inbox', or null", undefined, requestId);
  }

  let resolvedWaitingForTaskTitle: string | undefined;
  if (typeof waitingForTaskId === "string" && waitingForTaskId.trim()) {
    const dep = await validateStructuredDependencyForCreate({
      sub,
      parentTaskId,
      waitingForTaskId: waitingForTaskId.trim(),
    });
    if (!dep.ok) return badRequest(dep.message, undefined, requestId);
    resolvedWaitingForTaskTitle = dep.waitingForTaskTitle;
  }

  const now = new Date().toISOString();
  const effortMinutes = effortR.value ? (effortR.value.unit === "hours" ? Math.round(effortR.value.value * 60) : Math.round(effortR.value.value * 8 * 60)) : undefined;
  const estimatedMinutes = estimatedMinutesR.value ?? effortMinutes;
  const remainingMinutes = remainingMinutesR.value ?? estimatedMinutes;
  const timeSpentMinutes =
    timeSpentMinutesR.value ??
    (estimatedMinutes !== undefined && remainingMinutes !== undefined && estimatedMinutes >= remainingMinutes
      ? estimatedMinutes - remainingMinutes
      : undefined);

  if (estimatedMinutes !== undefined && remainingMinutes !== undefined && remainingMinutes > estimatedMinutes) {
    return badRequest("remainingMinutes cannot exceed estimatedMinutes", undefined, requestId);
  }

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
    waitingForTaskId: typeof waitingForTaskId === "string" && waitingForTaskId.trim() ? waitingForTaskId.trim() : undefined,
    waitingForTaskTitle: resolvedWaitingForTaskTitle ?? (typeof waitingForTaskTitle === "string" && waitingForTaskTitle.trim() ? waitingForTaskTitle.trim() : undefined),
    resumeStateAfterWait: (typeof waitingForTaskId === "string" && waitingForTaskId.trim())
      ? ((resumeStateAfterWait as any) ?? "next")
      : undefined,
    createdAt: now,
    updatedAt: now,
    rev: 0,
    dueDate: dueDateR.value,
    priority: priorityR.value,
    effort: effortR.value,
    estimatedMinutes,
    remainingMinutes,
    timeSpentMinutes,
    minimumDuration: minimumDurationR.value,
    attrs: attrsR.value,
  };

  const vr = validateMergedTask(task);
  if (!vr.ok) return badRequest(vr.message, undefined, requestId);

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
      return conflict("Conflict", undefined, requestId);
    }
    log("error", "subtasks.create_failed", { requestId, sub, parentTaskId, error: toErrorInfo(e) });
    return internalError("Failed to create subtask", undefined, requestId);
  }
});
