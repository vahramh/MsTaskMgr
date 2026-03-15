import type {
  DurationEstimate,
  EffortEstimate,
  TodayGuidedActions,
  TodayProjectHealthProject,
  TodayProjectHealthSummary,
  TodayRecommendation,
  TodayTask,
} from "@tm/shared";

export type { TodayGuidedActions, TodayProjectHealthProject, TodayProjectHealthSummary, TodayRecommendation, TodayTask };
export type TodayFilter = "all" | "quick" | "deep" | "dueSoon" | "scheduled";

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
  const minutes = minimumDurationToMinutes(task.minimumDuration) ?? effortToMinutes(task.effort);
  return minutes !== null && minutes <= 30;
}

export function isDeepWork(task: TodayTask): boolean {
  const minutes = minimumDurationToMinutes(task.minimumDuration) ?? effortToMinutes(task.effort);
  return minutes !== null && minutes > 60;
}

export function applyRecommendationFilter(items: TodayRecommendation[], filter: TodayFilter, now: Date): TodayRecommendation[] {
  switch (filter) {
    case "quick":
      return items.filter((item) => isQuickWin(item.task));
    case "deep":
      return items.filter((item) => isDeepWork(item.task));
    case "dueSoon":
      return items.filter((item) => isDueSoon(item.task, now) || isDueToday(item.task, now) || isOverdue(item.task, now));
    case "scheduled":
      return items.filter((item) => item.task.state === "scheduled");
    case "all":
    default:
      return items;
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

export function hasAnyGuidedActions(actions: TodayGuidedActions): boolean {
  return Boolean(actions.processInbox || actions.followUpWaiting || actions.clarifyProjects || actions.reviveProjects || actions.unblockProjects || actions.breakLargeTasks);
}

export function hasAnyProjectHealthIssues(summary: TodayProjectHealthSummary): boolean {
  return Boolean(
    summary.noClearNextStep.length ||
      summary.blockedByWaiting.length ||
      summary.deadlinePressure.length ||
      summary.lowMomentum.length
  );
}
