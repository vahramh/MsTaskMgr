import { PutCommand, QueryCommand, UpdateCommand, DeleteCommand, GetCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, mustGetEnv } from "../lib/db";
import { pkForUser, skForTask, skForSubtask, gsi1pkForUser, gsi1skForCreated } from "./keys";
import type { Task, TaskStatus, UpdateTaskRequest } from "@tm/shared";
import { toTask, HasChildrenError, ParentLookupMissingError } from "./types";
import { getLookup, lookupItemForRoot, lookupItemForSubtask } from "./sharing";

const TABLE = () => mustGetEnv("TASKS_TABLE");
const GSI1 = () => mustGetEnv("TASKS_GSI1");

async function hasChildren(sub: string, parentTaskId: string): Promise<boolean> {
  const prefix = `SUBTASK#${parentTaskId}#`;
  const r = await ddb.send(
    new QueryCommand({
      TableName: TABLE(),
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: { ":pk": pkForUser(sub), ":prefix": prefix },
      Limit: 1,
    })
  );
  return (r.Items?.length ?? 0) > 0;
}

export async function createTask(sub: string, task: Task): Promise<Task> {
  const item = {
    PK: pkForUser(sub),
    SK: skForTask(task.taskId),
    GSI1PK: gsi1pkForUser(sub),
    GSI1SK: gsi1skForCreated(task.createdAt, task.taskId),
    ...task,
  };

  // Keep task + lookup creation atomic.
  await ddb.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: TABLE(),
            Item: item,
            ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)",
          },
        },
        {
          Put: {
            TableName: TABLE(),
            Item: lookupItemForRoot(sub, task.taskId),
            ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)",
          },
        },
      ],
    })
  );

  return task;
}

/**
 * Phase 4 (GTD): Create a project root and a mandatory initial child action atomically.
 * This supports the invariant: projects must contain at least one action.
 */
export async function createProjectWithInitialAction(sub: string, project: Task, firstAction: Task): Promise<{ project: Task; firstAction: Task }> {
  const projectItem = {
    PK: pkForUser(sub),
    SK: skForTask(project.taskId),
    GSI1PK: gsi1pkForUser(sub),
    GSI1SK: gsi1skForCreated(project.createdAt, project.taskId),
    ...project,
  };

  const actionItem = {
    PK: pkForUser(sub),
    SK: skForSubtask(project.taskId, firstAction.taskId),
    parentTaskId: project.taskId,
    ...firstAction,
  };

  await ddb.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: TABLE(),
            Item: projectItem,
            ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)",
          },
        },
        {
          Put: {
            TableName: TABLE(),
            Item: lookupItemForRoot(sub, project.taskId),
            ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)",
          },
        },
        {
          Put: {
            TableName: TABLE(),
            Item: actionItem,
            ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)",
          },
        },
        {
          Put: {
            TableName: TABLE(),
            Item: lookupItemForSubtask(sub, project.taskId, project.taskId, firstAction.taskId),
            ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)",
          },
        },
      ],
    })
  );

  return { project, firstAction };
}

export async function listTasksByCreatedAt(
  sub: string,
  limit: number,
  exclusiveStartKey?: any
): Promise<{ items: Task[]; lastEvaluatedKey?: any }> {
  const r = await ddb.send(
    new QueryCommand({
      TableName: TABLE(),
      IndexName: GSI1(),
      KeyConditionExpression: "GSI1PK = :pk",
      ExpressionAttributeValues: { ":pk": gsi1pkForUser(sub) },
      ScanIndexForward: false, // newest first (by createdAt)
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
    })
  );

  const items = (r.Items ?? []).map(toTask);
  return { items, lastEvaluatedKey: r.LastEvaluatedKey };
}

export async function getTask(sub: string, taskId: string): Promise<Task | null> {
  const r = await ddb.send(
    new GetCommand({
      TableName: TABLE(),
      Key: { PK: pkForUser(sub), SK: skForTask(taskId) },
    })
  );
  return r.Item ? toTask(r.Item) : null;
}

