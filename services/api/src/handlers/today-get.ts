
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { internalError, ok, unauthorized } from "../lib/http";
import { withHttp } from "../lib/handler";
import type { HttpHandlerContext } from "../lib/handler";
import { log, toErrorInfo } from "../lib/log";
import { getRawSettings } from "../settings/repo";
import { buildTodayOverview } from "../today/overview";

function parseIncludeShared(raw: string | undefined): boolean {
  return raw === "1" || raw === "true" || raw === "yes";
}

function parseBoolean(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw === undefined) return defaultValue;
  return raw === "1" || raw === "true" || raw === "yes";
}


function timezoneFromRawSettings(raw: Record<string, any> | null): string {
  const timezone = raw?.notificationSchedule?.timezone;
  return typeof timezone === "string" && timezone.trim() ? timezone.trim() : "Australia/Melbourne";
}

function parseContextIds(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  const items = raw.split(",").map((value) => value.trim()).filter(Boolean);
  return items.length ? items : undefined;
}

export const handler = withHttp(async (
  event: APIGatewayProxyEventV2,
  ctx: HttpHandlerContext
): Promise<APIGatewayProxyResultV2> => {
  const requestId = ctx.requestId;
  const sub = ctx.sub;
  if (!sub) return unauthorized("Unauthorized", requestId);

  const includeShared = parseIncludeShared(event.queryStringParameters?.includeShared);
  const activeContextIds = parseContextIds(event.queryStringParameters?.activeContextIds);
  const includeNoContext = parseBoolean(event.queryStringParameters?.includeNoContext, true);
  const now = new Date();

  try {
    const rawSettings = await getRawSettings(sub);
    const timezone = timezoneFromRawSettings(rawSettings);
    const resp = await buildTodayOverview(sub, includeShared, now, activeContextIds, includeNoContext, timezone);
    return ok(resp, requestId);
  } catch (e: any) {
    log("error", "today.get_failed", { requestId, sub, includeShared, activeContextIds, includeNoContext, error: toErrorInfo(e) });
    return internalError("Failed to build Today view", undefined, requestId);
  }
});
