import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { internalError, ok, unauthorized } from "../lib/http";
import { withHttp } from "../lib/handler";
import type { HttpHandlerContext } from "../lib/handler";
import { log, toErrorInfo } from "../lib/log";
import { buildTodayOverview } from "../today/overview";

function parseIncludeShared(raw: string | undefined): boolean {
  return raw === "1" || raw === "true" || raw === "yes";
}

export const handler = withHttp(async (
  event: APIGatewayProxyEventV2,
  ctx: HttpHandlerContext
): Promise<APIGatewayProxyResultV2> => {
  const requestId = ctx.requestId;
  const sub = ctx.sub;
  if (!sub) return unauthorized("Unauthorized", requestId);

  const includeShared = parseIncludeShared(event.queryStringParameters?.includeShared);
  const now = new Date();

  try {
    const resp = await buildTodayOverview(sub, includeShared, now);
    return ok(resp, requestId);
  } catch (e: any) {
    log("error", "today.get_failed", { requestId, sub, includeShared, error: toErrorInfo(e) });
    return internalError("Failed to build Today view", undefined, requestId);
  }
});
