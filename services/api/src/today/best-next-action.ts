import type { TodayReasonChip, TodayRecommendation, TodayTask } from "@tm/shared";
import type { TaskProjectContext } from "../insights/project-health";
import { taskRefKey } from "./hierarchy";
import { daysFromToday, effortToMinutes, minimumDurationToMinutes } from "./scoring";

const MIN_BEST_NEXT_ACTION_SCORE = 35;
const MAX_REASONS = 3;

type CandidateBreakdown = {
  score: number;
  reasons: TodayReasonChip[];
};

function dueContribution(task: TodayTask, now: Date): Array<{ reason: TodayReasonChip; value: number }> {
  if (!task.dueDate) return [];
  const diff = daysFromToday(task.dueDate, now);
  if (diff < 0) return [{ reason: "Overdue", value: 34 }];
  if (diff === 0) return [{ reason: "Due today", value: 28 }];
  if (diff === 1) return [{ reason: "Due soon", value: 22 }];
  if (diff <= 3) return [{ reason: "Due soon", value: 14 }];
  if (diff <= 7) return [{ reason: "Due soon", value: 6 }];
  return [];
}

function focusContribution(task: TodayTask): Array<{ reason: TodayReasonChip; value: number }> {
  const minimumMinutes = minimumDurationToMinutes(task.minimumDuration);
  const effortMinutes = effortToMinutes(task.effort);
  if (minimumMinutes !== null) {
    if (minimumMinutes <= 15) return [{ reason: "Fits 15 min block", value: 14 }];
    if (minimumMinutes <= 30) return [{ reason: "Fits 30 min block", value: 20 }];
    if (minimumMinutes <= 60) return [{ reason: "Fits 60 min block", value: 18 }];
    if (minimumMinutes <= 90) return [{ reason: "Deep work block", value: 8 }];
    if (minimumMinutes <= 120) return [{ reason: "Deep work block", value: -4 }];
    return [{ reason: "Deep work block", value: -12 }];
  }
  if (effortMinutes !== null) {
    if (effortMinutes <= 15) return [{ reason: "Small effort", value: 10 }];
    if (effortMinutes <= 30) return [{ reason: "Fits 30 min block", value: 14 }];
    if (effortMinutes <= 60) return [{ reason: "Fits 60 min block", value: 12 }];
    if (effortMinutes <= 120) return [{ reason: "Deep work block", value: 4 }];
    return [{ reason: "Deep work block", value: -6 }];
  }
  return [];
}

function momentumScore(task: TodayTask, now: Date): number {
  const updated = new Date(task.updatedAt || task.createdAt);
  const age = Math.max(0, Math.floor((now.getTime() - updated.getTime()) / 86400000));
  if (age >= 60) return 8;
  if (age >= 30) return 10;
  if (age >= 14) return 8;
  if (age >= 7) return 4;
  return 0;
}

function metadataScore(task: TodayTask): Array<{ reason: TodayReasonChip; value: number }> {
  const hasContext = !!task.context?.trim();
  const hasEffort = effortToMinutes(task.effort) !== null;
  const hasMinimumDuration = minimumDurationToMinutes(task.minimumDuration) !== null;
  const count = [hasContext, hasEffort, hasMinimumDuration].filter(Boolean).length;
  if (count === 3) return [{ reason: "Well defined", value: 10 }, { reason: "Ready to start", value: 10 }];
  if (count === 2) return [{ reason: "Ready to start", value: 5 }];
  if (count === 1) return [{ reason: "Ready to start", value: 1 }];
  return [];
}

function priorityScore(task: TodayTask): number {
  switch (task.priority) {
    case 5:
      return 26;
    case 4:
      return 20;
    case 3:
      return 14;
    case 2:
      return 8;
    case 1:
      return 4;
    default:
      return 0;
  }
}

function executionReadinessScore(task: TodayTask): number {
  let score = task.state === "next" ? 40 : 20;
  score += task.context?.trim() ? 8 : -6;
  score += effortToMinutes(task.effort) !== null ? 6 : -6;
  score += minimumDurationToMinutes(task.minimumDuration) !== null ? 8 : -4;
  return score;
}

function frictionPenalty(task: TodayTask, now: Date): number {
  let penalty = 0;
  if (task.state === "scheduled") {
    const diff = task.dueDate ? daysFromToday(task.dueDate, now) : Number.POSITIVE_INFINITY;
    if (diff > 0) penalty -= 8;
    if (diff === 0) penalty += 4;
  }
  const deferCount = typeof task.attrs?.["_egsDeferCount"] === "number" ? Number(task.attrs?.["_egsDeferCount"]) : 0;
  if (deferCount >= 4) penalty -= 10;
  else if (deferCount >= 2) penalty -= 4;

  const minimumMinutes = minimumDurationToMinutes(task.minimumDuration);
  const effortMinutes = effortToMinutes(task.effort);
  if ((minimumMinutes ?? 0) >= 120 || ((effortMinutes ?? 0) >= 240 && minimumMinutes === null)) {
    penalty -= 10;
  }
  return penalty;
}

