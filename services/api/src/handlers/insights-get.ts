import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import type { InsightsResponse } from "@tm/shared";
import { internalError, ok, unauthorized } from "../lib/http";
import { withHttp } from "../lib/handler";
import type { HttpHandlerContext } from "../lib/handler";
import { log, toErrorInfo } from "../lib/log";
import { loadTodayTasks } from "../today/repo";
import { buildInsightsResponse } from "../insights/scoring";
import { MemoryTtlCache } from "../lib/memory-cache";

const INSIGHTS_CACHE_TTL_MS = 15_000;
const INSIGHTS_CACHE_MAX_ENTRIES = 200;

const insightsCache = new MemoryTtlCache<InsightsResponse>(
  INSIGHTS_CACHE_TTL_MS,
  INSIGHTS_CACHE_MAX_ENTRIES
);

function parseIncludeShared(raw: string | undefined): boolean {
  return raw === "1" || raw === "true" || raw === "yes";
}

function cacheKey(sub: string, includeShared: boolean): string {
  return `insights:v1:${sub}:${includeShared ? "1" : "0"}`;
}

export const handler = withHttp(async (
  event: APIGatewayProxyEventV2,
  ctx: HttpHandlerContext
): Promise<APIGatewayProxyResultV2> => {
  const requestId = ctx.requestId;
  const sub = ctx.sub;
  if (!sub) return unauthorized("Unauthorized", requestId);

  const includeShared = parseIncludeShared(event.queryStringParameters?.includeShared);
  const key = cacheKey(sub, includeShared);

  try {
    const cached = insightsCache.get(key);
    if (cached) {
      log("info", "insights.cache_hit", {
        requestId,
        sub,
        includeShared,
      });
      return ok(cached, requestId);
    }

    const now = new Date();
    const allItems = await loadTodayTasks(sub, includeShared);
    const resp: InsightsResponse = buildInsightsResponse(allItems, now, includeShared);

    insightsCache.set(key, resp);

    log("info", "insights.cache_miss", {
      requestId,
      sub,
      includeShared,
      suggestionCount: resp.suggestions.length,
    });

    return ok(resp, requestId);
  } catch (e: any) {
    log("error", "insights.get_failed", {
      requestId,
      sub,
      includeShared,
      error: toErrorInfo(e),
    });
    return internalError("Failed to build insights", undefined, requestId);
  }
});