import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import type { BucketCountsResponse } from "@tm/shared";
import { internalError, ok, unauthorized } from "../lib/http";
import { withHttp } from "../lib/handler";
import type { HttpHandlerContext } from "../lib/handler";
import { log, toErrorInfo } from "../lib/log";
import { getBucketCounts } from "../tasks/repo";

export const handler = withHttp(async (
  _event: APIGatewayProxyEventV2,
  ctx: HttpHandlerContext
): Promise<APIGatewayProxyResultV2> => {
  const requestId = ctx.requestId;
  const sub = ctx.sub;
  if (!sub) return unauthorized("Unauthorized", requestId);

  try {
    const counts = await getBucketCounts(sub);
    const resp: BucketCountsResponse = { counts };
    return ok(resp, requestId);
  } catch (e: any) {
    log("error", "task_buckets.counts_failed", { requestId, sub, error: toErrorInfo(e) });
    return internalError("Failed to load bucket counts", undefined, requestId);
  }
});