function isEligible(task: TodayTask): boolean {
  if (task.entityType === "project") return false;
  if (task.state === "completed" || task.state === "reference" || task.state === "someday" || task.state === "inbox" || task.state === "waiting") {
    return false;
  }
  return task.state === "next" || task.state === "scheduled";
}

function buildRecommendation(task: TodayTask, score: number, reasons: TodayReasonChip[], projectContext?: TaskProjectContext): TodayRecommendation {
  return {
    task,
    project: projectContext?.project ? { taskId: projectContext.project.taskId, title: projectContext.project.title } : undefined,
    score,
    reasons,
  };
}

export function scoreBestNextActionCandidate(task: TodayTask, now: Date, projectContext?: TaskProjectContext): CandidateBreakdown {
  const contributions: Array<{ reason: TodayReasonChip; value: number }> = [];
  let score = executionReadinessScore(task);

  contributions.push(...dueContribution(task, now));
  score += contributions.reduce((sum, item) => sum + item.value, 0);

  const focus = focusContribution(task);
  contributions.push(...focus);
  score += focus.reduce((sum, item) => sum + item.value, 0);

  const metadata = metadataScore(task);
  contributions.push(...metadata);
  score += metadata.reduce((sum, item) => sum + item.value, 0);

  score += priorityScore(task);
  score += momentumScore(task, now);

  if (projectContext?.onlyActionableTask || projectContext?.onlyNextTask) {
    contributions.push({ reason: "Only clear next step", value: 14 });
    score += 14;
  }
  if (projectContext?.leadTaskId === task.taskId && projectContext?.projectLowMomentum) {
    contributions.push({ reason: "Restores momentum", value: 10 });
    score += 10;
  }
  if (projectContext?.leadTaskId === task.taskId && projectContext?.projectNeedsClarification) {
    contributions.push({ reason: "Clarifies project", value: 8 });
    score += 8;
  }
  if (projectContext?.projectHasDeadlinePressure) {
    contributions.push({ reason: "Reduces deadline risk", value: 8 });
    score += 8;
  }

  if (task.state === "scheduled" && task.dueDate && daysFromToday(task.dueDate, now) === 0) {
    contributions.push({ reason: "Scheduled for today", value: 6 });
    score += 6;
  }

  score += frictionPenalty(task, now);

  const reasons = contributions
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value)
    .map((item) => item.reason)
    .filter((reason, index, all) => all.indexOf(reason) === index)
    .slice(0, MAX_REASONS);

  return { score, reasons };
}

export function buildTodayRecommendations(
  tasks: TodayTask[],
  now: Date,
  projectContextByKey: Map<string, TaskProjectContext>
): { bestNextAction: TodayRecommendation | null; recommended: TodayRecommendation[] } {
  const ranked = tasks
    .filter(isEligible)
    .map((task) => {
      const context = projectContextByKey.get(taskRefKey(task));
      const breakdown = scoreBestNextActionCandidate(task, now, context);
      return {
        recommendation: buildRecommendation(task, breakdown.score, breakdown.reasons, context),
      };
    })
    .sort((a, b) => {
      if (b.recommendation.score !== a.recommendation.score) return b.recommendation.score - a.recommendation.score;
      const aBlock = minimumDurationToMinutes(a.recommendation.task.minimumDuration) ?? Number.MAX_SAFE_INTEGER;
      const bBlock = minimumDurationToMinutes(b.recommendation.task.minimumDuration) ?? Number.MAX_SAFE_INTEGER;
      if (aBlock !== bBlock) return aBlock - bBlock;
      const aDue = a.recommendation.task.dueDate ? daysFromToday(a.recommendation.task.dueDate, now) : Number.POSITIVE_INFINITY;
      const bDue = b.recommendation.task.dueDate ? daysFromToday(b.recommendation.task.dueDate, now) : Number.POSITIVE_INFINITY;
      if (aDue !== bDue) return aDue - bDue;
      return a.recommendation.task.title.localeCompare(b.recommendation.task.title);
    })
    .map((item) => item.recommendation);

  const bestNextAction = ranked.length > 0 && ranked[0].score >= MIN_BEST_NEXT_ACTION_SCORE ? ranked[0] : null;
  const recommended = ranked
    .filter((item) => !bestNextAction || taskRefKey(item.task) !== taskRefKey(bestNextAction.task))
    .slice(0, 12);

  return { bestNextAction, recommended };
}
