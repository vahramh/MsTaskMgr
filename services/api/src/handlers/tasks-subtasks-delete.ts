import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { noContent, badRequest, unauthorized, notFound, conflict, internalError } from "../lib/http";
import { withHttp } from "../lib/handler";
import type { HttpHandlerContext } from "../lib/handler";
import { deleteSubtask } from "../tasks/repo";
import { HasChildrenError } from "../tasks/types";
import { log, toErrorInfo } from "../lib/log";

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

  const subtaskId = event.pathParameters?.subtaskId;
  if (!subtaskId) return badRequest("Missing subtaskId", undefined, requestId);
  if (!isUuidV4(subtaskId)) return badRequest("Invalid subtaskId", undefined, requestId);

  try {
    await deleteSubtask(sub, parentTaskId, subtaskId);
    return noContent(requestId);
  } catch (e: any) {
    if (e instanceof HasChildrenError) {
      return conflict(e.message, { reason: "HasChildren" }, requestId);
    }
    if (e?.name === "ConditionalCheckFailedException") return notFound("Subtask not found", requestId);
    if (e?.name === "TransactionCanceledException") return notFound("Subtask not found", requestId);
    log("error", "subtasks.delete_failed", { requestId, sub, parentTaskId, subtaskId, error: toErrorInfo(e) });
    return internalError("Failed to delete subtask", undefined, requestId);
  }
});
