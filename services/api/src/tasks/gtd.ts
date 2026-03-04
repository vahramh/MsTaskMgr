import type { EntityType, Task, UpdateTaskRequest, WorkflowState } from "@tm/shared";

export function isWorkflowState(v: any): v is WorkflowState {
  return (
    v === "inbox" ||
    v === "next" ||
    v === "waiting" ||
    v === "scheduled" ||
    v === "someday" ||
    v === "reference" ||
    v === "completed"
  );
}

export function isEntityType(v: any): v is EntityType {
  return v === "project" || v === "action";
}

/**
 * Deterministic mapping for existing v1 records that only have {status,dueDate}.
 * Ensures migrated records never violate "inbox cannot have dueDate".
 */
export function deriveV2Defaults(t: Task): { schemaVersion: 2; entityType: EntityType; state: WorkflowState } {
  const entityType: EntityType = t.entityType ?? "action";

  let state: WorkflowState;
  if (t.state && isWorkflowState(t.state)) state = t.state;
  else if (t.status === "COMPLETED") state = "completed";
  else if (t.dueDate) state = "scheduled";
  else state = "inbox";

  return { schemaVersion: 2, entityType, state };
}

export function stateToStatus(state: WorkflowState): "OPEN" | "COMPLETED" {
  return state === "completed" ? "COMPLETED" : "OPEN";
}

export function canTransition(from: WorkflowState, to: WorkflowState): boolean {
  if (from === to) return true;
  if (from === "completed") return false;

  // Strict reference rule.
  if (from === "reference" && (to === "next" || to === "waiting" || to === "scheduled" || to === "completed")) {
    return false;
  }

  const allowed: Record<WorkflowState, WorkflowState[]> = {
    inbox: ["next", "waiting", "scheduled", "someday", "reference", "completed"],
    next: ["waiting", "scheduled", "someday", "inbox", "reference", "completed"],
    waiting: ["next", "scheduled", "someday", "inbox", "reference", "completed"],
    scheduled: ["next", "waiting", "someday", "inbox", "reference", "completed"],
    someday: ["next", "scheduled", "waiting", "inbox", "reference", "completed"],
    reference: ["inbox", "someday"],
    completed: [],
  };

  return allowed[from].includes(to);
}

export function mergeTaskPatch(current: Task, patch: UpdateTaskRequest): Task {
  const merged: Task = {
    ...current,
    title: patch.title !== undefined ? patch.title : current.title,
    description: patch.description !== undefined ? patch.description : current.description,

    dueDate: (patch as any).dueDate === undefined ? current.dueDate : ((patch as any).dueDate ?? undefined),
    priority: (patch as any).priority === undefined ? current.priority : ((patch as any).priority ?? undefined),
    effort: (patch as any).effort === undefined ? current.effort : ((patch as any).effort ?? undefined),
    attrs: (patch as any).attrs === undefined ? current.attrs : ((patch as any).attrs ?? undefined),

    context: (patch as any).context === undefined ? current.context : ((patch as any).context ?? undefined),
    waitingFor: (patch as any).waitingFor === undefined ? current.waitingFor : ((patch as any).waitingFor ?? undefined),

    entityType: patch.entityType !== undefined ? patch.entityType : current.entityType,
    state: patch.state !== undefined ? patch.state : current.state,

    schemaVersion: 2,
  };

  if (merged.state) merged.status = stateToStatus(merged.state);

  return merged;
}

export function validateMergedTask(task: Task): { ok: true } | { ok: false; message: string } {
  if (!task.state || !isWorkflowState(task.state)) return { ok: false, message: "Missing/invalid state" };
  if (!task.entityType || !isEntityType(task.entityType)) return { ok: false, message: "Missing/invalid entityType" };

  // Inbox cannot have due dates.
  if (task.state === "inbox" && task.dueDate) return { ok: false, message: "Inbox items cannot have dueDate" };

  // Scheduled requires dueDate.
  if (task.state === "scheduled" && !task.dueDate) return { ok: false, message: "Scheduled items must have dueDate" };

  // Waiting requires waitingFor.
  if (task.state === "waiting") {
    const wf = (task.waitingFor ?? "").trim();
    if (!wf) return { ok: false, message: "Waiting items must include waitingFor" };
    if (wf.length > 200) return { ok: false, message: "waitingFor too long (max 200 chars)" };
  }

  // Only actions can be next.
  if (task.state === "next" && task.entityType !== "action") {
    return { ok: false, message: "Only actions can be in 'next' state" };
  }

  // Phase 4 simplification: projects must be root.
  if (task.entityType === "project" && task.parentTaskId) {
    return { ok: false, message: "Projects must be root items (no parentTaskId)" };
  }

  // Context (simple string).
  if (task.context !== undefined) {
    const c = (task.context ?? "").trim();
    if (task.context && !c) return { ok: false, message: "context cannot be whitespace" };
    if (c.length > 40) return { ok: false, message: "context too long (max 40 chars)" };
  }

  return { ok: true };
}
