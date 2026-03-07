import type { ReviewCounts, ReviewResponse, TodayProjectHealthIssue, TodayTask } from "@tm/shared";
import { buildProjectHealth, isOverdue, isWaitingFollowUp } from "../today/scoring";

export const REVIEW_CONSTANTS = {
  STALE_DAYS: 30,
  SOMEDAY_REVIEW_DAYS: 60,
};

function ageDays(task: TodayTask, now: Date): number {
  const updated = new Date(task.updatedAt || task.createdAt);
  return Math.max(0, Math.floor((now.getTime() - updated.getTime()) / 86400000));
}

export function isStaleTask(task: TodayTask, now: Date): boolean {
  if (task.state === "completed" || task.state === "reference") return false;
  return ageDays(task, now) >= REVIEW_CONSTANTS.STALE_DAYS;
}

export function isOldSomeday(task: TodayTask, now: Date): boolean {
  return task.state === "someday" && ageDays(task, now) >= REVIEW_CONSTANTS.SOMEDAY_REVIEW_DAYS;
}

export function isOverdueScheduled(task: TodayTask, now: Date): boolean {
  return task.state === "scheduled" && isOverdue(task, now);
}

export function buildReviewResponse(tasks: TodayTask[], now: Date, includeShared: boolean): ReviewResponse {
  const actionable = tasks.filter((task) => task.state !== "completed" && task.state !== "reference");
  const inbox = actionable.filter((task) => task.state === "inbox");
  const waitingFollowups = actionable.filter((task) => isWaitingFollowUp(task, now));
  const staleTasks = actionable.filter((task) => isStaleTask(task, now));
  const oldSomeday = actionable.filter((task) => isOldSomeday(task, now));
  const overdueScheduled = actionable.filter((task) => isOverdueScheduled(task, now));
  const projectHealth = buildProjectHealth(tasks, now);
  const projectsWithoutNextItems = projectHealth.filter((item) => item.issues.includes("noNext"));

  const counts: ReviewCounts = {
    inboxCount: inbox.length,
    projectsWithoutNext: projectsWithoutNextItems.length,
    waitingFollowups: waitingFollowups.length,
    staleTasks: staleTasks.length,
    oldSomeday: oldSomeday.length,
    overdueScheduled: overdueScheduled.length,
  };

  return {
    generatedAt: now.toISOString(),
    includeShared,
    ...counts,
    buckets: {
      inbox,
      waitingFollowups,
      staleTasks,
      oldSomeday,
      overdueScheduled,
    },
    projectsWithoutNextItems,
  };
}
