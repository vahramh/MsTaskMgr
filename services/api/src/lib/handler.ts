import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { getUserSub } from "./auth";
import { internalError } from "./http";
import { log, toErrorInfo } from "./log";
import { getRequestId } from "./request";

export type HttpHandlerContext = {
  requestId: string;
  routeKey?: string;
  sub?: string;
  startTimeMs: number;
};

export type HttpHandler = (event: APIGatewayProxyEventV2, ctx: HttpHandlerContext) => Promise<APIGatewayProxyResultV2>;

/**
 * Minimal handler wrapper for HTTP API v2 lambdas.
 * - Ensures request correlation (x-request-id).
 * - Emits consistent structured logs (request + response).
 * - Converts unexpected exceptions into structured ErrorResponse (500).
 */
export function withHttp(fn: HttpHandler): (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyResultV2> {
  return async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    const startTimeMs = Date.now();
    const requestId = getRequestId(event) ?? "unknown";
    const routeKey = event.requestContext?.routeKey;
    const sub = getUserSub(event);

    log("info", "http.request", {
      requestId,
      routeKey,
      method: event.requestContext?.http?.method,
      path: event.requestContext?.http?.path,
      sub,
    });

    try {
      const result = await fn(event, { requestId, routeKey, sub, startTimeMs });
      const statusCode = (result as any)?.statusCode ?? 200;

      log("info", "http.response", {
        requestId,
        routeKey,
        statusCode,
        durationMs: Date.now() - startTimeMs,
        sub,
      });

      // Ensure request id header is always present (even if handler returned a raw object).
      const headers = { ...(result.headers ?? {}), "x-request-id": requestId };
      return { ...result, headers };
    } catch (e: any) {
      log("error", "http.unhandled", {
        requestId,
        routeKey,
        durationMs: Date.now() - startTimeMs,
        sub,
        error: toErrorInfo(e),
      });

      // Always return structured error contract for unhandled exceptions.
      return internalError("Internal error", undefined, requestId);
    }
  };
}
