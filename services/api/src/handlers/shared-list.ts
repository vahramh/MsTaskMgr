import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import type { ListSharedWithMeResponse, SharedTaskPointer } from "@tm/shared";
import { badRequest, internalError, ok, unauthorized } from "../lib/http";
import { withHttp } from "../lib/handler";
import type { HttpHandlerContext } from "../lib/handler";
import { decodeNextToken, encodeNextToken } from "../lib/paging";
import { batchGetRootTasks, listSharedWithMe } from "../tasks/sharing";
import { pkForUser } from "../tasks/keys";
import { log, toErrorInfo } from "../lib/log";

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

function validateEks(viewerSub: string, eks: unknown): eks is { PK: string; SK: string } {
  if (!isPlainObject(eks)) return false;
  const keys = Object.keys(eks);
  if (keys.length !== 2) return false;
  for (const k of keys) if (k !== "PK" && k !== "SK") return false;
  const PK = (eks as any).PK;
  const SK = (eks as any).SK;
  if (!isBoundedString(PK, 256) || !isBoundedString(SK, 512)) return false;
  if (PK !== pkForUser(viewerSub)) return false;
  if (!SK.startsWith("SHARED#")) return false;
  return true;
}

export const handler = withHttp(async (
  event: APIGatewayProxyEventV2,
  ctx: HttpHandlerContext
): Promise<APIGatewayProxyResultV2> => {
  const requestId = ctx.requestId;
  const viewerSub = ctx.sub;
  if (!viewerSub) return unauthorized("Unauthorized", requestId);

  const qs = event.queryStringParameters ?? {};
  const limitR = parseLimit(qs.limit);
  if (!limitR.ok) return badRequest(limitR.message, undefined, requestId);

  const nextToken = qs.nextToken;
  if (nextToken !== undefined && nextToken.trim() === "") return badRequest("Invalid nextToken", undefined, requestId);

  let eks: { PK: string; SK: string } | undefined;
  if (nextToken) {
    const decoded = decodeNextToken(viewerSub, nextToken);
    if (!validateEks(viewerSub, decoded)) return badRequest("Invalid nextToken", undefined, requestId);
    eks = decoded as any;
  }

  try {
    const r = await listSharedWithMe(viewerSub, limitR.value, eks);

    // Opportunistically attach the root task item (bounded, no scans).
    const map = await batchGetRootTasks(r.items.map((p) => ({ ownerSub: p.ownerSub, rootTaskId: p.rootTaskId })));

    const items = r.items.map((p: SharedTaskPointer) => {
      const key = `${pkForUser(p.ownerSub)}::TASK#${p.rootTaskId}`;
      const task = map.get(key);
      return { ...p, task };
    });

    const resp: ListSharedWithMeResponse = {
      items,
      nextToken: r.lastEvaluatedKey ? encodeNextToken(viewerSub, r.lastEvaluatedKey) : undefined,
    };
    return ok(resp, requestId);
  } catch (e: any) {
    log("error", "shared.list_failed", { requestId, viewerSub, error: toErrorInfo(e) });
    return internalError("Failed to list shared tasks", undefined, requestId);
  }
});
