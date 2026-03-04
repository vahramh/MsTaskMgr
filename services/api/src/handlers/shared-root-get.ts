import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import type { CreateTaskResponse } from "@tm/shared";
import { badRequest, forbidden, internalError, notFound, ok, unauthorized } from "../lib/http";
import { withHttp } from "../lib/handler";
import type { HttpHandlerContext } from "../lib/handler";
import { getTask } from "../tasks/repo";
import { getSharedPointer } from "../tasks/sharing";
import { log, toErrorInfo } from "../lib/log";

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

  try {
    const ptr = await getSharedPointer(viewerSub, ownerSub, rootTaskId);
    if (!ptr) return forbidden("Not shared with you", requestId);

    const task = await getTask(ownerSub, rootTaskId);
    if (!task) return notFound("Task not found", requestId);

    // Reuse existing shape: { task }
    const resp: CreateTaskResponse = { task };
    return ok(resp, requestId);
  } catch (e: any) {
    log("error", "shared.root_get_failed", { requestId, viewerSub, ownerSub, rootTaskId, error: toErrorInfo(e) });
    return internalError("Failed to fetch shared task", undefined, requestId);
  }
});
