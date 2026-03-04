import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import type { CreateShareRequest, CreateShareResponse, ShareMode } from "@tm/shared";
import { badRequest, conflict, created, internalError, notFound, unauthorized } from "../lib/http";
import { withHttp } from "../lib/handler";
import type { HttpHandlerContext } from "../lib/handler";
import { parseJsonBody } from "../lib/request";
import { getTask } from "../tasks/repo";
import { createShareGrant } from "../tasks/sharing";
import { log, toErrorInfo } from "../lib/log";

function isUuidV4(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function isShareMode(v: any): v is ShareMode {
  return v === "VIEW" || v === "EDIT";
}

function isBoundedString(v: unknown, maxLen: number): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= maxLen;
}

export const handler = withHttp(async (
  event: APIGatewayProxyEventV2,
  ctx: HttpHandlerContext
): Promise<APIGatewayProxyResultV2> => {
  const requestId = ctx.requestId;
  const ownerSub = ctx.sub;
  if (!ownerSub) return unauthorized("Unauthorized", requestId);

  const rootTaskId = event.pathParameters?.taskId;
  if (!rootTaskId) return badRequest("Missing taskId", undefined, requestId);
  if (!isUuidV4(rootTaskId)) return badRequest("Invalid taskId", undefined, requestId);

  const body = parseJsonBody(event) as CreateShareRequest | null;
  if (!body) return badRequest("Invalid JSON body", undefined, requestId);

  if (!isBoundedString(body.granteeSub, 128)) return badRequest("granteeSub is required", undefined, requestId);
  if (!isShareMode(body.mode)) return badRequest("mode must be VIEW or EDIT", undefined, requestId);
  if (body.granteeSub === ownerSub) return badRequest("Cannot share to self", undefined, requestId);

  // Ensure the root task exists (and implicitly that the caller is the owner).
  const root = await getTask(ownerSub, rootTaskId);
  if (!root) return notFound("Task not found", requestId);

  const now = new Date().toISOString();
  try {
    const grant = await createShareGrant(ownerSub, rootTaskId, body.granteeSub, body.mode, now);
    const resp: CreateShareResponse = { grant };
    return created(resp, requestId);
  } catch (e: any) {
    if (e?.name === "TransactionCanceledException") {
      return conflict("Share already exists", { rootTaskId, granteeSub: body.granteeSub }, requestId);
    }
    log("error", "shares.create_failed", { requestId, ownerSub, rootTaskId, error: toErrorInfo(e) });
    return internalError("Failed to create share", undefined, requestId);
  }
});
