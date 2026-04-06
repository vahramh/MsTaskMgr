
import type { Task, UpdateTaskRequest, WorkflowState } from "@tm/shared";
import { deriveV2Defaults } from "./gtd";
import { getTask, getSubtask, listAllSubtasks, updateSubtask } from "./repo";

function effectiveState(task: Task): WorkflowState {
  return (task.state ?? deriveV2Defaults(task).state) as WorkflowState;
}

function effectiveEntityType(task: Task): "project" | "action" {
  return (task.entityType ?? deriveV2Defaults(task).entityType) as "project" | "action";
}

async function loadProjectTree(sub: string, rootProjectId: string): Promise<Task[]> {
  const out: Task[] = [];
  const queue: string[] = [rootProjectId];
  const seen = new Set<string>();

  while (queue.length) {
    const parentTaskId = queue.shift()!;
    if (seen.has(parentTaskId)) continue;
    seen.add(parentTaskId);

    const children = await listAllSubtasks(sub, parentTaskId);
    for (const child of children) {
      out.push(child);
      queue.push(child.taskId);
    }
  }

  return out;
}

function isBlockedMirror(waitingFor: string | undefined, blockerTitle: string): boolean {
  const note = (waitingFor ?? "").trim().toLowerCase();
  const title = blockerTitle.trim().toLowerCase();
  if (!note) return true;
  return (
    note === title ||
    note === `blocked by ${title}` ||
    note === `waiting for ${title}` ||
    note === `depends on ${title}`
  );
}

export async function validateStructuredDependencyForSubtask(args: {
  sub: string;
  parentTaskId: string;
  taskId: string;
  waitingForTaskId?: string;
}): Promise<{ ok: true; waitingForTaskTitle?: string; rootProjectId?: string } | { ok: false; message: string }> {
  const blockerId = (args.waitingForTaskId ?? "").trim();
  if (!blockerId) return { ok: true };

  const current = await getSubtask(args.sub, args.parentTaskId, args.taskId);
  if (!current) return { ok: false, message: "Subtask not found" };

  const rootProject = await getTask(args.sub, current.parentTaskId ?? args.parentTaskId);
  if (!rootProject || effectiveEntityType(rootProject) !== "project") {
    return { ok: false, message: "Structured blockers are currently limited to tasks within the same project" };
  }

  if (blockerId === current.taskId) return { ok: false, message: "A task cannot depend on itself" };

  const descendants = await loadProjectTree(args.sub, rootProject.taskId);
  const byId = new Map(descendants.map((task) => [task.taskId, task]));
  const blocker = byId.get(blockerId);
  if (!blocker) return { ok: false, message: "Blocker task must be in the same project" };
  if (effectiveEntityType(blocker) !== "action") return { ok: false, message: "Only action tasks can be blockers" };

  const blockerState = effectiveState(blocker);
  if (blockerState === "completed") return { ok: false, message: "Completed tasks cannot be blockers" };
  if (blockerState === "reference" || blockerState === "someday") {
    return { ok: false, message: "Reference and Someday tasks cannot be blockers" };
  }

  const currentDescendants = new Set<string>();
  const queue: string[] = [current.taskId];
  while (queue.length) {
    const parentId = queue.shift()!;
    for (const task of descendants) {
      if (task.parentTaskId === parentId && !currentDescendants.has(task.taskId)) {
        currentDescendants.add(task.taskId);
        queue.push(task.taskId);
      }
    }
  }
  if (currentDescendants.has(blockerId)) {
    return { ok: false, message: "A task cannot depend on one of its descendants" };
  }

  return { ok: true, waitingForTaskTitle: blocker.title, rootProjectId: rootProject.taskId };
}


export async function validateStructuredDependencyForCreate(args: {
  sub: string;
  parentTaskId: string;
  waitingForTaskId?: string;
}): Promise<{ ok: true; waitingForTaskTitle?: string; rootProjectId?: string } | { ok: false; message: string }> {
  const blockerId = (args.waitingForTaskId ?? "").trim();
  if (!blockerId) return { ok: true };

  const rootProject = await getTask(args.sub, args.parentTaskId);
  if (!rootProject || effectiveEntityType(rootProject) !== "project") {
    return { ok: false, message: "Structured blockers are currently limited to direct tasks within the same project" };
  }

  const descendants = await loadProjectTree(args.sub, rootProject.taskId);
  const blocker = descendants.find((task) => task.taskId === blockerId);
  if (!blocker) return { ok: false, message: "Blocker task must be in the same project" };
  if (effectiveEntityType(blocker) !== "action") return { ok: false, message: "Only action tasks can be blockers" };
  const blockerState = effectiveState(blocker);
  if (blockerState === "completed") return { ok: false, message: "Completed tasks cannot be blockers" };
  if (blockerState === "reference" || blockerState === "someday") {
    return { ok: false, message: "Reference and Someday tasks cannot be blockers" };
  }
  return { ok: true, waitingForTaskTitle: blocker.title, rootProjectId: rootProject.taskId };
}

export async function releaseDependentsBlockedBy(args: {
  sub: string;
  blockerTaskId: string;
  rootProjectId: string;
}): Promise<void> {
  const descendants = await loadProjectTree(args.sub, args.rootProjectId);
  const dependents = descendants.filter(
    (task) => effectiveState(task) === "waiting" && task.waitingForTaskId === args.blockerTaskId
  );
  if (!dependents.length) return;

  for (const task of dependents) {
    const resumeState = task.resumeStateAfterWait ?? "next";
    const blockerTitle = task.waitingForTaskTitle?.trim() || "";
    const patch: UpdateTaskRequest = {
      state: resumeState,
      waitingForTaskId: null,
      waitingForTaskTitle: null,
      resumeStateAfterWait: null,
      waitingFor: isBlockedMirror(task.waitingFor, blockerTitle) ? null : task.waitingFor ?? null,
    };
    await updateSubtask(args.sub, task.parentTaskId!, task.taskId, patch, new Date().toISOString());
  }
}


export async function releaseTasksBlockedByTask(sub: string, blockerTaskId: string, _now?: string): Promise<void> {
  const blocker = await getTask(sub, blockerTaskId);
  if (!blocker) return;

  const rootProjectId = blocker.parentTaskId?.trim();
  if (!rootProjectId) return;

  await releaseDependentsBlockedBy({
    sub,
    blockerTaskId,
    rootProjectId,
  });
}
