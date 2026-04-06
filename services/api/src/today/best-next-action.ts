import { priorityRank } from "../lib/priority";
import type {
  TodayExecutionMode,
  TodayModeRecommendations,
  TodayReasonChip,
  TodayRecommendation,
  TodayRecommendationFit,
  TodayRecommendationReadiness,
  TodayTask,
} from "../../../../packages/shared/src";
import type { TaskProjectContext } from "../projects/intelligence";
import { taskRefKey } from "./hierarchy";
import { daysFromToday, effortToMinutes, estimatedMinutesForTask, minimumDurationToMinutes, remainingMinutesForTask, timeSpentMinutesForTask } from "./scoring";

const MIN_BEST_NEXT_ACTION_SCORE = 35;
const MAX_REASONS = 3;
const DEFAULT_MODE: TodayExecutionMode = "all";

const MODE_META: Record<TodayExecutionMode, { label: string; description: string }> = {
  all: {
    label: "All / Default",
    description: "Balanced execution guidance across readiness, urgency, block size, and leverage.",
  },
  quickWins: {
    label: "Quick Wins",
    description: "Favors low-friction work that can move forward in a short window without sacrificing trust.",
  },
  mediumBlock: {
    label: "Medium Block",
    description: "Favors meaningful progress that fits a realistic focused block of roughly 30–60 minutes.",
  },
  deepWork: {
    label: "Deep Work",
    description: "Favors substantial, high-value work that benefits from protected concentration time.",
  },
  dueSoon: {
    label: "Due Soon",
    description: "Favors time-sensitive work while still respecting readiness and structural credibility.",
  },
};

type Contribution = {
  reason: TodayReasonChip;
  value: number;
};

type CandidateBreakdown = {
  score: number;
  reasons: TodayReasonChip[];
  explanation: string;
  executionFit: TodayRecommendationFit;
  readiness: TodayRecommendationReadiness;
};

type DurationProfile = {
  minimumMinutes: number | null;
  effortMinutes: number | null;
  estimatedMinutes: number | null;
};

function dueContribution(task: TodayTask, now: Date): Contribution[] {
  if (!task.dueDate) return [];
  const diff = daysFromToday(task.dueDate, now);
  if (diff < 0) return [{ reason: "Overdue", value: 34 }];
  if (diff === 0) return [{ reason: "Due today", value: 28 }];
  if (diff === 1) return [{ reason: "Due soon", value: 22 }];
  if (diff <= 3) return [{ reason: "Due soon", value: 14 }];
  if (diff <= 7) return [{ reason: "Due soon", value: 6 }];
  return [];
}

