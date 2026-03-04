import {
  BatchGetCommand,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import type { Task, ShareMode, ShareGrant, SharedTaskPointer } from "@tm/shared";
import { ddb, mustGetEnv } from "../lib/db";
import { pkForUser, skForTask, skForLookup, skForShareGrant, skForSharedPointer } from "./keys";
import { toTask } from "./types";

const TABLE = () => mustGetEnv("TASKS_TABLE");

// ----------------------------------------------------------------------
// Lookup items (secure subtree membership)

export type LookupKind = "ROOT" | "SUBTASK";

export type TaskLookup = {
  taskId: string;
  kind: LookupKind;
  rootTaskId: string;
  parentTaskId?: string;
  taskSk: string;
};

export async function getLookup(ownerSub: string, taskId: string): Promise<TaskLookup | null> {
  const r = await ddb.send(
    new GetCommand({
      TableName: TABLE(),
      Key: { PK: pkForUser(ownerSub), SK: skForLookup(taskId) },
    })
  );
  if (!r.Item) return null;
  return {
    taskId: r.Item.taskId,
    kind: r.Item.kind,
    rootTaskId: r.Item.rootTaskId,
    parentTaskId: r.Item.parentTaskId,
    taskSk: r.Item.taskSk,
  } as TaskLookup;
}

export function lookupItemForRoot(ownerSub: string, rootTaskId: string): any {
  return {
    PK: pkForUser(ownerSub),
    SK: skForLookup(rootTaskId),
    taskId: rootTaskId,
    kind: "ROOT",
    rootTaskId,
    taskSk: skForTask(rootTaskId),
  };
}

export function lookupItemForSubtask(ownerSub: string, rootTaskId: string, parentTaskId: string, taskId: string): any {
  return {
    PK: pkForUser(ownerSub),
    SK: skForLookup(taskId),
    taskId,
    kind: "SUBTASK",
    rootTaskId,
    parentTaskId,
    taskSk: `SUBTASK#${parentTaskId}#${taskId}`,
  };
}

// ----------------------------------------------------------------------
// Share grants + pointers

export async function createShareGrant(
  ownerSub: string,
  rootTaskId: string,
  granteeSub: string,
  mode: ShareMode,
  nowIso: string
): Promise<ShareGrant> {
  const grant: ShareGrant = {
    rootTaskId,
    ownerSub,
    granteeSub,
    mode,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const ownerItem = {
    PK: pkForUser(ownerSub),
    SK: skForShareGrant(rootTaskId, granteeSub),
    ...grant,
    itemType: "SHARE_GRANT",
  };

  const granteeItem = {
    PK: pkForUser(granteeSub),
    SK: skForSharedPointer(ownerSub, rootTaskId),
    ownerSub,
    rootTaskId,
    mode,
    grantedAt: nowIso,
    itemType: "SHARED_POINTER",
  };

  await ddb.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: TABLE(),
            Item: ownerItem,
            ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)",
          },
        },
        {
          Put: {
            TableName: TABLE(),
            Item: granteeItem,
            ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)",
          },
        },
      ],
    })
  );

  return grant;
}

export async function revokeShareGrant(ownerSub: string, rootTaskId: string, granteeSub: string): Promise<void> {
  await ddb.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Delete: {
            TableName: TABLE(),
            Key: { PK: pkForUser(ownerSub), SK: skForShareGrant(rootTaskId, granteeSub) },
            ConditionExpression: "attribute_exists(PK) AND attribute_exists(SK)",
          },
        },
        {
          Delete: {
            TableName: TABLE(),
            Key: { PK: pkForUser(granteeSub), SK: skForSharedPointer(ownerSub, rootTaskId) },
            ConditionExpression: "attribute_exists(PK) AND attribute_exists(SK)",
          },
        },
      ],
    })
  );
}

export async function listSharesForRoot(
  ownerSub: string,
  rootTaskId: string,
  limit: number,
  exclusiveStartKey?: { PK: string; SK: string }
): Promise<{ items: ShareGrant[]; lastEvaluatedKey?: { PK: string; SK: string } }> {
  const prefix = `SHARE#${rootTaskId}#`;
  const r = await ddb.send(
    new QueryCommand({
      TableName: TABLE(),
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: { ":pk": pkForUser(ownerSub), ":prefix": prefix },
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
      ScanIndexForward: true,
    })
  );
  const items: ShareGrant[] = (r.Items ?? []).map((it: any) => ({
    rootTaskId: it.rootTaskId,
    ownerSub: it.ownerSub,
    granteeSub: it.granteeSub,
    mode: it.mode,
    createdAt: it.createdAt,
    updatedAt: it.updatedAt,
  }));
  const lek = r.LastEvaluatedKey as any;
  const lastEvaluatedKey =
    lek && typeof lek.PK === "string" && typeof lek.SK === "string" ? ({ PK: lek.PK, SK: lek.SK } as const) : undefined;
  return { items, lastEvaluatedKey };
}

export async function listSharedWithMe(
  viewerSub: string,
  limit: number,
  exclusiveStartKey?: { PK: string; SK: string }
): Promise<{ items: SharedTaskPointer[]; lastEvaluatedKey?: { PK: string; SK: string } }> {
  const r = await ddb.send(
    new QueryCommand({
      TableName: TABLE(),
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: { ":pk": pkForUser(viewerSub), ":prefix": "SHARED#" },
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
      ScanIndexForward: true,
    })
  );
  const items: SharedTaskPointer[] = (r.Items ?? []).map((it: any) => ({
    ownerSub: it.ownerSub,
    rootTaskId: it.rootTaskId,
    mode: it.mode,
    grantedAt: it.grantedAt,
  }));
  const lek = r.LastEvaluatedKey as any;
  const lastEvaluatedKey =
    lek && typeof lek.PK === "string" && typeof lek.SK === "string" ? ({ PK: lek.PK, SK: lek.SK } as const) : undefined;
  return { items, lastEvaluatedKey };
}

export async function getSharedPointer(
  viewerSub: string,
  ownerSub: string,
  rootTaskId: string
): Promise<SharedTaskPointer | null> {
  const r = await ddb.send(
    new GetCommand({
      TableName: TABLE(),
      Key: { PK: pkForUser(viewerSub), SK: skForSharedPointer(ownerSub, rootTaskId) },
    })
  );
  if (!r.Item) return null;
  return {
    ownerSub: r.Item.ownerSub,
    rootTaskId: r.Item.rootTaskId,
    mode: r.Item.mode,
    grantedAt: r.Item.grantedAt,
  };
}

export async function batchGetRootTasks(
  pointers: Array<{ ownerSub: string; rootTaskId: string }>
): Promise<Map<string, Task>> {
  let keys = pointers.map((p) => ({ PK: pkForUser(p.ownerSub), SK: skForTask(p.rootTaskId) }));
  if (keys.length === 0) return new Map();

  const out = new Map<string, Task>();
  for (let attempt = 0; attempt < 3 && keys.length > 0; attempt++) {
    const r = await ddb.send(
      new BatchGetCommand({
        RequestItems: {
          [TABLE()]: {
            Keys: keys,
          },
        },
      })
    );
    const items = (r.Responses?.[TABLE()] ?? []) as any[];
    for (const it of items) {
      const t = toTask(it);
      out.set(`${it.PK}::${it.SK}`, t);
    }
    const unprocessed = (r.UnprocessedKeys?.[TABLE()]?.Keys ?? []) as any[];
    keys = unprocessed;
  }

  return out;
}
