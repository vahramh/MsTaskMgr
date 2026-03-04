import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import type { ListSubtasksResponse } from "@tm/shared";
import { badRequest, forbidden, internalError, ok, unauthorized } from "../lib/http";
import { withHttp } from "../lib/handler";
import type { HttpHandlerContext } from "../lib/handler";
import { decodeNextToken, encodeNextToken } from "../lib/paging";
import { listSubtasks } from "../tasks/repo";
import { pkForUser } from "../tasks/keys";
import { getLookup, getSharedPointer } from "../tasks/sharing";
import { log, toErrorInfo } from "../lib/log";

function isUuidV4(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function isBoundedString(v: unknown, maxLen: number): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= maxLen;
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

function validateEks(viewerSub: string, ownerSub: string, parentTaskId: string, eks: unknown): eks is { PK: string; SK: string } {
  if (!isPlainObject(eks)) return false;
  const keys = Object.keys(eks);
  if (keys.length !== 2) return false;
  for (const k of keys) if (k !== "PK" && k !== "SK") return false;
  const PK = (eks as any).PK;
  const SK = (eks as any).SK;
  if (!isBoundedString(PK, 256) || !isBoundedString(SK, 512)) return false;

  // Token is bound to viewerSub via decodeNextToken(); now bind the key to the owner partition.
  if (PK !== pkForUser(ownerSub)) return false;

  const prefix = `SUBTASK#${parentTaskId}#`;
  if (!SK.startsWith(prefix)) return false;
  return true;
}

export const handler = withHttp(async (
  event: APIGatewayProxyEventV2,
  ctx: HttpHandlerContext
): Promise<APIGatewayProxyResultV2> => {
  const requestId = ctx.requestId;
  const viewerSub = ctx.sub;
  if (!viewerSub) return unauthorized("Unauthorized", requestId);

  const ownerSub = event.pathParameters?.ownerSub;
  if (!isBoundedString(ownerSub, 128)) return badRequest("Missing ownerSub", undefined, requestId);

  const rootTaskId = event.pathParameters?.rootTaskId;
  if (!rootTaskId) return badRequest("Missing rootTaskId", undefined, requestId);
  if (!isUuidV4(rootTaskId)) return badRequest("Invalid rootTaskId", undefined, requestId);

  const parentTaskId = event.pathParameters?.parentTaskId;
  if (!parentTaskId) return badRequest("Missing parentTaskId", undefined, requestId);
  if (!isUuidV4(parentTaskId)) return badRequest("Invalid parentTaskId", undefined, requestId);

  const qs = event.queryStringParameters ?? {};
  const limitR = parseLimit(qs.limit);
  if (!limitR.ok) return badRequest(limitR.message, undefined, requestId);

  const nextToken = qs.nextToken;
  if (nextToken !== undefined && nextToken.trim() === "") return badRequest("Invalid nextToken", undefined, requestId);

  try {
    const ptr = await getSharedPointer(viewerSub, ownerSub, rootTaskId);
    if (!ptr) return forbidden("Not shared with you", requestId);

    // Secure subtree membership: parentTaskId must belong to this root.
    const lookup = await getLookup(ownerSub, parentTaskId);
    if (!lookup || lookup.rootTaskId !== rootTaskId) return forbidden("Invalid parent for this shared root", requestId);

    let eks: { PK: string; SK: string } | undefined;
    if (nextToken) {
      const decoded = decodeNextToken(viewerSub, nextToken);
      if (!validateEks(viewerSub, ownerSub, parentTaskId, decoded)) return badRequest("Invalid nextToken", undefined, requestId);
      eks = decoded as any;
    }

    const r = await listSubtasks(ownerSub, parentTaskId, limitR.value, eks);
    const resp: ListSubtasksResponse = {
      items: r.items,
      nextToken: r.lastEvaluatedKey ? encodeNextToken(viewerSub, r.lastEvaluatedKey) : undefined,
    };
    return ok(resp, requestId);
  } catch (e: any) {
    log("error", "shared.subtasks_list_failed", {
      requestId,
      viewerSub,
      ownerSub,
      rootTaskId,
      parentTaskId,
      error: toErrorInfo(e),
    });
    return internalError("Failed to list shared subtasks", undefined, requestId);
  }
});
