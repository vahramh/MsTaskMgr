import {
  BatchGetCommand,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import type { BucketTask, Task, TaskStatus, UpdateTaskRequest, WorkflowState } from "@tm/shared";
import { ddb, mustGetEnv } from "../lib/db";
import {
  gsi1pkForUser,
  gsi1skForCreated,
  gsi2pkForUserState,
  gsi2skForBucket,
  pkForUser,
  skForSubtask,
  skForTask,
} from "./keys";
import { toTask, HasChildrenError, ParentLookupMissingError, type TaskItem } from "./types";
import { getLookup, lookupItemForRoot, lookupItemForSubtask } from "./sharing";

const TABLE = () => mustGetEnv("TASKS_TABLE");
const GSI1 = () => mustGetEnv("TASKS_GSI1");
const GSI2 = () => mustGetEnv("TASKS_GSI2");

const EXECUTION_STATES: WorkflowState[] = [
  "inbox",
  "next",
  "waiting",
  "scheduled",
  "someday",
  "reference",
  "completed",
];

function isExecutionEligible(task: Pick<Task, "entityType" | "state">): boolean {
  return task.entityType === "action" && !!task.state;
}

function bucketIndexAttrs(sub: string, task: Pick<Task, "taskId" | "entityType" | "state" | "updatedAt">): Record<string, string> {
  if (!isExecutionEligible(task)) return {};
  return {
    GSI2PK: gsi2pkForUserState(sub, task.state!),
    GSI2SK: gsi2skForBucket(task.updatedAt, task.taskId),
  };
}

function withRootTaskId(task: Task, rootTaskId: string): TaskItem {
  return { ...(task as TaskItem), rootTaskId };
}

function asTaskItem(item: Record<string, any> | undefined | null): TaskItem | null {
  if (!item) return null;
  return item as TaskItem;
}

async function getTaskItemByKey(sub: string, sk: string): Promise<TaskItem | null> {
  const r = await ddb.send(
    new GetCommand({
      TableName: TABLE(),
      Key: { PK: pkForUser(sub), SK: sk },
    })
  );
  return asTaskItem(r.Item);
}

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

async function resolveRootTaskIdForSubtask(sub: string, parentTaskId: string, taskId: string, current?: TaskItem | null): Promise<string> {
  if (current?.rootTaskId) return current.rootTaskId;
  const lookup = await getLookup(sub, taskId);
  if (lookup?.rootTaskId) return lookup.rootTaskId;
  const parentLookup = await getLookup(sub, parentTaskId);
  if (parentLookup?.rootTaskId) return parentLookup.rootTaskId;
  throw new ParentLookupMissingError();
}

function applyPatchToIndexFields(current: TaskItem, patch: UpdateTaskRequest, nowIso: string, taskId: string, fallbackRootTaskId: string): TaskItem {
  return {
    ...current,
    taskId,
    updatedAt: nowIso,
    entityType: patch.entityType !== undefined ? patch.entityType : current.entityType,
    state: patch.state !== undefined ? patch.state : current.state,
    rootTaskId: current.rootTaskId ?? fallbackRootTaskId,
  } as TaskItem;
}

function buildRootItem(sub: string, task: Task): TaskItem {
  return {
    PK: pkForUser(sub),
    SK: skForTask(task.taskId),
    GSI1PK: gsi1pkForUser(sub),
    GSI1SK: gsi1skForCreated(task.createdAt, task.taskId),
    ...bucketIndexAttrs(sub, task),
    ...withRootTaskId(task, task.taskId),
  };
}

function buildSubtaskItem(sub: string, parentTaskId: string, rootTaskId: string, task: Task): TaskItem {
  return {
    PK: pkForUser(sub),
    SK: skForSubtask(parentTaskId, task.taskId),
    parentTaskId,
    ...bucketIndexAttrs(sub, task),
    ...withRootTaskId(task, rootTaskId),
  };
}

export async function createTask(sub: string, task: Task): Promise<Task> {
  const item = buildRootItem(sub, task);

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

export async function createProjectWithInitialAction(sub: string, project: Task, firstAction: Task): Promise<{ project: Task; firstAction: Task }> {
  const projectItem = buildRootItem(sub, project);
  const actionItem = buildSubtaskItem(sub, project.taskId, project.taskId, { ...firstAction, parentTaskId: project.taskId });

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
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
    })
  );

  const items = (r.Items ?? []).map(toTask);
  return { items, lastEvaluatedKey: r.LastEvaluatedKey };
}

