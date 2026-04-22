
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import type { ExecutionContextKind, UpdateExecutionContextRequest, UpdateExecutionContextResponse } from "@tm/shared";
import { withHttp } from "../lib/handler";
import type { HttpHandlerContext } from "../lib/handler";
import { badRequest, internalError, notFound, ok, unauthorized } from "../lib/http";
import { parseJsonBody } from "../lib/request";
import { updateExecutionContext } from "../contexts/repo";
import { log, toErrorInfo } from "../lib/log";

function isKind(value: unknown): value is ExecutionContextKind {
  return value === "place" || value === "person" || value === "tool" || value === "mode" || value === "energy";
}

export const handler = withHttp(async (
  event: APIGatewayProxyEventV2,
  ctx: HttpHandlerContext
): Promise<APIGatewayProxyResultV2> => {
  const requestId = ctx.requestId;
  const sub = ctx.sub;
  if (!sub) return unauthorized("Unauthorized", requestId);

  const contextId = event.pathParameters?.contextId;
  if (!contextId) return badRequest("Missing contextId", undefined, requestId);

  try {
    const body = parseJsonBody(event) as UpdateExecutionContextRequest | null;
    if (!body) return badRequest("Invalid JSON body", undefined, requestId);

    const patch: any = { updatedAt: new Date().toISOString() };
    if (body.name !== undefined) {
      if (typeof body.name !== "string" || !body.name.trim()) return badRequest("name must be a non-empty string", undefined, requestId);
      patch.name = body.name.trim();
    }
    if (body.kind !== undefined) {
      if (!isKind(body.kind)) return badRequest("kind is invalid", undefined, requestId);
      patch.kind = body.kind;
    }
    if (body.sortOrder !== undefined) {
      if (!Number.isFinite(body.sortOrder)) return badRequest("sortOrder must be a number", undefined, requestId);
      patch.sortOrder = body.sortOrder;
    }
    if (body.archived !== undefined) {
      if (typeof body.archived !== "boolean") return badRequest("archived must be boolean", undefined, requestId);
      patch.archived = body.archived;
    }

    const context = await updateExecutionContext(sub, contextId, patch);
    if (!context) return notFound("Execution context not found", undefined, requestId);

    const resp: UpdateExecutionContextResponse = { context };
    return ok(resp, requestId);
  } catch (e) {
    log("error", "contexts.update_failed", { requestId, sub, contextId, error: toErrorInfo(e) });
    return internalError("Failed to update execution context", undefined, requestId);
  }
});
