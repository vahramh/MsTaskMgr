import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import type { UpdateUserSettingsRequest } from "@tm/shared";
import { badRequest, internalError, ok, unauthorized } from "../lib/http";
import { withHttp, type HttpHandlerContext } from "../lib/handler";
import { getSettings, updateSettings } from "../settings/repo";
import { log, toErrorInfo } from "../lib/log";

function parseBody(event: APIGatewayProxyEventV2): UpdateUserSettingsRequest | null {
  if (!event.body) return {};
  try { return JSON.parse(event.body) as UpdateUserSettingsRequest; } catch { return null; }
}

export const handler = withHttp(async (event: APIGatewayProxyEventV2, ctx: HttpHandlerContext): Promise<APIGatewayProxyResultV2> => {
  if (!ctx.sub) return unauthorized("Unauthorized", ctx.requestId);
  if (event.requestContext.http.method === "GET") return ok({ settings: await getSettings(ctx.sub) }, ctx.requestId);
  const body = parseBody(event);
  if (!body) return badRequest("Invalid JSON body", undefined, ctx.requestId);
  try {
    return ok({ settings: await updateSettings(ctx.sub, body) }, ctx.requestId);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update settings";
    if (message.includes("notificationEmail")) return badRequest(message, undefined, ctx.requestId);
    log("error", "settings.update_failed", { requestId: ctx.requestId, sub: ctx.sub, error: toErrorInfo(e) });
    return internalError("Failed to update settings", undefined, ctx.requestId);
  }
});
