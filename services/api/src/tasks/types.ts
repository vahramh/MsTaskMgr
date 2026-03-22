import type {
  EffortEstimate,
  DurationEstimate,
  Task,
  TaskAttributes,
  TaskPriority,
  TaskStatus,
  EntityType,
  WorkflowState,
} from "@tm/shared";

export type TaskItem = Task & {
  PK: string;
  SK: string;
  GSI1PK?: string;
  GSI1SK?: string;
  GSI2PK?: string;
  GSI2SK?: string;
  rootTaskId?: string;
};

export function toTask(item: any): Task {
  return {
    taskId: item.taskId,
    parentTaskId: item.parentTaskId,
    title: item.title,
    description: item.description,
    status: item.status as TaskStatus,

    // Phase 4 (GTD)
    schemaVersion: item.schemaVersion,
    entityType: item.entityType as EntityType | undefined,
    state: item.state as WorkflowState | undefined,
    context: item.context,
    waitingFor: item.waitingFor,

    dueDate: item.dueDate,
    priority: item.priority as TaskPriority | undefined,
    effort: item.effort as EffortEstimate | undefined,
    estimatedMinutes: item.estimatedMinutes,
    remainingMinutes: item.remainingMinutes,
    timeSpentMinutes: item.timeSpentMinutes,
    minimumDuration: item.minimumDuration as DurationEstimate | undefined,
    attrs: item.attrs as TaskAttributes | undefined,

    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    rev: item.rev ?? 0,
  };
}

export class HasChildrenError extends Error {
  constructor(message = "Task has subtasks. Delete subtasks first.") {
    super(message);
    this.name = "HasChildrenError";
  }
}

export class ParentLookupMissingError extends Error {
  constructor(message = "Parent lookup missing. Data may need lookup backfill.") {
    super(message);
    this.name = "ParentLookupMissingError";
  }
}
