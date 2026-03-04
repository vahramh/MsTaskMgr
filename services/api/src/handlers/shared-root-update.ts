import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import type { UpdateTaskRequest, UpdateTaskResponse, TaskStatus } from "@tm/shared";
import { badRequest, conflict, forbidden, internalError, notFound, ok, unauthorized } from "../lib/http";
import { withHttp } from "../lib/handler";
import type { HttpHandlerContext } from "../lib/handler";
import { parseJsonBody } from "../lib/request";
import { log, toErrorInfo } from "../lib/log";
import { updateTask } from "../tasks/repo";
import { getSharedPointer } from "../tasks/sharing";
import { normalizeNullable, validateAttrs, validateDueDate, validateEffort, validatePriority } from "../tasks/validate";

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

  const ptr = await getSharedPointer(viewerSub, ownerSub, rootTaskId);
  if (!ptr) return forbidden("Not shared with you", requestId);
  if (ptr.mode !== "EDIT") return forbidden("Read-only share", requestId);

  const body = parseJsonBody(event) as UpdateTaskRequest | null;
  if (!body) return badRequest("Invalid JSON body", undefined, requestId);

  const patch: UpdateTaskRequest = {};

  if (body.title !== undefined) {
    if (typeof body.title !== "string") return badRequest("title must be a string", undefined, requestId);
    const t = body.title.trim();
    if (!t) return badRequest("title cannot be empty", undefined, requestId);
    if (t.length > 200) return badRequest("title too long (max 200 chars)", undefined, requestId);
    patch.title = t;
  }

  if (body.description !== undefined) {
    if (body.description !== null && typeof body.description !== "string")
      return badRequest("description must be a string", undefined, requestId);
    const d = typeof body.description === "string" ? body.description.trim() : "";
    if (d.length > 2000) return badRequest("description too long (max 2000 chars)", undefined, requestId);
    patch.description = d || undefined;
  }

  if (body.status !== undefined) {
    if (!isStatus(body.status)) return badRequest("status must be OPEN or COMPLETED", undefined, requestId);
    patch.status = body.status;
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
    if (!Number.isInteger(body.expectedRev) || body.expectedRev < 0)
      return badRequest("expectedRev must be a non-negative integer", undefined, requestId);
    expectedRev = body.expectedRev;
  }

  if (Object.keys(patch).length === 0) return badRequest("No fields to update", undefined, requestId);

  const now = new Date().toISOString();

  try {
    const updated = await updateTask(ownerSub, rootTaskId, patch, now, undefined, expectedRev);
    if (!updated) return notFound("Task not found", requestId);
    const resp: UpdateTaskResponse = { task: updated };
    return ok(resp, requestId);
  } catch (e: any) {
    if (e?.name === "ConditionalCheckFailedException") {
      if (expectedRev !== undefined) return conflict("Revision conflict", { expectedRev }, requestId);
      return notFound("Task not found", requestId);
    }
    log("error", "shared.root_update_failed", { requestId, viewerSub, ownerSub, rootTaskId, error: toErrorInfo(e) });
    return internalError("Failed to update shared task", undefined, requestId);
  }
});
