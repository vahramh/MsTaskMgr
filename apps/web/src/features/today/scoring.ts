import type { EffortEstimate, Task, TaskPriority } from "@tm/shared";

export type TodayTask = Task & {
  source?: "owned" | "shared";
  sharedMeta?: {
    ownerSub: string;
    rootTaskId: string;
    mode: "VIEW" | "EDIT";
  };
};

export type TodayFilter = "all" | "quick" | "deep" | "dueSoon";

export type ProjectHealthIssue = {
  project: TodayTask;
  issues: Array<"noNext" | "onlySomeday" | "stalledWaiting">;
  nextActions: number;
  stalledWaiting: number;
  openActions: number;
};

export const TODAY_CONSTANTS = {
  PRIORITY_WEIGHT: {
    1: 10,
    2: 30,
    3: 60,
    4: 85,
    5: 110,
  } as Record<TaskPriority, number>,

  DUE_OVERDUE: 120,
  DUE_TODAY: 90,
  DUE_SOON: 50,

  STALE_DAYS: 7,
  WAITING_FOLLOWUP_DAYS: 7,
  CONTEXT_BONUS: 8,
  MAX_RECOMMENDED: 7,
};

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86400000);
}

export function daysFromToday(dateIso: string, now: Date): number {
  const due = startOfDay(new Date(dateIso));
  const today = startOfDay(now);
  return daysBetween(today, due);
}

function dueScore(task: Task, now: Date) {
  if (!task.dueDate) return 0;

  const diff = daysFromToday(task.dueDate, now);

  if (diff < 0) return TODAY_CONSTANTS.DUE_OVERDUE;
  if (diff === 0) return TODAY_CONSTANTS.DUE_TODAY;
  if (diff <= 3) return TODAY_CONSTANTS.DUE_SOON;

  return 0;
}

function priorityScore(task: Task) {
  if (!task.priority) return 0;
  return TODAY_CONSTANTS.PRIORITY_WEIGHT[task.priority] ?? 0;
}

function ageDays(task: Task, now: Date): number {
  const updated = new Date(task.updatedAt || task.createdAt);
  return Math.max(0, Math.floor((now.getTime() - updated.getTime()) / 86400000));
}

function stalenessScore(task: Task, now: Date) {
  const days = ageDays(task, now);

  if (days >= 60) return 40;
  if (days >= 30) return 28;
  if (days >= 14) return 18;
  if (days >= TODAY_CONSTANTS.STALE_DAYS) return 10;

  return 0;
}

export function effortToMinutes(effort?: EffortEstimate): number | null {
  if (!effort) return null;
  if (!Number.isFinite(effort.value) || effort.value <= 0) return null;
  if (effort.unit === "hours") return Math.round(effort.value * 60);
  return Math.round(effort.value * 8 * 60);
}

function effortScore(task: Task) {
  const minutes = effortToMinutes(task.effort);
  if (minutes === null) return 0;
  if (minutes <= 15) return 24;
  if (minutes <= 60) return 12;
  if (minutes <= 180) return 0;
  if (minutes <= 480) return -10;
  return -22;
}

function contextScore(task: Task) {
  return task.context?.trim() ? TODAY_CONSTANTS.CONTEXT_BONUS : 0;
}

function workflowScore(task: Task) {
  switch (task.state) {
    case "next":
      return 40;
    case "waiting":
      return 10;
    case "scheduled":
      return 5;
    case "someday":
      return -30;
    case "reference":
      return -100;
    case "completed":
      return -1000;
    case "inbox":
    default:
      return 0;
  }
}

export function scoreTask(task: Task, now: Date): number {
  let score = 0;

  score += priorityScore(task);
  score += dueScore(task, now);
  score += stalenessScore(task, now);
  score += workflowScore(task);
  score += effortScore(task);
  score += contextScore(task);

  return score;
}