export async function updateTask(
  sub: string,
  taskId: string,
  patch: UpdateTaskRequest,
  nowIso: string,
  statusOverride?: TaskStatus,
  expectedRev?: number
): Promise<Task | null> {
  const expr: string[] = [];
  const remove: string[] = [];
  const names: Record<string, string> = { "#updatedAt": "updatedAt", "#rev": "rev" };
  const values: Record<string, any> = { ":updatedAt": nowIso, ":inc": 1 };

  expr.push("#updatedAt = :updatedAt");
  expr.push("#rev = if_not_exists(#rev, :zero) + :inc");
  values[":zero"] = 0;

  if (patch.title !== undefined) {
    names["#title"] = "title";
    values[":title"] = patch.title;
    expr.push("#title = :title");
  }
  if (patch.description !== undefined) {
    names["#description"] = "description";
    values[":description"] = patch.description;
    expr.push("#description = :description");
  }
  if ((patch as any).dueDate !== undefined) {
    names["#dueDate"] = "dueDate";
    if ((patch as any).dueDate === null) remove.push("#dueDate");
    else {
      values[":dueDate"] = (patch as any).dueDate;
      expr.push("#dueDate = :dueDate");
    }
  }

  if ((patch as any).priority !== undefined) {
    names["#priority"] = "priority";
    if ((patch as any).priority === null) remove.push("#priority");
    else {
      values[":priority"] = (patch as any).priority;
      expr.push("#priority = :priority");
    }
  }

  if ((patch as any).effort !== undefined) {
    names["#effort"] = "effort";
    if ((patch as any).effort === null) remove.push("#effort");
    else {
      values[":effort"] = (patch as any).effort;
      expr.push("#effort = :effort");
    }
  }

  if ((patch as any).minimumDuration !== undefined) {
    names["#minimumDuration"] = "minimumDuration";
    if ((patch as any).minimumDuration === null) remove.push("#minimumDuration");
    else {
      values[":minimumDuration"] = (patch as any).minimumDuration;
      expr.push("#minimumDuration = :minimumDuration");
    }
  }

  if ((patch as any).attrs !== undefined) {
    names["#attrs"] = "attrs";
    if ((patch as any).attrs === null) remove.push("#attrs");
    else {
      values[":attrs"] = (patch as any).attrs;
      expr.push("#attrs = :attrs");
    }
  }


  // Phase 4 (GTD)
  if ((patch as any).schemaVersion !== undefined) {
    names["#schemaVersion"] = "schemaVersion";
    values[":schemaVersion"] = (patch as any).schemaVersion;
    expr.push("#schemaVersion = :schemaVersion");
  }

  if ((patch as any).entityType !== undefined) {
    names["#entityType"] = "entityType";
    values[":entityType"] = (patch as any).entityType;
    expr.push("#entityType = :entityType");
  }

  if ((patch as any).state !== undefined) {
    names["#state"] = "state";
    values[":state"] = (patch as any).state;
    expr.push("#state = :state");
  }

  if ((patch as any).context !== undefined) {
    names["#context"] = "context";
    if ((patch as any).context === null) remove.push("#context");
    else {
      values[":context"] = (patch as any).context;
      expr.push("#context = :context");
    }
  }

  if ((patch as any).waitingFor !== undefined) {
    names["#waitingFor"] = "waitingFor";
    if ((patch as any).waitingFor === null) remove.push("#waitingFor");
    else {
      values[":waitingFor"] = (patch as any).waitingFor;
      expr.push("#waitingFor = :waitingFor");
    }
  }

  const desiredStatus = statusOverride ?? patch.status;
  if (desiredStatus !== undefined) {
    names["#status"] = "status";
    values[":status"] = desiredStatus;
    expr.push("#status = :status");
  }

  // Base condition: item exists.
  let condition = "attribute_exists(PK) AND attribute_exists(SK)";
  if (expectedRev !== undefined) {
    // Treat missing rev as 0 for first-write compatibility.
    // DynamoDB doesn't support if_not_exists() in ConditionExpression, so we use OR.
    condition += " AND ((attribute_not_exists(#rev) AND :expectedRev = :zero) OR #rev = :expectedRev)";
    values[":expectedRev"] = expectedRev;
  }

  const r = await ddb.send(
    new UpdateCommand({
      TableName: TABLE(),
      Key: { PK: pkForUser(sub), SK: skForTask(taskId) },
      UpdateExpression: "SET " + expr.join(", ") + (remove.length ? " REMOVE " + remove.join(", ") : ""),
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ConditionExpression: condition,
      ReturnValues: "ALL_NEW",
    })
  );

  return r.Attributes ? toTask(r.Attributes) : null;
}