export async function getTask(sub: string, taskId: string): Promise<Task | null> {
  const item = await getTaskItemByKey(sub, skForTask(taskId));
  return item ? toTask(item) : null;
}

export async function updateTask(
  sub: string,
  taskId: string,
  patch: UpdateTaskRequest,
  nowIso: string,
  statusOverride?: TaskStatus,
  expectedRev?: number
): Promise<Task | null> {
  const current = await getTaskItemByKey(sub, skForTask(taskId));
  if (!current) return null;
  const indexed = applyPatchToIndexFields(current, patch, nowIso, taskId, taskId);

  const expr: string[] = [];
  const remove: string[] = [];
  const names: Record<string, string> = { "#updatedAt": "updatedAt", "#rev": "rev" };
  const values: Record<string, any> = { ":updatedAt": nowIso, ":inc": 1, ":zero": 0 };

  expr.push("#updatedAt = :updatedAt");
  expr.push("#rev = if_not_exists(#rev, :zero) + :inc");

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
  if ((patch as any).estimatedMinutes !== undefined) {
    names["#estimatedMinutes"] = "estimatedMinutes";
    if ((patch as any).estimatedMinutes === null) remove.push("#estimatedMinutes");
    else {
      values[":estimatedMinutes"] = (patch as any).estimatedMinutes;
      expr.push("#estimatedMinutes = :estimatedMinutes");
    }
  }
  if ((patch as any).remainingMinutes !== undefined) {
    names["#remainingMinutes"] = "remainingMinutes";
    if ((patch as any).remainingMinutes === null) remove.push("#remainingMinutes");
    else {
      values[":remainingMinutes"] = (patch as any).remainingMinutes;
      expr.push("#remainingMinutes = :remainingMinutes");
    }
  }
  if ((patch as any).timeSpentMinutes !== undefined) {
    names["#timeSpentMinutes"] = "timeSpentMinutes";
    if ((patch as any).timeSpentMinutes === null) remove.push("#timeSpentMinutes");
    else {
      values[":timeSpentMinutes"] = (patch as any).timeSpentMinutes;
      expr.push("#timeSpentMinutes = :timeSpentMinutes");
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
  if ((patch as any).contextIds !== undefined) {
    names["#contextIds"] = "contextIds";
    if ((patch as any).contextIds === null || (Array.isArray((patch as any).contextIds) && (patch as any).contextIds.length === 0)) remove.push("#contextIds");
    else {
      values[":contextIds"] = (patch as any).contextIds;
      expr.push("#contextIds = :contextIds");
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
  if ((patch as any).waitingForTaskId !== undefined) {
    names["#waitingForTaskId"] = "waitingForTaskId";
    if ((patch as any).waitingForTaskId === null) remove.push("#waitingForTaskId");
    else {
      values[":waitingForTaskId"] = (patch as any).waitingForTaskId;
      expr.push("#waitingForTaskId = :waitingForTaskId");
    }
  }
  if ((patch as any).waitingForTaskTitle !== undefined) {
    names["#waitingForTaskTitle"] = "waitingForTaskTitle";
    if ((patch as any).waitingForTaskTitle === null) remove.push("#waitingForTaskTitle");
    else {
      values[":waitingForTaskTitle"] = (patch as any).waitingForTaskTitle;
      expr.push("#waitingForTaskTitle = :waitingForTaskTitle");
    }
  }
  if ((patch as any).resumeStateAfterWait !== undefined) {
    names["#resumeStateAfterWait"] = "resumeStateAfterWait";
    if ((patch as any).resumeStateAfterWait === null) remove.push("#resumeStateAfterWait");
    else {
      values[":resumeStateAfterWait"] = (patch as any).resumeStateAfterWait;
      expr.push("#resumeStateAfterWait = :resumeStateAfterWait");
    }
  }

  const desiredStatus = statusOverride ?? patch.status;
  if (desiredStatus !== undefined) {
    names["#status"] = "status";
    values[":status"] = desiredStatus;
    expr.push("#status = :status");
  }

  names["#rootTaskId"] = "rootTaskId";
  values[":rootTaskId"] = indexed.rootTaskId;
  expr.push("#rootTaskId = :rootTaskId");

  const bucketAttrs = bucketIndexAttrs(sub, indexed);
  names["#gsi2pk"] = "GSI2PK";
  names["#gsi2sk"] = "GSI2SK";
  if (bucketAttrs.GSI2PK && bucketAttrs.GSI2SK) {
    values[":gsi2pk"] = bucketAttrs.GSI2PK;
    values[":gsi2sk"] = bucketAttrs.GSI2SK;
    expr.push("#gsi2pk = :gsi2pk");
    expr.push("#gsi2sk = :gsi2sk");
  } else {
    remove.push("#gsi2pk", "#gsi2sk");
  }

  let condition = "attribute_exists(PK) AND attribute_exists(SK)";
  if (expectedRev !== undefined) {
    condition += " AND ((attribute_not_exists(#rev) AND :expectedRev = :zero) OR #rev = :expectedRev)";
    values[":expectedRev"] = expectedRev;
  }

  const r = await ddb.send(
    new UpdateCommand({
      TableName: TABLE(),
      Key: { PK: pkForUser(sub), SK: skForTask(taskId) },
      UpdateExpression: "SET " + expr.join(", ") + (remove.length ? " REMOVE " + Array.from(new Set(remove)).join(", ") : ""),
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ConditionExpression: condition,
      ReturnValues: "ALL_NEW",
    })
  );

  return r.Attributes ? toTask(r.Attributes) : null;
}

export async function deleteTask(sub: string, taskId: string): Promise<boolean> {
  if (await hasChildren(sub, taskId)) throw new HasChildrenError();

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
          },
        },
      ],
    })
  );
  return true;
}