function focusContribution(task: TodayTask): Contribution[] {
  const minimumMinutes = minimumDurationToMinutes(task.minimumDuration);
  const effortMinutes = remainingMinutesForTask(task);
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

function metadataScore(task: TodayTask): Contribution[] {
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
  const rank = priorityRank(task.priority);
  if (rank >= 5) return 26;
  if (rank === 4) return 20;
  if (rank === 3) return 14;
  if (rank === 2) return 8;
  if (rank === 1) return 4;
  return 0;
}

function executionReadinessScore(task: TodayTask, projectContext?: TaskProjectContext): number {
  let score = task.state === "next" ? 40 : 20;

  switch (projectContext?.taskExecutionReadiness) {
    case "ready":
      score += 18;
      break;
    case "weakReady":
      score += 8;
      break;
    case "notReady":
      score -= 18;
      break;
    case "blocked":
      score -= 42;
      break;
    default:
      score += task.context?.trim() ? 8 : -6;
      score += remainingMinutesForTask(task) !== null ? 6 : -6;
      score += minimumDurationToMinutes(task.minimumDuration) !== null ? 8 : -4;
      return score;
  }

  score += task.context?.trim() ? 6 : -4;
  score += remainingMinutesForTask(task) !== null ? 4 : -4;
  score += minimumDurationToMinutes(task.minimumDuration) !== null ? 6 : -3;
  return score;
}

function frictionPenalty(task: TodayTask, now: Date, projectContext?: TaskProjectContext): number {
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
  const effortMinutes = estimatedMinutesForTask(task);
  if ((minimumMinutes ?? 0) >= 120 || ((effortMinutes ?? 0) >= 240 && minimumMinutes === null)) {
    penalty -= 10;
  }

  if (projectContext?.blockedByAncestorState) penalty -= 20;
  if (projectContext?.blockedByDescendantState) penalty -= 18;
  if (projectContext?.hasActionableChildren) penalty -= 14;
  else if (projectContext?.hasOpenChildren) penalty -= 10;
  penalty -= (projectContext?.missingReadinessMetadata ?? 0) * 3;

  return penalty;
}

function isEligible(task: TodayTask): boolean {
  if (task.entityType === "project") return false;
  if (task.state === "completed" || task.state === "reference" || task.state === "someday" || task.state === "inbox" || task.state === "waiting") {
    return false;
  }
  return task.state === "next" || task.state === "scheduled";
}

function canBeBestNextAction(task: TodayTask, projectContext?: TaskProjectContext): boolean {
  if (!isEligible(task)) return false;
  return projectContext?.taskExecutionReadiness !== "blocked" && projectContext?.taskExecutionReadiness !== "notReady";
}

function durationProfile(task: TodayTask): DurationProfile {
  const minimumMinutes = minimumDurationToMinutes(task.minimumDuration);
  const effortMinutes = remainingMinutesForTask(task);
  return {
    minimumMinutes,
    effortMinutes,
    estimatedMinutes: minimumMinutes ?? effortMinutes,
  };
}

function inferExecutionFit(task: TodayTask): TodayRecommendationFit {
  const estimatedMinutes = durationProfile(task).estimatedMinutes;
  if (estimatedMinutes === null) return "unknown";
  if (estimatedMinutes <= 20) return "quick";
  if (estimatedMinutes <= 75) return "medium";
  return "deep";
}

function inferReadiness(projectContext?: TaskProjectContext, task?: TodayTask): TodayRecommendationReadiness {
  switch (projectContext?.taskExecutionReadiness) {
    case "ready":
      return "ready";
    case "weakReady":
      return "weakReady";
    case "notReady":
      return "notReady";
    case "blocked":
      return "blocked";
    default: {
      const metadataCount = [task?.context?.trim(), remainingMinutesForTask(task as TodayTask), minimumDurationToMinutes(task?.minimumDuration)]
        .filter((value) => value !== null && value !== undefined && value !== "")
        .length;
      return metadataCount >= 3 ? "ready" : metadataCount >= 1 ? "weakReady" : "notReady";
    }
  }
}

function activationFrictionScore(task: TodayTask, readiness: TodayRecommendationReadiness, projectContext?: TaskProjectContext): number {
  let score = 0;
  if (task.state === "next") score += 8;
  if (task.context?.trim()) score += 6;
  if (minimumDurationToMinutes(task.minimumDuration) !== null) score += 6;
  if (remainingMinutesForTask(task) !== null) score += 4;
  if (readiness === "ready") score += 8;
  else if (readiness === "weakReady") score += 4;
  else if (readiness === "notReady") score -= 8;
  else score -= 18;
  if (projectContext?.blockedByDescendantState) score -= 10;
  if (projectContext?.hasActionableChildren) score -= 8;
  return score;
}

function leverageScore(task: TodayTask, projectContext?: TaskProjectContext): number {
  let score = 0;
  const startedMinutes = timeSpentMinutesForTask(task) ?? 0;
  if (typeof task.priority === "number") score += priorityRank(task.priority) * 2;
  if (startedMinutes >= 30) score += 6;
  if (startedMinutes >= 90) score += 4;
  if (projectContext?.onlyActionableTask || projectContext?.onlyNextTask) score += 16;
  if (projectContext?.leadTaskId === task.taskId && projectContext?.projectLowMomentum) score += 14;
  if (projectContext?.leadTaskId === task.taskId && projectContext?.projectNeedsClarification) score += 10;
  if (projectContext?.projectHasDeadlinePressure) score += 10;
  return score;
}

function duePressureScore(task: TodayTask, now: Date): number {
  if (!task.dueDate) return 0;
  const diff = daysFromToday(task.dueDate, now);
  if (diff < 0) return 36;
  if (diff === 0) return 28;
  if (diff === 1) return 20;
  if (diff <= 3) return 14;
  if (diff <= 7) return 8;
  return 2;
}

function modeContribution(
  mode: TodayExecutionMode,
  task: TodayTask,
  now: Date,
  projectContext: TaskProjectContext | undefined,
  readiness: TodayRecommendationReadiness
): Contribution[] {
  const profile = durationProfile(task);
  const estimatedMinutes = profile.estimatedMinutes;
  const leverage = leverageScore(task, projectContext);
  const duePressure = duePressureScore(task, now);
  const friction = activationFrictionScore(task, readiness, projectContext);
  const contributions: Contribution[] = [];

  const pushIf = (condition: boolean, reason: TodayReasonChip, value: number) => {
    if (condition && value !== 0) contributions.push({ reason, value });
  };

  if (mode === "quickWins") {
    if (estimatedMinutes !== null) {
      if (estimatedMinutes <= 15) contributions.push({ reason: "Fits 15 min block", value: 26 });
      else if (estimatedMinutes <= 30) contributions.push({ reason: "Fits 30 min block", value: 20 });
      else if (estimatedMinutes <= 45) contributions.push({ reason: "Fits 60 min block", value: 8 });
      else if (estimatedMinutes <= 60) contributions.push({ reason: "Fits 60 min block", value: -4 });
      else if (estimatedMinutes <= 90) contributions.push({ reason: "Deep work block", value: -18 });
      else contributions.push({ reason: "Deep work block", value: -28 });
    }
    pushIf(friction >= 12, "Low activation friction", 14);
    pushIf(leverage >= 16, "High leverage", 8);
    pushIf(duePressure >= 20, task.dueDate && daysFromToday(task.dueDate, now) <= 1 ? "Time-sensitive" : "Due soon", 8);
    return contributions;
  }

  if (mode === "mediumBlock") {
    if (estimatedMinutes !== null) {
      if (estimatedMinutes >= 25 && estimatedMinutes <= 75) contributions.push({ reason: "Fits medium block", value: 24 });
      else if (estimatedMinutes >= 15 && estimatedMinutes < 25) contributions.push({ reason: "Fits 30 min block", value: 10 });
      else if (estimatedMinutes > 75 && estimatedMinutes <= 105) contributions.push({ reason: "Deep work block", value: 6 });
      else if (estimatedMinutes <= 10) contributions.push({ reason: "Small effort", value: -8 });
      else if (estimatedMinutes > 120) contributions.push({ reason: "Deep work block", value: -16 });
    }
    pushIf(friction >= 8, "Low activation friction", 8);
    pushIf(leverage >= 18, "High leverage", 12);
    pushIf(duePressure >= 14, "Time-sensitive", 8);
    pushIf(estimatedMinutes !== null && estimatedMinutes >= 30 && estimatedMinutes <= 90, "Substantial progress", 8);
    return contributions;
  }

  if (mode === "deepWork") {
    if (estimatedMinutes !== null) {
      if (estimatedMinutes >= 60 && estimatedMinutes <= 150) contributions.push({ reason: "Deep work block", value: 28 });
      else if (estimatedMinutes >= 45 && estimatedMinutes < 60) contributions.push({ reason: "Deep work block", value: 12 });
      else if (estimatedMinutes > 150 && estimatedMinutes <= 240) contributions.push({ reason: "Deep work block", value: 14 });
      else if (estimatedMinutes <= 20) contributions.push({ reason: "Fits 15 min block", value: -18 });
      else if (estimatedMinutes <= 30) contributions.push({ reason: "Fits 30 min block", value: -12 });
    } else if ((profile.effortMinutes ?? 0) >= 120) {
      contributions.push({ reason: "Deep work block", value: 10 });
    } else {
      contributions.push({ reason: "Low activation friction", value: -6 });
    }
    pushIf(leverage >= 14, "High leverage", 16);
    pushIf(projectContext?.leadTaskId === task.taskId && projectContext?.projectLowMomentum === true, "Restores momentum", 10);
    pushIf(duePressure >= 20, "Time-sensitive", 6);
    pushIf((estimatedMinutes ?? 0) >= 45 || leverage >= 14, "Substantial progress", 12);
    return contributions;
  }

  if (mode === "dueSoon") {
    if (task.dueDate) {
      const diff = daysFromToday(task.dueDate, now);
      if (diff <= 3) contributions.push({ reason: "Time-sensitive", value: duePressure >= 20 ? 28 : 18 });
      else if (diff <= 7) contributions.push({ reason: "Due soon", value: 8 });
    } else {
      contributions.push({ reason: "Low activation friction", value: -6 });
    }
    if (task.state === "scheduled" && task.dueDate && daysFromToday(task.dueDate, now) === 0) {
      contributions.push({ reason: "Scheduled for today", value: 12 });
    }
    if ((estimatedMinutes ?? 0) > 120) contributions.push({ reason: "Deep work block", value: -6 });
    pushIf(leverage >= 12, "Reduces deadline risk", 10);
    pushIf(friction >= 10, "Ready to start", 8);
    return contributions;
  }

  // default / balanced lens
  pushIf(friction >= 12, "Low activation friction", 6);
  pushIf(leverage >= 16, "High leverage", 8);
  pushIf(duePressure >= 20, "Time-sensitive", 6);
  return contributions;
}

function buildRecommendation(
  task: TodayTask,
  score: number,
  reasons: TodayReasonChip[],
  explanation: string,
  executionFit: TodayRecommendationFit,
  readiness: TodayRecommendationReadiness,
  projectContext?: TaskProjectContext
): TodayRecommendation {
  return {
    task,
    project: projectContext?.project ? { taskId: projectContext.project.taskId, title: projectContext.project.title } : undefined,
    score,
    reasons,
    explanation,
    executionFit,
    readiness,
  };
}

function buildExplanation(mode: TodayExecutionMode, reasons: TodayReasonChip[]): string {
  if (!reasons.length) {
    return MODE_META[mode].description;
  }
  if (reasons.length === 1) {
    return `${MODE_META[mode].label} picked this because it is ${reasons[0].toLowerCase()}.`;
  }
  if (reasons.length === 2) {
    return `${MODE_META[mode].label} picked this because it is ${reasons[0].toLowerCase()} and ${reasons[1].toLowerCase()}.`;
  }
  return `${MODE_META[mode].label} picked this because it is ${reasons[0].toLowerCase()}, ${reasons[1].toLowerCase()}, and ${reasons[2].toLowerCase()}.`;
}

function sortRanked(
  a: { recommendation: TodayRecommendation; canBeBest: boolean },
  b: { recommendation: TodayRecommendation; canBeBest: boolean },
  now: Date
): number {
  if (b.recommendation.score !== a.recommendation.score) return b.recommendation.score - a.recommendation.score;
  const aFitRank = a.recommendation.executionFit === "quick" ? 1 : a.recommendation.executionFit === "medium" ? 2 : a.recommendation.executionFit === "deep" ? 3 : 4;
  const bFitRank = b.recommendation.executionFit === "quick" ? 1 : b.recommendation.executionFit === "medium" ? 2 : b.recommendation.executionFit === "deep" ? 3 : 4;
  if (aFitRank !== bFitRank) return aFitRank - bFitRank;
  const aBlock = minimumDurationToMinutes(a.recommendation.task.minimumDuration) ?? Number.MAX_SAFE_INTEGER;
  const bBlock = minimumDurationToMinutes(b.recommendation.task.minimumDuration) ?? Number.MAX_SAFE_INTEGER;
  if (aBlock !== bBlock) return aBlock - bBlock;
  const aDue = a.recommendation.task.dueDate ? daysFromToday(a.recommendation.task.dueDate, now) : Number.POSITIVE_INFINITY;
  const bDue = b.recommendation.task.dueDate ? daysFromToday(b.recommendation.task.dueDate, now) : Number.POSITIVE_INFINITY;
  if (aDue !== bDue) return aDue - bDue;
  return a.recommendation.task.title.localeCompare(b.recommendation.task.title);
}

export function scoreBestNextActionCandidate(
  task: TodayTask,
  now: Date,
  mode: TodayExecutionMode,
  projectContext?: TaskProjectContext
): CandidateBreakdown {
  const baseContributions: Contribution[] = [];
  let score = executionReadinessScore(task, projectContext);

  const due = dueContribution(task, now);
  baseContributions.push(...due);
  score += due.reduce((sum, item) => sum + item.value, 0);

  const focus = focusContribution(task);
  baseContributions.push(...focus);
  score += focus.reduce((sum, item) => sum + item.value, 0);

  const metadata = metadataScore(task);
  baseContributions.push(...metadata);
  score += metadata.reduce((sum, item) => sum + item.value, 0);

  score += priorityScore(task);
  score += momentumScore(task, now);

  if (projectContext?.onlyActionableTask || projectContext?.onlyNextTask) {
    baseContributions.push({ reason: "Only clear next step", value: 14 });
    score += 14;
  }
  if (projectContext?.leadTaskId === task.taskId && projectContext?.projectLowMomentum) {
    baseContributions.push({ reason: "Restores momentum", value: 10 });
    score += 10;
  }
  if (projectContext?.leadTaskId === task.taskId && projectContext?.projectNeedsClarification) {
    baseContributions.push({ reason: "Clarifies project", value: 8 });
    score += 8;
  }
  if (projectContext?.projectHasDeadlinePressure) {
    baseContributions.push({ reason: "Reduces deadline risk", value: 8 });
    score += 8;
  }

  if (task.state === "scheduled" && task.dueDate && daysFromToday(task.dueDate, now) === 0) {
    baseContributions.push({ reason: "Scheduled for today", value: 6 });
    score += 6;
  }

  score += frictionPenalty(task, now, projectContext);

  const readiness = inferReadiness(projectContext, task);
  const modeContributions = modeContribution(mode, task, now, projectContext, readiness);
  score += modeContributions.reduce((sum, item) => sum + item.value, 0);

  const reasons = [...baseContributions, ...modeContributions]
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value)
    .map((item) => item.reason)
    .filter((reason, index, all) => all.indexOf(reason) === index)
    .slice(0, MAX_REASONS);

  return {
    score,
    reasons,
    explanation: buildExplanation(mode, reasons),
    executionFit: inferExecutionFit(task),
    readiness,
  };
}

