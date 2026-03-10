import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { randomUUID } from "node:crypto";
import type { CreateTaskRequest, CreateTaskResponse, Task, EntityType, WorkflowState } from "@tm/shared";
import { created, badRequest, unauthorized, internalError, conflict } from "../lib/http";
import { withHttp } from "../lib/handler";
import type { HttpHandlerContext } from "../lib/handler";
import { createProjectWithInitialAction, createTask } from "../tasks/repo";
import { log, toErrorInfo } from "../lib/log";
import { parseJsonBody } from "../lib/request";
import { validateAttrs, validateDueDate, validateEffort, validateMinimumDuration, validatePriority } from "../tasks/validate";
import { isEntityType, isWorkflowState, stateToStatus, validateMergedTask } from "../tasks/gtd";

export const handler = withHttp(async (event: APIGatewayProxyEventV2, ctx: HttpHandlerContext): Promise<APIGatewayProxyResultV2> => {
  const requestId = ctx.requestId;
  const sub = ctx.sub;
  if (!sub) return unauthorized("Unauthorized", requestId);

  const body = parseJsonBody(event) as CreateTaskRequest | null;
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

  // Phase 4 (GTD) optional inputs
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
    // Default mapping for legacy create:
    // strict rule: inbox cannot have dueDate, so if dueDate is present default to scheduled.
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

  // Build the v2 task.
  const baseTask: Task = {
    taskId: randomUUID(),
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

  // Strict validation of GTD invariants on create.
  const vr = validateMergedTask(baseTask);
  if (!vr.ok) return badRequest(vr.message, undefined, requestId);

  try {
    if (entityType === "project") {
      // Phase 4 invariant: projects must contain at least one action.
      // We auto-create a minimal initial child action.
      const firstAction: Task = {
        taskId: randomUUID(),
        parentTaskId: baseTask.taskId,
        title: "Define next action",
        description: undefined,
        status: "OPEN",

        schemaVersion: 2,
        entityType: "action",
        state: "next",

        createdAt: now,
        updatedAt: now,
        rev: 0,
      };

      const r = await createProjectWithInitialAction(sub, baseTask, firstAction);
      const resp: CreateTaskResponse = { task: r.project };
      return created(resp, requestId);
    }

    const createdTask = await createTask(sub, baseTask);
    const resp: CreateTaskResponse = { task: createdTask };
    return created(resp, requestId);
  } catch (e: any) {
    if (e?.name === "TransactionCanceledException") {
      return conflict("Conflict", undefined, requestId);
    }
    log("error", "tasks.create_failed", { requestId, sub, error: toErrorInfo(e) });
    return internalError("Failed to create task", undefined, requestId);
  }
});