export async function createSubtask(sub: string, parentTaskId: string, task: Task): Promise<Task> {
  const parentLookup = await getLookup(sub, parentTaskId);
  if (!parentLookup) throw new ParentLookupMissingError();
  const rootTaskId = parentLookup.rootTaskId;
  const item = buildSubtaskItem(sub, parentTaskId, rootTaskId, { ...task, parentTaskId });

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
  const item = await getTaskItemByKey(sub, skForSubtask(parentTaskId, taskId));
  return item ? toTask(item) : null;
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
  const current = await getTaskItemByKey(sub, skForSubtask(parentTaskId, taskId));
  if (!current) return null;
  const rootTaskId = await resolveRootTaskIdForSubtask(sub, parentTaskId, taskId, current);
  const indexed = applyPatchToIndexFields(current, patch, nowIso, taskId, rootTaskId);

  const expr: string[] = [];
  const remove: string[] = [];
  const names: Record<string, string> = { "#updatedAt": "updatedAt", "#rev": "rev" };
  const values: Record<string, any> = { ":updatedAt": nowIso, ":inc": 1, ":zero": 0 };

  expr.push("#updatedAt = :updatedAt");
  expr.push("#rev = if_not_exists(#rev, :zero) + :inc");

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
  if ((patch as any).estimatedMinutes !== undefined) {
    names["#estimatedMinutes"] = "estimatedMinutes";
    if ((patch as any).estimatedMinutes === null) remove.push("#estimatedMinutes");
    else {
      values[":estimatedMinutes"] = (patch as any).estimatedMinutes;
      expr.push("#estimatedMinutes = :estimatedMinutes");
    }
  }
  if ((patch as any).remainingMinutes !== undefined) {
    names["#remainingMinutes"] = "remainingMinutes";
    if ((patch as any).remainingMinutes === null) remove.push("#remainingMinutes");
    else {
      values[":remainingMinutes"] = (patch as any).remainingMinutes;
      expr.push("#remainingMinutes = :remainingMinutes");
    }
  }
  if ((patch as any).timeSpentMinutes !== undefined) {
    names["#timeSpentMinutes"] = "timeSpentMinutes";
    if ((patch as any).timeSpentMinutes === null) remove.push("#timeSpentMinutes");
    else {
      values[":timeSpentMinutes"] = (patch as any).timeSpentMinutes;
      expr.push("#timeSpentMinutes = :timeSpentMinutes");
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
  if ((patch as any).contextIds !== undefined) {
    names["#contextIds"] = "contextIds";
    if ((patch as any).contextIds === null || (Array.isArray((patch as any).contextIds) && (patch as any).contextIds.length === 0)) remove.push("#contextIds");
    else {
      values[":contextIds"] = (patch as any).contextIds;
      expr.push("#contextIds = :contextIds");
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
  if ((patch as any).waitingForTaskId !== undefined) {
    names["#waitingForTaskId"] = "waitingForTaskId";
    if ((patch as any).waitingForTaskId === null) remove.push("#waitingForTaskId");
    else {
      values[":waitingForTaskId"] = (patch as any).waitingForTaskId;
      expr.push("#waitingForTaskId = :waitingForTaskId");
    }
  }
  if ((patch as any).waitingForTaskTitle !== undefined) {
    names["#waitingForTaskTitle"] = "waitingForTaskTitle";
    if ((patch as any).waitingForTaskTitle === null) remove.push("#waitingForTaskTitle");
    else {
      values[":waitingForTaskTitle"] = (patch as any).waitingForTaskTitle;
      expr.push("#waitingForTaskTitle = :waitingForTaskTitle");
    }
  }
  if ((patch as any).resumeStateAfterWait !== undefined) {
    names["#resumeStateAfterWait"] = "resumeStateAfterWait";
    if ((patch as any).resumeStateAfterWait === null) remove.push("#resumeStateAfterWait");
    else {
      values[":resumeStateAfterWait"] = (patch as any).resumeStateAfterWait;
      expr.push("#resumeStateAfterWait = :resumeStateAfterWait");
    }
  }

  const desiredStatus = statusOverride ?? patch.status;
  if (desiredStatus !== undefined) {
    names["#status"] = "status";
    values[":status"] = desiredStatus;
    expr.push("#status = :status");
  }

  names["#rootTaskId"] = "rootTaskId";
  values[":rootTaskId"] = indexed.rootTaskId;
  expr.push("#rootTaskId = :rootTaskId");

  const bucketAttrs = bucketIndexAttrs(sub, indexed);
  names["#gsi2pk"] = "GSI2PK";
  names["#gsi2sk"] = "GSI2SK";
  if (bucketAttrs.GSI2PK && bucketAttrs.GSI2SK) {
    values[":gsi2pk"] = bucketAttrs.GSI2PK;
    values[":gsi2sk"] = bucketAttrs.GSI2SK;
    expr.push("#gsi2pk = :gsi2pk");
    expr.push("#gsi2sk = :gsi2sk");
  } else {
    remove.push("#gsi2pk", "#gsi2sk");
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
      UpdateExpression: "SET " + expr.join(", ") + (remove.length ? " REMOVE " + Array.from(new Set(remove)).join(", ") : ""),
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ConditionExpression: condition,
      ReturnValues: "ALL_NEW",
    })
  );

  return r.Attributes ? toTask(r.Attributes) : null;
}

export async function deleteSubtask(sub: string, parentTaskId: string, taskId: string): Promise<boolean> {
  if (await hasChildren(sub, taskId)) throw new HasChildrenError();

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

export async function listBucketTasksByState(
  sub: string,
  state: WorkflowState,
  limit: number,
  exclusiveStartKey?: any
): Promise<{ items: BucketTask[]; lastEvaluatedKey?: any }> {
  const r = await ddb.send(
    new QueryCommand({
      TableName: TABLE(),
      IndexName: GSI2(),
      KeyConditionExpression: "GSI2PK = :pk",
      ExpressionAttributeValues: { ":pk": gsi2pkForUserState(sub, state) },
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
    })
  );

  const rawItems = (r.Items ?? []) as TaskItem[];
  const rootIds = Array.from(
    new Set(
      rawItems
        .map((item) => item.rootTaskId)
        .filter((value): value is string => typeof value === "string" && value.length > 0)
    )
  );

  const rootMap = new Map<string, Task>();
  for (let i = 0; i < rootIds.length; i += 100) {
    const chunk = rootIds.slice(i, i + 100);
    const resp = await ddb.send(
      new BatchGetCommand({
        RequestItems: {
          [TABLE()]: {
            Keys: chunk.map((rootTaskId) => ({ PK: pkForUser(sub), SK: skForTask(rootTaskId) })),
          },
        },
      })
    );
    for (const item of (resp.Responses?.[TABLE()] ?? []) as any[]) {
      rootMap.set(item.taskId, toTask(item));
    }
  }

  const items: BucketTask[] = rawItems.map((item) => {
    const task = toTask(item);
    const rootTaskId = item.rootTaskId;
    const root = rootTaskId ? rootMap.get(rootTaskId) : undefined;
    return {
      ...task,
      rootTaskId,
      project: root && root.entityType === "project" ? { taskId: root.taskId, title: root.title } : undefined,
    };
  });

  return { items, lastEvaluatedKey: r.LastEvaluatedKey };
}

export async function getBucketCounts(sub: string): Promise<Record<WorkflowState, number>> {
  const counts = await Promise.all(
    EXECUTION_STATES.map(async (state) => {
      const r = await ddb.send(
        new QueryCommand({
          TableName: TABLE(),
          IndexName: GSI2(),
          KeyConditionExpression: "GSI2PK = :pk",
          ExpressionAttributeValues: { ":pk": gsi2pkForUserState(sub, state) },
          Select: "COUNT",
        })
      );
      return [state, r.Count ?? 0] as const;
    })
  );

  return Object.fromEntries(counts) as Record<WorkflowState, number>;
}