function buildRecommendationsForMode(
  tasks: TodayTask[],
  now: Date,
  mode: TodayExecutionMode,
  projectContextByKey: Map<string, TaskProjectContext>
): TodayModeRecommendations {
  const ranked = tasks
    .filter(isEligible)
    .map((task) => {
      const context = projectContextByKey.get(taskRefKey(task));
      const breakdown = scoreBestNextActionCandidate(task, now, mode, context);
      return {
        recommendation: buildRecommendation(
          task,
          breakdown.score,
          breakdown.reasons,
          breakdown.explanation,
          breakdown.executionFit,
          breakdown.readiness,
          context
        ),
        canBeBest: canBeBestNextAction(task, context),
      };
    })
    .sort((a, b) => sortRanked(a, b, now));

  const rankedRecommendations = ranked.map((item) => item.recommendation);
  const bestNextActionCandidate = ranked.find((item) => item.canBeBest && item.recommendation.score >= MIN_BEST_NEXT_ACTION_SCORE);
  const bestNextAction = bestNextActionCandidate?.recommendation ?? null;
  const recommended = rankedRecommendations
    .filter((item) => !bestNextAction || taskRefKey(item.task) !== taskRefKey(bestNextAction.task))
    .slice(0, 12);

  return {
    mode,
    label: MODE_META[mode].label,
    description: MODE_META[mode].description,
    bestNextAction,
    recommended,
  };
}

export function buildTodayRecommendations(
  tasks: TodayTask[],
  now: Date,
  projectContextByKey: Map<string, TaskProjectContext>
): {
  defaultMode: TodayExecutionMode;
  bestNextAction: TodayRecommendation | null;
  recommended: TodayRecommendation[];
  recommendationModes: Record<TodayExecutionMode, TodayModeRecommendations>;
} {
  const recommendationModes: Record<TodayExecutionMode, TodayModeRecommendations> = {
    all: buildRecommendationsForMode(tasks, now, "all", projectContextByKey),
    quickWins: buildRecommendationsForMode(tasks, now, "quickWins", projectContextByKey),
    mediumBlock: buildRecommendationsForMode(tasks, now, "mediumBlock", projectContextByKey),
    deepWork: buildRecommendationsForMode(tasks, now, "deepWork", projectContextByKey),
    dueSoon: buildRecommendationsForMode(tasks, now, "dueSoon", projectContextByKey),
  };

  const defaultModeResult = recommendationModes[DEFAULT_MODE];
  return {
    defaultMode: DEFAULT_MODE,
    bestNextAction: defaultModeResult.bestNextAction,
    recommended: defaultModeResult.recommended,
    recommendationModes,
  };
}
