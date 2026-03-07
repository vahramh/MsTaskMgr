import type { EffortEstimate, TaskPriority, TodayProjectHealthIssue, TodayTask } from "@tm/shared";
import { buildChildrenMap, collectDescendants } from "./hierarchy";

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
  MAX_RECOMMENDED: 20,
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

function dueScore(task: TodayTask, now: Date): number {
  if (!task.dueDate) return 0;
  const diff = daysFromToday(task.dueDate, now);
  if (diff < 0) return TODAY_CONSTANTS.DUE_OVERDUE;
  if (diff === 0) return TODAY_CONSTANTS.DUE_TODAY;
  if (diff <= 3) return TODAY_CONSTANTS.DUE_SOON;
  return 0;
}

function priorityScore(task: TodayTask): number {
  if (!task.priority) return 0;
  return TODAY_CONSTANTS.PRIORITY_WEIGHT[task.priority] ?? 0;
}

function ageDays(task: TodayTask, now: Date): number {
  const updated = new Date(task.updatedAt || task.createdAt);
  return Math.max(0, Math.floor((now.getTime() - updated.getTime()) / 86400000));
}

function stalenessScore(task: TodayTask, now: Date): number {
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

function effortScore(task: TodayTask): number {
  const minutes = effortToMinutes(task.effort);
  if (minutes === null) return 0;
  if (minutes <= 15) return 24;
  if (minutes <= 60) return 12;
  if (minutes <= 180) return 0;
  if (minutes <= 480) return -10;
  return -22;
}

function contextScore(task: TodayTask): number {
  return task.context?.trim() ? TODAY_CONSTANTS.CONTEXT_BONUS : 0;
}

function workflowScore(task: TodayTask): number {
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

export function scoreTask(task: TodayTask, now: Date): number {
  return priorityScore(task) + dueScore(task, now) + stalenessScore(task, now) + workflowScore(task) + effortScore(task) + contextScore(task);
}

export function rankTasks(tasks: TodayTask[], now: Date): TodayTask[] {
  return [...tasks]
    .map((task) => ({ task, score: scoreTask(task, now) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(a.task.updatedAt).getTime() - new Date(b.task.updatedAt).getTime();
    })
    .map((x) => x.task);
}

export function isWaitingFollowUp(task: TodayTask, now: Date): boolean {
  if (task.state !== "waiting") return false;
  return ageDays(task, now) >= TODAY_CONSTANTS.WAITING_FOLLOWUP_DAYS;
}

export function isDueToday(task: TodayTask, now: Date): boolean {
  if (!task.dueDate) return false;
  return daysFromToday(task.dueDate, now) === 0;
}

export function isOverdue(task: TodayTask, now: Date): boolean {
  if (!task.dueDate) return false;
  return daysFromToday(task.dueDate, now) < 0;
}


export function buildProjectHealth(tasks: TodayTask[], now: Date): TodayProjectHealthIssue[] {
  const childrenMap = buildChildrenMap(tasks);
  const projects = tasks.filter((task) => task.entityType === "project" && !task.parentTaskId && task.state !== "completed");
  return projects
    .map((project) => {
      const descendants = collectDescendants(project, childrenMap);
      const openDescendants = descendants.filter((task) => task.state !== "completed" && task.state !== "reference");
      const openActions = openDescendants.filter((task) => task.entityType !== "project");
      const nextActions = openActions.filter((task) => task.state === "next");
      const somedayActions = openActions.filter((task) => task.state === "someday");
      const stalledWaiting = openActions.filter((task) => isWaitingFollowUp(task, now));
      const issues: TodayProjectHealthIssue["issues"] = [];
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
