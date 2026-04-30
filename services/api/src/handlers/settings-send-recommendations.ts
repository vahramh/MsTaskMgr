import type { APIGatewayProxyResultV2 } from "aws-lambda";
import { ok, unauthorized } from "../lib/http";
import { withHttp, type HttpHandlerContext } from "../lib/handler";
import { sendRecommendationsEmailForUser } from "../settings/recommendation-email";

export const handler = withHttp(async (_event, ctx: HttpHandlerContext): Promise<APIGatewayProxyResultV2> => {
  if (!ctx.sub) return unauthorized("Unauthorized", ctx.requestId);
  return ok(await sendRecommendationsEmailForUser(ctx.sub), ctx.requestId);
});
