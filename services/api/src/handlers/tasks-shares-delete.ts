import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import type { RevokeShareResponse } from "@tm/shared";
import { badRequest, conflict, internalError, ok, unauthorized } from "../lib/http";
import { withHttp } from "../lib/handler";
import type { HttpHandlerContext } from "../lib/handler";
import { revokeShareGrant } from "../tasks/sharing";
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
  const ownerSub = ctx.sub;
  if (!ownerSub) return unauthorized("Unauthorized", requestId);

  const rootTaskId = event.pathParameters?.taskId;
  if (!rootTaskId) return badRequest("Missing taskId", undefined, requestId);
  if (!isUuidV4(rootTaskId)) return badRequest("Invalid taskId", undefined, requestId);

  const granteeSub = event.pathParameters?.granteeSub;
  if (!isBoundedString(granteeSub, 128)) return badRequest("Missing granteeSub", undefined, requestId);
  if (granteeSub === ownerSub) return badRequest("Owner cannot be removed", undefined, requestId);

  try {
    await revokeShareGrant(ownerSub, rootTaskId, granteeSub);
    const resp: RevokeShareResponse = { ok: true };
    return ok(resp, requestId);
  } catch (e: any) {
    if (e?.name === "TransactionCanceledException") {
      return conflict("Share not found", { rootTaskId, granteeSub }, requestId);
    }
    log("error", "shares.revoke_failed", { requestId, ownerSub, rootTaskId, granteeSub, error: toErrorInfo(e) });
    return internalError("Failed to revoke share", undefined, requestId);
  }
});