export async function deleteTask(sub: string, taskId: string): Promise<boolean> {
  if (await hasChildren(sub, taskId)) {
    throw new HasChildrenError();
  }

  // Delete task + lookup atomically.
  await ddb.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Delete: {
            TableName: TABLE(),
            Key: { PK: pkForUser(sub), SK: skForTask(taskId) },
            ConditionExpression: "attribute_exists(PK) AND attribute_exists(SK)",
          },
        },
        {
          Delete: {
            TableName: TABLE(),
            Key: { PK: pkForUser(sub), SK: `LOOKUP#${taskId}` },
            // Lookup may be missing for pre-phase3 data; tolerate.
          },
        },
      ],
    })
  );
  return true;
}

// ----------------------------------------------------------------------
// Phase 2: Subtasks (tree model)

export async function createSubtask(sub: string, parentTaskId: string, task: Task): Promise<Task> {
  // Phase 3 requires secure subtree membership; we store rootTaskId in LOOKUP items.
  // To compute it without changing the Task/Subtask item key scheme, we require a parent lookup.
  const parentLookup = await getLookup(sub, parentTaskId);
  if (!parentLookup) {
    throw new ParentLookupMissingError();
  }
  const rootTaskId = parentLookup.rootTaskId;

  const item = {
    PK: pkForUser(sub),
    SK: skForSubtask(parentTaskId, task.taskId),
    parentTaskId,
    ...task,
  };

  await ddb.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: TABLE(),
            Item: item,
            ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)",
          },
        },
        {
          Put: {
            TableName: TABLE(),
            Item: lookupItemForSubtask(sub, rootTaskId, parentTaskId, task.taskId),
            ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)",
          },
        },
      ],
    })
  );

  return task;
}

export async function listSubtasks(
  sub: string,
  parentTaskId: string,
  limit: number,
  exclusiveStartKey?: { PK: string; SK: string }
): Promise<{ items: Task[]; lastEvaluatedKey?: { PK: string; SK: string } }> {
  const r = await ddb.send(
    new QueryCommand({
      TableName: TABLE(),
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
      ExpressionAttributeValues: {
        ":pk": pkForUser(sub),
        ":skPrefix": `SUBTASK#${parentTaskId}#`,
      },
      ScanIndexForward: true,
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
    })
  );

  const items = (r.Items ?? []).map(toTask);
  const lek = r.LastEvaluatedKey as any;
  const lastEvaluatedKey =
    lek && typeof lek.PK === "string" && typeof lek.SK === "string" ? ({ PK: lek.PK, SK: lek.SK } as const) : undefined;

  return { items, lastEvaluatedKey };
}

/**
 * Convenience helper for domain validation that needs the full child set.
 * Uses listSubtasks paging internally.
 */
export async function listAllSubtasks(sub: string, parentTaskId: string, pageSize = 200): Promise<Task[]> {
  const out: Task[] = [];
  let lek: { PK: string; SK: string } | undefined = undefined;
  while (true) {
    const r = await listSubtasks(sub, parentTaskId, pageSize, lek);
    out.push(...r.items);
    if (!r.lastEvaluatedKey) break;
    lek = r.lastEvaluatedKey;
  }
  return out;
}


export async function getSubtask(sub: string, parentTaskId: string, taskId: string): Promise<Task | null> {
  const r = await ddb.send(
    new GetCommand({
      TableName: TABLE(),
      Key: { PK: pkForUser(sub), SK: skForSubtask(parentTaskId, taskId) },
    })
  );
  return r.Item ? toTask(r.Item) : null;
}

