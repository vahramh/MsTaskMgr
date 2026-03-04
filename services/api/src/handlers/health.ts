import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { ok } from "../lib/http";
import { withHttp } from "../lib/handler";
import type { HttpHandlerContext } from "../lib/handler";

export const handler = withHttp(async (_event: APIGatewayProxyEventV2, ctx: HttpHandlerContext): Promise<APIGatewayProxyResultV2> => {
  return ok({
    ok: true as const,
    service: "api" as const,
    time: new Date().toISOString(),
  }, ctx.requestId);
});
