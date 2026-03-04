import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import type { ListSubtasksResponse } from "@tm/shared";
import { ok, badRequest, unauthorized, internalError } from "../lib/http";
import { withHttp } from "../lib/handler";
import type { HttpHandlerContext } from "../lib/handler";
import { decodeNextToken, encodeNextToken } from "../lib/paging";
import { listSubtasks } from "../tasks/repo";
import { pkForUser } from "../tasks/keys";
import { log, toErrorInfo } from "../lib/log";

function isUuidV4(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function parseLimit(raw: string | undefined): { ok: true; value: number } | { ok: false; message: string } {
  if (raw === undefined) return { ok: true, value: 50 };
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return { ok: false, message: "limit must be a positive integer" };
  if (n > 100) return { ok: false, message: "limit too large (max 100)" };
  return { ok: true, value: n };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== "object") return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
}

function isBoundedString(v: unknown, maxLen: number): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= maxLen;
}

function validateExclusiveStartKeyForSubtasks(
  sub: string,
  parentTaskId: string,
  eks: unknown
): eks is { PK: string; SK: string } {
  if (!isPlainObject(eks)) return false;

  // Strict allow-list (no extra keys).
  const keys = Object.keys(eks);
  if (keys.length !== 2) return false;
  for (const k of keys) {
    if (k !== "PK" && k !== "SK") return false;
  }

  const PK = (eks as any).PK;
  const SK = (eks as any).SK;

  if (!isBoundedString(PK, 256) || !isBoundedString(SK, 512)) return false;

  // Bind token to the caller partition.
  if (PK !== pkForUser(sub)) return false;

  // Bind token to this subtree prefix.
  const prefix = `SUBTASK#${parentTaskId}#`;
  if (!SK.startsWith(prefix)) return false;

  return true;
}

export const handler = withHttp(async (
  event: APIGatewayProxyEventV2,
  ctx: HttpHandlerContext
): Promise<APIGatewayProxyResultV2> => {
  const requestId = ctx.requestId;
  const sub = ctx.sub;
  if (!sub) return unauthorized("Unauthorized", requestId);

  const parentTaskId = event.pathParameters?.taskId;
  if (!parentTaskId) return badRequest("Missing taskId", undefined, requestId);
  if (!isUuidV4(parentTaskId)) return badRequest("Invalid taskId", undefined, requestId);

  const qs = event.queryStringParameters ?? {};
  const limitR = parseLimit(qs.limit);
  if (!limitR.ok) return badRequest(limitR.message, undefined, requestId);

  const nextToken = qs.nextToken;
  if (nextToken !== undefined && nextToken.trim() === "") return badRequest("Invalid nextToken", undefined, requestId);

  let eks: { PK: string; SK: string } | undefined;
  if (nextToken) {
    const decoded = decodeNextToken(sub, nextToken);
    if (!validateExclusiveStartKeyForSubtasks(sub, parentTaskId, decoded)) {
      return badRequest("Invalid nextToken", undefined, requestId);
    }
    eks = decoded as any;
  }

  try {
    const r = await listSubtasks(sub, parentTaskId, limitR.value, eks);
    const resp: ListSubtasksResponse = {
      items: r.items,
      nextToken: r.lastEvaluatedKey ? encodeNextToken(sub, r.lastEvaluatedKey) : undefined,
    };
    return ok(resp, requestId);
  } catch (e: any) {
    log("error", "subtasks.list_failed", { requestId, sub, parentTaskId, error: toErrorInfo(e) });
    return internalError("Failed to list subtasks", undefined, requestId);
  }
});
