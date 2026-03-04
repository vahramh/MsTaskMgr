import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { badRequest, conflict, forbidden, internalError, noContent, notFound, unauthorized } from "../lib/http";
import { withHttp } from "../lib/handler";
import type { HttpHandlerContext } from "../lib/handler";
import { deleteSubtask } from "../tasks/repo";
import { HasChildrenError } from "../tasks/types";
import { getLookup, getSharedPointer } from "../tasks/sharing";
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

  const parentTaskId = event.pathParameters?.parentTaskId;
  if (!parentTaskId) return badRequest("Missing parentTaskId", undefined, requestId);
  if (!isUuidV4(parentTaskId)) return badRequest("Invalid parentTaskId", undefined, requestId);

  const subtaskId = event.pathParameters?.subtaskId;
  if (!subtaskId) return badRequest("Missing subtaskId", undefined, requestId);
  if (!isUuidV4(subtaskId)) return badRequest("Invalid subtaskId", undefined, requestId);

  const ptr = await getSharedPointer(viewerSub, ownerSub, rootTaskId);
  if (!ptr) return forbidden("Not shared with you", requestId);
  if (ptr.mode !== "EDIT") return forbidden("Read-only share", requestId);

  const lookup = await getLookup(ownerSub, subtaskId);
  if (!lookup || lookup.rootTaskId !== rootTaskId || lookup.parentTaskId !== parentTaskId) {
    return forbidden("Invalid subtask for this shared root", requestId);
  }

  try {
    await deleteSubtask(ownerSub, parentTaskId, subtaskId);
    return noContent(requestId);
  } catch (e: any) {
    if (e instanceof HasChildrenError) return conflict(e.message, { reason: "HasChildren" }, requestId);
    if (e?.name === "ConditionalCheckFailedException") return notFound("Subtask not found", requestId);
    if (e?.name === "TransactionCanceledException") return notFound("Subtask not found", requestId);
    log("error", "shared.subtasks_delete_failed", { requestId, viewerSub, ownerSub, rootTaskId, parentTaskId, subtaskId, error: toErrorInfo(e) });
    return internalError("Failed to delete shared subtask", undefined, requestId);
  }
});
