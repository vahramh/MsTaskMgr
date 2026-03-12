import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import type { ListBucketTasksResponse, WorkflowState } from "@tm/shared";
import { badRequest, internalError, ok, unauthorized } from "../lib/http";
import { withHttp } from "../lib/handler";
import type { HttpHandlerContext } from "../lib/handler";
import { decodeNextToken, encodeNextToken } from "../lib/paging";
import { log, toErrorInfo } from "../lib/log";
import { gsi2pkForUserState, pkForUser } from "../tasks/keys";
import { listBucketTasksByState } from "../tasks/repo";
import { isWorkflowState } from "../tasks/gtd";

function parseIntParam(v: string | undefined, def: number): number {
  if (!v) return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== "object") return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
}

function isBoundedString(v: unknown, maxLen: number): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= maxLen;
}

function validateExclusiveStartKeyForBucket(sub: string, state: WorkflowState, eks: unknown): eks is {
  PK: string;
  SK: string;
  GSI2PK: string;
  GSI2SK: string;
} {
  if (!isPlainObject(eks)) return false;
  const keys = Object.keys(eks);
  if (keys.length !== 4) return false;
  for (const k of keys) {
    if (k !== "PK" && k !== "SK" && k !== "GSI2PK" && k !== "GSI2SK") return false;
  }

  const PK = (eks as any).PK;
  const SK = (eks as any).SK;
  const GSI2PK = (eks as any).GSI2PK;
  const GSI2SK = (eks as any).GSI2SK;

  if (!isBoundedString(PK, 256) || !isBoundedString(SK, 512) || !isBoundedString(GSI2PK, 256) || !isBoundedString(GSI2SK, 512)) {
    return false;
  }

  if (PK !== pkForUser(sub) || GSI2PK !== gsi2pkForUserState(sub, state)) return false;
  return true;
}

export const handler = withHttp(async (
  event: APIGatewayProxyEventV2,
  ctx: HttpHandlerContext
): Promise<APIGatewayProxyResultV2> => {
  const requestId = ctx.requestId;
  const sub = ctx.sub;
  if (!sub) return unauthorized("Unauthorized", requestId);

  const state = event.pathParameters?.state;
  if (!state || !isWorkflowState(state)) return badRequest("Invalid state", undefined, requestId);

  const qs = event.queryStringParameters ?? {};
  const limit = Math.max(1, Math.min(100, parseIntParam(qs.limit, 50)));

  const nextToken = qs.nextToken;
  if (nextToken !== undefined && nextToken.trim() === "") return badRequest("Invalid nextToken", undefined, requestId);

  let eks: any | undefined;
  if (nextToken) {
    const decoded = decodeNextToken(sub, nextToken);
    if (!validateExclusiveStartKeyForBucket(sub, state, decoded)) {
      return badRequest("Invalid nextToken", undefined, requestId);
    }
    eks = decoded;
  }

  try {
    const r = await listBucketTasksByState(sub, state, limit, eks);
    const resp: ListBucketTasksResponse = {
      items: r.items,
      nextToken: r.lastEvaluatedKey ? encodeNextToken(sub, r.lastEvaluatedKey) : undefined,
    };
    return ok(resp, requestId);
  } catch (e: any) {
    log("error", "task_buckets.list_failed", { requestId, sub, state, error: toErrorInfo(e) });
    return internalError("Failed to list task bucket", undefined, requestId);
  }
});
