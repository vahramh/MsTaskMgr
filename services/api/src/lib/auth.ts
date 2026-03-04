import type { APIGatewayProxyEventV2 } from "aws-lambda";

/**
 * Extracts Cognito subject (sub) from HTTP API v2 JWT authorizer claims.
 */
export function getUserSub(event: APIGatewayProxyEventV2): string | null {
  const claims = (event.requestContext.authorizer as any)?.jwt?.claims ?? {};
  const sub = claims.sub;
  return typeof sub === "string" && sub.length > 0 ? sub : null;
}
