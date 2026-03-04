import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { noContent, badRequest, unauthorized, notFound, conflict, internalError } from "../lib/http";
import { withHttp } from "../lib/handler";
import type { HttpHandlerContext } from "../lib/handler";
import { deleteTask } from "../tasks/repo";
import { HasChildrenError } from "../tasks/types";
import { log, toErrorInfo } from "../lib/log";
function isUuidV4(v: string): boolean {  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);}

export const handler = withHttp(async (event: APIGatewayProxyEventV2, ctx: HttpHandlerContext): Promise<APIGatewayProxyResultV2> => {
  const requestId = ctx.requestId;
  const sub = ctx.sub;
  if (!sub) return unauthorized("Unauthorized", requestId);


  const taskId = event.pathParameters?.taskId;
  if (!taskId) return badRequest("Missing taskId", undefined, requestId);

  if (!isUuidV4(taskId)) return badRequest("Invalid taskId", undefined, requestId);

  try {
    await deleteTask(sub, taskId);
    return noContent(requestId);
  } catch (e: any) {
    if (e instanceof HasChildrenError) {
      return conflict(e.message, { reason: "HasChildren" }, requestId);
    }
    if (e?.name === "ConditionalCheckFailedException") return notFound("Task not found", requestId);
    if (e?.name === "TransactionCanceledException") {
      // The primary delete includes a ConditionExpression; treat cancellation as not found.
      return notFound("Task not found", requestId);
    }
    log("error", "tasks.delete_failed", { requestId, sub, taskId, error: toErrorInfo(e) });
    return internalError("Failed to delete task", undefined, requestId);
  }
});
