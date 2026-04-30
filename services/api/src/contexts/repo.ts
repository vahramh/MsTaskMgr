
import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { ExecutionContext, ExecutionContextKind } from "@tm/shared";
import { ddb, mustGetEnv } from "../lib/db";

const TABLE = () => mustGetEnv("TASKS_TABLE");

function pkForUser(sub: string): string {
  return `USER#${sub}`;
}

function skForContext(contextId: string): string {
  return `CONTEXT#${contextId}`;
}

function toExecutionContext(item: Record<string, any>): ExecutionContext {
  return {
    contextId: String(item.contextId),
    name: String(item.name),
    kind: item.kind as ExecutionContextKind,
    sortOrder: typeof item.sortOrder === "number" ? item.sortOrder : 0,
    archived: Boolean(item.archived),
    significant: Boolean(item.significant),
    createdAt: String(item.createdAt),
    updatedAt: String(item.updatedAt),
  };
}

export async function listExecutionContexts(sub: string): Promise<ExecutionContext[]> {
  const r = await ddb.send(new QueryCommand({
    TableName: TABLE(),
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
    ExpressionAttributeValues: {
      ":pk": pkForUser(sub),
      ":prefix": "CONTEXT#",
    },
    ScanIndexForward: true,
  }));
  return (r.Items ?? [])
    .map((item) => toExecutionContext(item))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export async function getExecutionContext(sub: string, contextId: string): Promise<ExecutionContext | null> {
  const r = await ddb.send(new GetCommand({
    TableName: TABLE(),
    Key: { PK: pkForUser(sub), SK: skForContext(contextId) },
  }));
  return r.Item ? toExecutionContext(r.Item) : null;
}

export async function createExecutionContext(sub: string, context: ExecutionContext): Promise<ExecutionContext> {
  await ddb.send(new PutCommand({
    TableName: TABLE(),
    Item: {
      PK: pkForUser(sub),
      SK: skForContext(context.contextId),
      ...context,
    },
    ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)",
  }));
  return context;
}

export async function updateExecutionContext(sub: string, contextId: string, patch: Partial<ExecutionContext>): Promise<ExecutionContext | null> {
  const names: Record<string, string> = { "#updatedAt": "updatedAt" };
  const values: Record<string, any> = { ":updatedAt": patch.updatedAt };
  const expr = ["#updatedAt = :updatedAt"];

  if (patch.name !== undefined) {
    names["#name"] = "name";
    values[":name"] = patch.name;
    expr.push("#name = :name");
  }
  if (patch.kind !== undefined) {
    names["#kind"] = "kind";
    values[":kind"] = patch.kind;
    expr.push("#kind = :kind");
  }
  if (patch.sortOrder !== undefined) {
    names["#sortOrder"] = "sortOrder";
    values[":sortOrder"] = patch.sortOrder;
    expr.push("#sortOrder = :sortOrder");
  }
  if (patch.archived !== undefined) {
    names["#archived"] = "archived";
    values[":archived"] = patch.archived;
    expr.push("#archived = :archived");
  }
  if (patch.significant !== undefined) {
    names["#significant"] = "significant";
    values[":significant"] = patch.significant;
    expr.push("#significant = :significant");
  }

  const r = await ddb.send(new UpdateCommand({
    TableName: TABLE(),
    Key: { PK: pkForUser(sub), SK: skForContext(contextId) },
    UpdateExpression: "SET " + expr.join(", "),
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
    ConditionExpression: "attribute_exists(PK) AND attribute_exists(SK)",
    ReturnValues: "ALL_NEW",
  }));
  return r.Attributes ? toExecutionContext(r.Attributes) : null;
}
