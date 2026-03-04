import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import type { ListTasksResponse } from "@tm/shared";
import { ok, badRequest, unauthorized, internalError } from "../lib/http";
import { withHttp } from "../lib/handler";
import type { HttpHandlerContext } from "../lib/handler";
import { listTasksByCreatedAt } from "../tasks/repo";
import { decodeNextToken, encodeNextToken } from "../lib/paging";
import { gsi1pkForUser, pkForUser } from "../tasks/keys";
import { log, toErrorInfo } from "../lib/log";

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

function validateExclusiveStartKeyForList(sub: string, eks: unknown): eks is {
  PK: string;
  SK: string;
  GSI1PK: string;
  GSI1SK: string;
} {
  if (!isPlainObject(eks)) return false;

  // Strict allow-list (no extra keys).
  const keys = Object.keys(eks);
  if (keys.length !== 4) return false;
  for (const k of keys) {
    if (k !== "PK" && k !== "SK" && k !== "GSI1PK" && k !== "GSI1SK") return false;
  }

  const PK = (eks as any).PK;
  const SK = (eks as any).SK;
  const GSI1PK = (eks as any).GSI1PK;
  const GSI1SK = (eks as any).GSI1SK;

  // Dynamo key fragments shouldn't be huge; this is just defensive.
  if (!isBoundedString(PK, 256) || !isBoundedString(SK, 256) || !isBoundedString(GSI1PK, 256) || !isBoundedString(GSI1SK, 512)) {
    return false;
  }

  // Bind the ExclusiveStartKey to this user's partition.
  if (PK !== pkForUser(sub) || GSI1PK !== gsi1pkForUser(sub)) return false;

  return true;
}

export const handler = withHttp(
  async (event: APIGatewayProxyEventV2, ctx: HttpHandlerContext): Promise<APIGatewayProxyResultV2> => {
    const requestId = ctx.requestId;
    const sub = ctx.sub;
    if (!sub) return unauthorized("Unauthorized", requestId);

    const qs = event.queryStringParameters ?? {};
    const limit = Math.max(1, Math.min(100, parseIntParam(qs.limit, 20)));

    const nextToken = qs.nextToken;
    if (nextToken !== undefined && nextToken.trim() === "") return badRequest("Invalid nextToken", undefined, requestId);

    let eks: any | undefined;
    if (nextToken) {
      const decoded = decodeNextToken(sub, nextToken);
      if (!validateExclusiveStartKeyForList(sub, decoded)) {
        return badRequest("Invalid nextToken", undefined, requestId);
      }
      eks = decoded;
    }

    try {
      const r = await listTasksByCreatedAt(sub, limit, eks);
      const resp: ListTasksResponse = {
        items: r.items,
        nextToken: r.lastEvaluatedKey ? encodeNextToken(sub, r.lastEvaluatedKey) : undefined,
      };
      return ok(resp, requestId);
    } catch (e: any) {
      log("error", "tasks.list_failed", { requestId, sub, error: toErrorInfo(e) });
      return internalError("Failed to list tasks", undefined, requestId);
    }
  }
);
