import type { EffortEstimate, TodayProjectHealthIssue, TodayTask } from "@tm/shared";

export type { TodayProjectHealthIssue as ProjectHealthIssue, TodayTask };
export type TodayFilter = "all" | "quick" | "deep" | "dueSoon";

export function effortToMinutes(effort?: EffortEstimate): number | null {
  if (!effort) return null;
  if (!Number.isFinite(effort.value) || effort.value <= 0) return null;
  if (effort.unit === "hours") return Math.round(effort.value * 60);
  return Math.round(effort.value * 8 * 60);
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

export function isDueToday(task: TodayTask, now: Date): boolean {
  if (!task.dueDate) return false;
  return daysFromToday(task.dueDate, now) === 0;
}

export function isOverdue(task: TodayTask, now: Date): boolean {
  if (!task.dueDate) return false;
  return daysFromToday(task.dueDate, now) < 0;
}

export function isDueSoon(task: TodayTask, now: Date): boolean {
  if (!task.dueDate) return false;
  const diff = daysFromToday(task.dueDate, now);
  return diff >= 0 && diff <= 3;
}

export function isQuickWin(task: TodayTask): boolean {
  const minutes = effortToMinutes(task.effort);
  return minutes !== null && minutes <= 15;
}

export function isDeepWork(task: TodayTask): boolean {
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

export const TODAY_CONSTANTS = {
  MAX_RECOMMENDED: 7,
};

export function prioritySignal(task: TodayTask, now: Date): string | null {
  if (isOverdue(task, now)) return "🔴";
  if (isDueSoon(task, now)) return "🟡";
  if (isQuickWin(task)) return "🟢";
  return null;
}