export async function updateSubtask(
  sub: string,
  parentTaskId: string,
  taskId: string,
  patch: UpdateTaskRequest,
  nowIso: string,
  statusOverride?: TaskStatus,
  expectedRev?: number
): Promise<Task | null> {
  // Reuse the same update semantics as root tasks, but with a different key.
  const expr: string[] = [];
  const remove: string[] = [];
  const names: Record<string, string> = { "#updatedAt": "updatedAt", "#rev": "rev" };
  const values: Record<string, any> = { ":updatedAt": nowIso, ":inc": 1 };

  expr.push("#updatedAt = :updatedAt");
  expr.push("#rev = if_not_exists(#rev, :zero) + :inc");
  values[":zero"] = 0;

  if (patch.title !== undefined) {
    names["#title"] = "title";
    values[":title"] = patch.title;
    expr.push("#title = :title");
  }
  if (patch.description !== undefined) {
    names["#description"] = "description";
    values[":description"] = patch.description;
    expr.push("#description = :description");
  }
  if ((patch as any).dueDate !== undefined) {
    names["#dueDate"] = "dueDate";
    if ((patch as any).dueDate === null) remove.push("#dueDate");
    else {
      values[":dueDate"] = (patch as any).dueDate;
      expr.push("#dueDate = :dueDate");
    }
  }

  if ((patch as any).priority !== undefined) {
    names["#priority"] = "priority";
    if ((patch as any).priority === null) remove.push("#priority");
    else {
      values[":priority"] = (patch as any).priority;
      expr.push("#priority = :priority");
    }
  }

  if ((patch as any).effort !== undefined) {
    names["#effort"] = "effort";
    if ((patch as any).effort === null) remove.push("#effort");
    else {
      values[":effort"] = (patch as any).effort;
      expr.push("#effort = :effort");
    }
  }

  if ((patch as any).minimumDuration !== undefined) {
    names["#minimumDuration"] = "minimumDuration";
    if ((patch as any).minimumDuration === null) remove.push("#minimumDuration");
    else {
      values[":minimumDuration"] = (patch as any).minimumDuration;
      expr.push("#minimumDuration = :minimumDuration");
    }
  }

  if ((patch as any).attrs !== undefined) {
    names["#attrs"] = "attrs";
    if ((patch as any).attrs === null) remove.push("#attrs");
    else {
      values[":attrs"] = (patch as any).attrs;
      expr.push("#attrs = :attrs");
    }
  }


  // Phase 4 (GTD)
  if ((patch as any).schemaVersion !== undefined) {
    names["#schemaVersion"] = "schemaVersion";
    values[":schemaVersion"] = (patch as any).schemaVersion;
    expr.push("#schemaVersion = :schemaVersion");
  }

  if ((patch as any).entityType !== undefined) {
    names["#entityType"] = "entityType";
    values[":entityType"] = (patch as any).entityType;
    expr.push("#entityType = :entityType");
  }

  if ((patch as any).state !== undefined) {
    names["#state"] = "state";
    values[":state"] = (patch as any).state;
    expr.push("#state = :state");
  }

  if ((patch as any).context !== undefined) {
    names["#context"] = "context";
    if ((patch as any).context === null) remove.push("#context");
    else {
      values[":context"] = (patch as any).context;
      expr.push("#context = :context");
    }
  }

  if ((patch as any).waitingFor !== undefined) {
    names["#waitingFor"] = "waitingFor";
    if ((patch as any).waitingFor === null) remove.push("#waitingFor");
    else {
      values[":waitingFor"] = (patch as any).waitingFor;
      expr.push("#waitingFor = :waitingFor");
    }
  }

  const desiredStatus = statusOverride ?? patch.status;
  if (desiredStatus !== undefined) {
    names["#status"] = "status";
    values[":status"] = desiredStatus;
    expr.push("#status = :status");
  }

  let condition = "attribute_exists(PK) AND attribute_exists(SK)";
  if (expectedRev !== undefined) {
    condition += " AND ((attribute_not_exists(#rev) AND :expectedRev = :zero) OR #rev = :expectedRev)";
    values[":expectedRev"] = expectedRev;
  }

  const r = await ddb.send(
    new UpdateCommand({
      TableName: TABLE(),
      Key: { PK: pkForUser(sub), SK: skForSubtask(parentTaskId, taskId) },
      UpdateExpression: "SET " + expr.join(", ") + (remove.length ? " REMOVE " + remove.join(", ") : ""),
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ConditionExpression: condition,
      ReturnValues: "ALL_NEW",
    })
  );

  return r.Attributes ? toTask(r.Attributes) : null;
}

export async function deleteSubtask(sub: string, parentTaskId: string, taskId: string): Promise<boolean> {
  if (await hasChildren(sub, taskId)) {
    throw new HasChildrenError();
  }

  await ddb.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Delete: {
            TableName: TABLE(),
            Key: { PK: pkForUser(sub), SK: skForSubtask(parentTaskId, taskId) },
            ConditionExpression: "attribute_exists(PK) AND attribute_exists(SK)",
          },
        },
        {
          Delete: {
            TableName: TABLE(),
            Key: { PK: pkForUser(sub), SK: `LOOKUP#${taskId}` },
          },
        },
      ],
    })
  );
  return true;
}
