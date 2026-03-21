import type {
  DurationEstimate,
  EffortEstimate,
  TodayProjectHealthIssue,
  TodayTask,
} from "@tm/shared";
import { buildChildrenMap, collectDescendants } from "./hierarchy";

export function effortToMinutes(effort?: EffortEstimate): number | null {
  if (!effort) return null;
  if (!Number.isFinite(effort.value) || effort.value <= 0) return null;
  if (effort.unit === "hours") return Math.round(effort.value * 60);
  return Math.round(effort.value * 8 * 60);
}

export function minimumDurationToMinutes(minimumDuration?: DurationEstimate): number | null {
  if (!minimumDuration) return null;
  if (!Number.isFinite(minimumDuration.value) || minimumDuration.value <= 0) return null;
  if (minimumDuration.unit === "hours") return Math.round(minimumDuration.value * 60);
  return Math.round(minimumDuration.value);
}

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

export function isOverdue(task: TodayTask, now: Date): boolean {
  if (!task.dueDate) return false;
  return daysFromToday(task.dueDate, now) < 0;
}

function ageDays(task: TodayTask, now: Date): number {
  const updated = new Date(task.updatedAt || task.createdAt);
  return Math.max(0, Math.floor((now.getTime() - updated.getTime()) / 86400000));
}

export function isWaitingFollowUp(task: TodayTask, now: Date): boolean {
  return task.state === "waiting" && ageDays(task, now) >= 7;
}

export function hasProjectActionablePath(task: TodayTask): boolean {
  return task.state === "next" || task.state === "scheduled" || task.state === "waiting";
}

function isOpenAction(task: TodayTask): boolean {
  return task.entityType !== "project" && task.state !== "completed" && task.state !== "reference";
}

export function buildProjectHealth(tasks: TodayTask[], now: Date): TodayProjectHealthIssue[] {
  const childrenMap = buildChildrenMap(tasks);
  const projects = tasks.filter((task) => task.entityType === "project" && !task.parentTaskId && task.state !== "completed");
  const out: TodayProjectHealthIssue[] = [];

  for (const project of projects) {
    const descendants = collectDescendants(project, childrenMap);
    const openActions = descendants.filter(isOpenAction);
    if (!openActions.length) continue;

    const nextActions = openActions.filter((task) => task.state === "next");
    const somedayActions = openActions.filter((task) => task.state === "someday");
    const waitingActions = openActions.filter((task) => task.state === "waiting");
    const stalledWaiting = waitingActions.filter((task) => isWaitingFollowUp(task, now));
    const issues: Array<"noNext" | "onlySomeday" | "stalledWaiting"> = [];

    if (nextActions.length === 0) issues.push("noNext");
    if (openActions.length > 0 && somedayActions.length === openActions.length) issues.push("onlySomeday");
    if (nextActions.length === 0 && waitingActions.length > 0 && waitingActions.length === openActions.length && stalledWaiting.length > 0) {
      issues.push("stalledWaiting");
    }

    if (!issues.length) continue;

    out.push({
      project,
      issues,
      nextActions: nextActions.length,
      stalledWaiting: stalledWaiting.length,
      openActions: openActions.length,
    });
  }

  out.sort((a, b) => {
    if (b.openActions !== a.openActions) return b.openActions - a.openActions;
    return a.project.title.localeCompare(b.project.title);
  });

  return out;
}
