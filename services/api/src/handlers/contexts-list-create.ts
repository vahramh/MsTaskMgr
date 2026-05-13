
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { randomUUID } from "node:crypto";
import type {
  CreateExecutionContextRequest,
  CreateExecutionContextResponse,
  ExecutionContextKind,
  ListExecutionContextsResponse,
} from "@tm/shared";
import { withHttp } from "../lib/handler";
import type { HttpHandlerContext } from "../lib/handler";
import { badRequest, created, internalError, ok, unauthorized } from "../lib/http";
import { parseJsonBody } from "../lib/request";
import { createExecutionContext, listExecutionContexts } from "../contexts/repo";
import { log, toErrorInfo } from "../lib/log";

function isKind(value: unknown): value is ExecutionContextKind {
  return value === "place" || value === "person" || value === "tool" || value === "mode" || value === "energy";
}

function normalizeMinutes(value: unknown, fieldName: string): { ok: true; value: number } | { ok: false; message: string } {
  if (value === undefined) return { ok: true, value: 0 };
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    return { ok: false, message: `${fieldName} must be a non-negative whole number of minutes` };
  }
  if (value > 24 * 60) return { ok: false, message: `${fieldName} cannot exceed 1440 minutes` };
  return { ok: true, value };
}

export const handler = withHttp(async (
  event: APIGatewayProxyEventV2,
  ctx: HttpHandlerContext
): Promise<APIGatewayProxyResultV2> => {
  const requestId = ctx.requestId;
  const sub = ctx.sub;
  if (!sub) return unauthorized("Unauthorized", requestId);

  try {
    if (event.requestContext.http.method === "GET") {
      const resp: ListExecutionContextsResponse = { items: await listExecutionContexts(sub) };
      return ok(resp, requestId);
    }

    const body = parseJsonBody(event) as CreateExecutionContextRequest | null;
    if (!body) return badRequest("Invalid JSON body", undefined, requestId);

    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return badRequest("name is required", undefined, requestId);
    if (name.length > 80) return badRequest("name too long (max 80 chars)", undefined, requestId);
    if (!isKind(body.kind)) return badRequest("kind is invalid", undefined, requestId);

    const weekdayMinutes = normalizeMinutes((body as any).weekdayMinutes, "weekdayMinutes");
    if (!weekdayMinutes.ok) return badRequest(weekdayMinutes.message, undefined, requestId);
    const weekendMinutes = normalizeMinutes((body as any).weekendMinutes, "weekendMinutes");
    if (!weekendMinutes.ok) return badRequest(weekendMinutes.message, undefined, requestId);

    const now = new Date().toISOString();
    const context = await createExecutionContext(sub, {
      contextId: randomUUID(),
      name,
      kind: body.kind,
      sortOrder: Number.isFinite(body.sortOrder as number) ? Number(body.sortOrder) : Date.now(),
      archived: false,
      weekdayMinutes: weekdayMinutes.value,
      weekendMinutes: weekendMinutes.value,
      createdAt: now,
      updatedAt: now,
    });

    const resp: CreateExecutionContextResponse = { context };
    return created(resp, requestId);
  } catch (e) {
    log("error", "contexts.list_create_failed", { requestId, sub, error: toErrorInfo(e) });
    return internalError("Failed to process execution contexts", undefined, requestId);
  }
});
