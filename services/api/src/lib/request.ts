import type { APIGatewayProxyEventV2 } from "aws-lambda";

export function getRequestId(event: APIGatewayProxyEventV2): string | undefined {
  return event.requestContext?.requestId;
}

/**
 * Parse a JSON body from HTTP API v2 event.
 * Returns null if body missing or invalid JSON.
 */
export function parseJsonBody(event: APIGatewayProxyEventV2): unknown | null {
  if (!event.body) return null;
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