export function rankTasks(tasks: TodayTask[], now: Date): TodayTask[] {
  return [...tasks]
    .map((task) => ({
      task,
      score: scoreTask(task, now),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(a.task.updatedAt).getTime() - new Date(b.task.updatedAt).getTime();
    })
    .map((x) => x.task);
}

export function isWaitingFollowUp(task: Task, now: Date): boolean {
  if (task.state !== "waiting") return false;
  return ageDays(task, now) >= TODAY_CONSTANTS.WAITING_FOLLOWUP_DAYS;
}

export function isDueToday(task: Task, now: Date): boolean {
  if (!task.dueDate) return false;
  return daysFromToday(task.dueDate, now) === 0;
}

export function isOverdue(task: Task, now: Date): boolean {
  if (!task.dueDate) return false;
  return daysFromToday(task.dueDate, now) < 0;
}

export function isDueSoon(task: Task, now: Date): boolean {
  if (!task.dueDate) return false;
  const diff = daysFromToday(task.dueDate, now);
  return diff >= 0 && diff <= 3;
}

export function isQuickWin(task: Task): boolean {
  const minutes = effortToMinutes(task.effort);
  return minutes !== null && minutes <= 15;
}

export function isDeepWork(task: Task): boolean {
  const minutes = effortToMinutes(task.effort);
  return minutes !== null && minutes > 60;
}

export function applyTaskFilter(tasks: TodayTask[], filter: TodayFilter, now: Date): TodayTask[] {
  switch (filter) {
    case "quick":
      return tasks.filter(isQuickWin);
    case "deep":
      return tasks.filter(isDeepWork);
    case "dueSoon":
      return tasks.filter((task) => isDueSoon(task, now) || isDueToday(task, now) || isOverdue(task, now));
    case "all":
    default:
      return tasks;
  }
}

function buildChildrenMap(tasks: TodayTask[]): Map<string, TodayTask[]> {
  const map = new Map<string, TodayTask[]>();
  for (const task of tasks) {
    if (!task.parentTaskId) continue;
    const list = map.get(task.parentTaskId) ?? [];
    list.push(task);
    map.set(task.parentTaskId, list);
  }
  return map;
}

function collectDescendants(rootId: string, childrenMap: Map<string, TodayTask[]>): TodayTask[] {
  const result: TodayTask[] = [];
  const stack = [...(childrenMap.get(rootId) ?? [])];

  while (stack.length) {
    const current = stack.pop()!;
    result.push(current);
    const children = childrenMap.get(current.taskId);
    if (children?.length) stack.push(...children);
  }

  return result;
}

export function buildProjectHealth(tasks: TodayTask[], now: Date): ProjectHealthIssue[] {
  const childrenMap = buildChildrenMap(tasks);
  const projects = tasks.filter((task) => task.entityType === "project" && !task.parentTaskId && task.state !== "completed");

  return projects
    .map((project) => {
      const descendants = collectDescendants(project.taskId, childrenMap);
      const openDescendants = descendants.filter((task) => task.state !== "completed" && task.state !== "reference");
      const openActions = openDescendants.filter((task) => task.entityType !== "project");
      const nextActions = openActions.filter((task) => task.state === "next");
      const somedayActions = openActions.filter((task) => task.state === "someday");
      const stalledWaiting = openActions.filter((task) => isWaitingFollowUp(task, now));

      const issues: ProjectHealthIssue["issues"] = [];
      if (nextActions.length === 0) issues.push("noNext");
      if (openActions.length > 0 && somedayActions.length === openActions.length) issues.push("onlySomeday");
      if (stalledWaiting.length > 0) issues.push("stalledWaiting");

      return {
        project,
        issues,
        nextActions: nextActions.length,
        stalledWaiting: stalledWaiting.length,
        openActions: openActions.length,
      };
    })
    .filter((item) => item.issues.length > 0)
    .sort((a, b) => b.issues.length - a.issues.length || a.project.title.localeCompare(b.project.title));
}

export function prioritySignal(task: TodayTask, now: Date): string | null {
  if (isOverdue(task, now)) return "🔴";
  if (isDueSoon(task, now)) return "🟡";
  if (isQuickWin(task)) return "🟢";
  return null;
}