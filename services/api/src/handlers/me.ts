import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { ok, unauthorized } from "../lib/http";
import { withHttp } from "../lib/handler";
import type { HttpHandlerContext } from "../lib/handler";

export const handler = withHttp(async (event: APIGatewayProxyEventV2, ctx: HttpHandlerContext): Promise<APIGatewayProxyResultV2> => {
  const requestId = ctx.requestId;
  const sub = ctx.sub;
  if (!sub) return unauthorized("Unauthorized", requestId);

  const claims = (event.requestContext.authorizer as any)?.jwt?.claims ?? {};
  return ok(
    {
      ok: true,
      sub,
      email: claims.email ?? null,
    },
    requestId
  );
});
