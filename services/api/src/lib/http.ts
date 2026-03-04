import type { APIGatewayProxyResultV2 } from "aws-lambda";
import type { ErrorResponse } from "@tm/shared";

const JSON_HEADERS = {
  "content-type": "application/json",
} as const;

function withRequestId(headers: Record<string, string>, requestId?: string): Record<string, string> {
  if (!requestId) return headers;
  return { ...headers, "x-request-id": requestId };
}

export function json(statusCode: number, body: unknown, requestId?: string): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: withRequestId({ ...JSON_HEADERS }, requestId),
    body: JSON.stringify(body),
  };
}

export function ok(body: unknown, requestId?: string): APIGatewayProxyResultV2 {
  return json(200, body, requestId);
}

export function created(body: unknown, requestId?: string): APIGatewayProxyResultV2 {
  return json(201, body, requestId);
}

export function noContent(requestId?: string): APIGatewayProxyResultV2 {
  return { statusCode: 204, headers: withRequestId({}, requestId) };
}

export function errorResponse(
  statusCode: number,
  code: string,
  message: string,
  details?: unknown,
  requestId?: string
): APIGatewayProxyResultV2 {
  const body: ErrorResponse = { error: { code, message, details, requestId } };
  return json(statusCode, body, requestId);
}

export function badRequest(message: string, details?: unknown, requestId?: string): APIGatewayProxyResultV2 {
  return errorResponse(400, "BadRequest", message, details, requestId);
}

export function unauthorized(message = "Unauthorized", requestId?: string): APIGatewayProxyResultV2 {
  return errorResponse(401, "Unauthorized", message, undefined, requestId);
}

export function forbidden(message = "Forbidden", requestId?: string): APIGatewayProxyResultV2 {
  return errorResponse(403, "Forbidden", message, undefined, requestId);
}

export function notFound(message = "Not found", requestId?: string): APIGatewayProxyResultV2 {
  return errorResponse(404, "NotFound", message, undefined, requestId);
}

export function conflict(message: string, details?: unknown, requestId?: string): APIGatewayProxyResultV2 {
  return errorResponse(409, "Conflict", message, details, requestId);
}

export function internalError(message = "Internal error", details?: unknown, requestId?: string): APIGatewayProxyResultV2 {
  return errorResponse(500, "InternalError", message, details, requestId);
}
