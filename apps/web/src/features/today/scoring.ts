import type {
  DurationEstimate,
  EffortEstimate,
  TodayExecutionMode,
  TodayGuidedActions,
  TodayModeRecommendations,
  TodayProjectHealthSummary,
  TodayTask,
} from "@tm/shared";

export type {
  TodayExecutionMode,
  TodayGuidedActions,
  TodayModeRecommendations,
  TodayProjectHealthSummary,
  TodayTask,
};

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

export function estimatedMinutesForTask(task: {
  estimatedMinutes?: number;
  remainingMinutes?: number;
  timeSpentMinutes?: number;
  effort?: EffortEstimate;
}): number | null {
  if (typeof task.estimatedMinutes === "number" && task.estimatedMinutes >= 0) return task.estimatedMinutes;
  if (
    typeof task.remainingMinutes === "number" &&
    task.remainingMinutes >= 0 &&
    typeof task.timeSpentMinutes === "number" &&
    task.timeSpentMinutes >= 0
  ) {
    return task.remainingMinutes + task.timeSpentMinutes;
  }
  return effortToMinutes(task.effort);
}

export function remainingMinutesForTask(task: {
  remainingMinutes?: number;
  estimatedMinutes?: number;
  timeSpentMinutes?: number;
  effort?: EffortEstimate;
}): number | null {
  if (typeof task.remainingMinutes === "number" && task.remainingMinutes >= 0) return task.remainingMinutes;
  const estimated = estimatedMinutesForTask(task);
  if (estimated === null) return null;
  if (typeof task.timeSpentMinutes === "number" && task.timeSpentMinutes >= 0) {
    return Math.max(0, estimated - task.timeSpentMinutes);
  }
  return estimated;
}

export function timeSpentMinutesForTask(task: {
  timeSpentMinutes?: number;
  estimatedMinutes?: number;
  remainingMinutes?: number;
  effort?: EffortEstimate;
}): number | null {
  if (typeof task.timeSpentMinutes === "number" && task.timeSpentMinutes >= 0) return task.timeSpentMinutes;
  const estimated = estimatedMinutesForTask(task);
  if (estimated === null) return null;
  if (typeof task.remainingMinutes === "number" && task.remainingMinutes >= 0) {
    return Math.max(0, estimated - task.remainingMinutes);
  }
  return 0;
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

export function executionModeLabel(mode: TodayExecutionMode): string {
  switch (mode) {
    case "quickWins":
      return "Quick Wins";
    case "mediumBlock":
      return "Medium Block";
    case "deepWork":
      return "Deep Work";
    case "dueSoon":
      return "Due Soon";
    case "all":
    default:
      return "All / Default";
  }
}

export function prioritySignal(task: TodayTask, now: Date): string | null {
  if (isOverdue(task, now)) return "🔴";
  if (isDueSoon(task, now)) return "🟡";
  const minutes = minimumDurationToMinutes(task.minimumDuration) ?? remainingMinutesForTask(task);
  if (minutes !== null && minutes <= 20) return "🟢";
  return null;
}

export const TODAY_CONSTANTS = {
  MAX_RECOMMENDED: 7,
};

export function hasAnyGuidedActions(actions: TodayGuidedActions): boolean {
  return Boolean(
    actions.processInbox ||
      actions.followUpWaiting ||
      actions.clarifyProjects ||
      actions.reviveProjects ||
      actions.unblockProjects ||
      actions.breakLargeTasks ||
      actions.prepareNextActions
  );
}

export function hasAnyProjectHealthIssues(summary: TodayProjectHealthSummary): boolean {
  return Boolean(
    summary.noClearNextStep.length ||
      summary.blockedByWaiting.length ||
      summary.deadlinePressure.length ||
      summary.lowMomentum.length
  );
}
