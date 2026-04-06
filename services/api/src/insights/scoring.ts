import { priorityRank } from "../lib/priority";
import type {
  InsightRecommendedAction,
  InsightReasonCode,
  InsightsResponse,
  InsightSuggestion,
  InsightSuggestionType,
  TodayTask,
} from "@tm/shared";
import { isOldSomeday, isStaleTask } from "../review/scoring";
import { buildChildrenMap, collectDescendants, taskRefKey } from "../today/hierarchy";
import { daysFromToday, effortToMinutes, hasProjectActionablePath, isWaitingFollowUp, minimumDurationToMinutes } from "../today/scoring";

const MAX_SUGGESTIONS = 24;
const DEFER_COUNT_ATTR = "_egsDeferCount";

function ageDays(task: TodayTask, now: Date): number {
  const updated = new Date(task.updatedAt || task.createdAt);
  return Math.max(0, Math.floor((now.getTime() - updated.getTime()) / 86400000));
}

function urgencyFromDueDate(task: TodayTask, now: Date): number {
  if (!task.dueDate) return 0;
  const diff = daysFromToday(task.dueDate, now);
  if (diff < 0) return 52;
  if (diff === 0) return 40;
  if (diff <= 3) return 26;
  if (diff <= 7) return 12;
  return 0;
}

function stalenessScore(task: TodayTask, now: Date): number {
  const days = ageDays(task, now);
  if (days >= 90) return 34;
  if (days >= 60) return 24;
  if (days >= 30) return 16;
  if (days >= 14) return 8;
  return 0;
}

function missingMetadataScore(task: TodayTask): number {
  let score = 0;
  if (!task.context?.trim()) score += 6;
  if (!task.effort) score += 6;
  if (!task.minimumDuration) score += 4;
  return score;
}

function actionableInbox(task: TodayTask): boolean {
  return task.state === "inbox" && task.entityType !== "project" && !task.parentTaskId;
}

function getDeferCount(task: TodayTask): number {
  const raw = task.attrs?.[DEFER_COUNT_ATTR];
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
}

type ProjectStats = {
  project: TodayTask;
  openActions: TodayTask[];
  nextActions: TodayTask[];
  actionablePathActions: TodayTask[];
  waitingActionsNeedingFollowUp: TodayTask[];
};

function isOpenAction(task: TodayTask): boolean {
  return task.entityType !== "project" && task.state !== "completed" && task.state !== "reference";
}

function makeTaskMap(tasks: TodayTask[]): Map<string, TodayTask> {
  return new Map(tasks.map((task) => [taskRefKey(task), task]));
}

function findOwningProject(task: TodayTask, taskMap: Map<string, TodayTask>): TodayTask | undefined {
  let current: TodayTask | undefined = task;
  while (current?.parentTaskId) {
    const parent = taskMap.get(`${current.source}:${current.parentTaskId}`);
    if (!parent) break;
    if (parent.entityType === "project") return parent;
    current = parent;
  }
  return undefined;
}

function buildProjectStats(
  tasks: TodayTask[],
  now: Date,
  childrenMap: Map<string, TodayTask[]>
): {
  statsByProjectId: Map<string, ProjectStats>;
  projectByTaskId: Map<string, TodayTask>;
} {
  const actionable = tasks.filter((task) => task.state !== "completed" && task.state !== "reference");
  const projects = actionable.filter((task) => task.entityType === "project" && !task.parentTaskId);
  const taskMap = makeTaskMap(tasks);
  const statsByProjectId = new Map<string, ProjectStats>();
  const projectByTaskId = new Map<string, TodayTask>();

  for (const project of projects) {
    const descendants = collectDescendants(project, childrenMap);
    const openActions = descendants.filter(isOpenAction);
    const nextActions = openActions.filter((task) => task.state === "next");
    const actionablePathActions = openActions.filter(hasProjectActionablePath);
    const waitingActionsNeedingFollowUp = openActions.filter((task) => isWaitingFollowUp(task, now));
    statsByProjectId.set(project.taskId, {
      project,
      openActions,
      nextActions,
      actionablePathActions,
      waitingActionsNeedingFollowUp,
    });
  }

  for (const task of actionable) {
    if (task.entityType === "project") continue;
    const project = findOwningProject(task, taskMap);
    if (project) projectByTaskId.set(task.taskId, project);
  }

  return { statsByProjectId, projectByTaskId };
}

function directOpenChildren(task: TodayTask, childrenMap: Map<string, TodayTask[]>): TodayTask[] {
  return (childrenMap.get(taskRefKey(task)) ?? []).filter(isOpenAction);
}

function directWaitingChildren(task: TodayTask, childrenMap: Map<string, TodayTask[]>, now: Date): TodayTask[] {
  return directOpenChildren(task, childrenMap).filter((child) => child.state === "waiting" && isWaitingFollowUp(child, now));
}

function projectImpactScore(
  task: TodayTask,
  projectStats: ProjectStats | undefined,
  childrenMap: Map<string, TodayTask[]>,
  now: Date
): number {
  if (!projectStats) return 0;

  let score = 0;
  const openActionsCount = projectStats.openActions.length;
  const nextActionsCount = projectStats.nextActions.length;
  const directOpenChildCount = directOpenChildren(task, childrenMap).length;
  const directWaitingChildCount = directWaitingChildren(task, childrenMap, now).length;

  if (task.state === "next") {
    if (nextActionsCount === 1) score += 20;
    score += Math.min(20, openActionsCount * 3);
  }

  if (directOpenChildCount > 0) score += Math.min(16, directOpenChildCount * 4);
  if (directWaitingChildCount > 0) score += Math.min(18, directWaitingChildCount * 6);

  return score;
}

function waitingChainBoost(task: TodayTask, childrenMap: Map<string, TodayTask[]>, now: Date): number {
  const stalledWaitingChildren = directWaitingChildren(task, childrenMap, now).length;
  if (stalledWaitingChildren <= 0) return 0;
  return Math.min(16, stalledWaitingChildren * 6);
}

function projectContextText(project: TodayTask | undefined): string {
  return project ? ` Project: ${project.title}.` : "";
}

function makeSuggestion(args: {
  type: InsightSuggestionType;
  task?: TodayTask;
  project?: TodayTask;
  title: string;
  reason: string;
  reasonCode: InsightReasonCode;
  recommendedAction: InsightRecommendedAction;
  urgency?: number;
  staleness?: number;
  dueDateRisk?: number;
  projectBlockage?: number;
  missingMetadata?: number;
  waitingFollowupRisk?: number;
}): InsightSuggestion {
  const task = args.task;
  const project = args.project;
  const scoreBreakdown = {
    urgency: args.urgency ?? 0,
    staleness: args.staleness ?? 0,
    dueDateRisk: args.dueDateRisk ?? 0,
    projectBlockage: args.projectBlockage ?? 0,
    missingMetadata: args.missingMetadata ?? 0,
    waitingFollowupRisk: args.waitingFollowupRisk ?? 0,
    total: 0,
  };
  scoreBreakdown.total =
    scoreBreakdown.urgency +
    scoreBreakdown.staleness +
    scoreBreakdown.dueDateRisk +
    scoreBreakdown.projectBlockage +
    scoreBreakdown.missingMetadata +
    scoreBreakdown.waitingFollowupRisk;

  return {
    id: [args.type, project ? taskRefKey(project) : null, task ? taskRefKey(task) : null]
      .filter(Boolean)
      .join(":"),
    type: args.type,
    score: scoreBreakdown.total,
    scoreBreakdown,
    taskId: task?.taskId,
    projectId: project?.taskId,
    task,
    project,
    title: args.title,
    reason: args.reason,
    reasonCode: args.reasonCode,
    recommendedAction: args.recommendedAction,
  };
}

export function buildInsightsResponse(tasks: TodayTask[], now: Date, includeShared: boolean): InsightsResponse {
  const childrenMap = buildChildrenMap(tasks);
  const actionable = tasks.filter((task) => task.state !== "completed" && task.state !== "reference");
  const executableTasks = actionable.filter((task) => task.entityType !== "project");
  const suggestions: InsightSuggestion[] = [];
  const { statsByProjectId, projectByTaskId } = buildProjectStats(tasks, now, childrenMap);

  for (const task of executableTasks) {
    const stale = stalenessScore(task, now);
    const dueRisk = urgencyFromDueDate(task, now);
    const metadata = missingMetadataScore(task);
    const effortMinutes = effortToMinutes(task.effort);
    const minimumDurationMinutes = minimumDurationToMinutes(task.minimumDuration);
    const deferCount = getDeferCount(task);
    const project = projectByTaskId.get(task.taskId);
    const projectStats = project ? statsByProjectId.get(project.taskId) : undefined;
    const projectImpact = projectImpactScore(task, projectStats, childrenMap, now);
    const waitingBoost = waitingChainBoost(task, childrenMap, now);
    const projectText = projectContextText(project);

    if (actionableInbox(task)) {
      suggestions.push(
        makeSuggestion({
          type: "promoteToNext",
          task,
          project,
          title: `Promote “${task.title}” to Next`,
          reason: `This inbox item looks actionable and can be pulled into your execution list now.${task.context ? "" : " Add context when you do."}${projectText}`,
          reasonCode: "inbox_actionable",
          recommendedAction: "set_next",
          urgency: task.priority ? priorityRank(task.priority) * 4 : 6,
          staleness: stale,
          dueDateRisk: dueRisk,
          projectBlockage: Math.max(0, Math.round(projectImpact * 0.5)),
          missingMetadata: Math.min(metadata, 8),
        })
      );
    }

    if (task.state === "waiting" && isWaitingFollowUp(task, now)) {
      suggestions.push(
        makeSuggestion({
          type: "waitingFollowUp",
          task,
          project,
          title: `Follow up on “${task.title}”`,
          reason: `This waiting item has been untouched for ${ageDays(task, now)} days${task.waitingForTaskTitle ? ` and is blocked by ${task.waitingForTaskTitle}` : task.waitingFor ? ` and is waiting for ${task.waitingFor}` : ""}.${projectText}`,
          reasonCode: "waiting_stale",
          recommendedAction: "set_waiting_followup",
          dueDateRisk: dueRisk,
          staleness: stale,
          projectBlockage: Math.round(projectImpact * 0.5),
          waitingFollowupRisk: 28,
        })
      );
    }

    if (task.state !== "someday" && task.state !== "reference" && task.state !== "completed" && !task.context?.trim()) {
      suggestions.push(
        makeSuggestion({
          type: "missingContext",
          task,
          project,
          title: `Add context to “${task.title}”`,
          reason: `This task has no context, so it is harder to choose at the right moment.${projectText}`,
          reasonCode: "context_missing",
          recommendedAction: "add_context",
          urgency: task.state === "next" ? 4 : 0,
          staleness: stale,
          dueDateRisk: dueRisk,
          projectBlockage: Math.round(projectImpact * 0.35),
          missingMetadata: 10,
        })
      );
    }

    if (task.state !== "someday" && task.state !== "reference" && task.state !== "completed" && !task.effort) {
      suggestions.push(
        makeSuggestion({
          type: "missingEffort",
          task,
          project,
          title: `Estimate effort for “${task.title}”`,
          reason: `An effort estimate improves Today ranking and helps choose the right-sized task.${projectText}`,
          reasonCode: "effort_missing",
          recommendedAction: "add_effort",
          urgency: task.state === "next" ? 4 : 0,
          dueDateRisk: dueRisk,
          projectBlockage: Math.round(projectImpact * 0.35),
          missingMetadata: 10,
        })
      );
    }

    if (
      task.state !== "someday" &&
      task.state !== "reference" &&
      task.state !== "completed" &&
      !task.minimumDuration &&
      (task.state === "next" || (effortMinutes !== null && effortMinutes >= 120))
    ) {
      suggestions.push(
        makeSuggestion({
          type: "missingMinimumDuration",
          task,
          project,
          title: `Add focus block to “${task.title}”`,
          reason:
            task.state === "next"
              ? `This Next action has no minimum focus block defined.${projectText}`
              : `This task has a substantial effort estimate but no minimum uninterrupted block, so planning windows stay fuzzy.${projectText}`,
          reasonCode: "minimum_duration_missing",
          recommendedAction: "add_minimum_duration",
          urgency: task.state === "next" ? 6 : 2,
          dueDateRisk: dueRisk,
          projectBlockage: Math.round(projectImpact * 0.45),
          missingMetadata: 12,
          staleness: stale,
        })
      );
    }

    if (deferCount >= 2 && (minimumDurationMinutes !== null ? minimumDurationMinutes >= 90 : (effortMinutes ?? 0) >= 180)) {
      suggestions.push(
        makeSuggestion({
          type: "repeatedDeferredLargeBlock",
          task,
          project,
          title: `Break down or re-plan “${task.title}”`,
          reason: `This task has been deferred ${deferCount} time${deferCount === 1 ? "" : "s"} and appears to require a larger focus block than your current execution windows.${projectText}`,
          reasonCode: "deferred_large_block",
          recommendedAction: task.minimumDuration ? "open_task" : "add_minimum_duration",
          urgency: 12,
          dueDateRisk: dueRisk,
          staleness: stale,
          projectBlockage: Math.round(projectImpact * 0.6),
          missingMetadata: task.minimumDuration ? 4 : 10,
        })
      );
    }

    if (task.state === "scheduled" && !task.dueDate) {
      suggestions.push(
        makeSuggestion({
          type: "scheduledWithoutDueDate",
          task,
          project,
          title: `Add a due date to “${task.title}”`,
          reason: `Scheduled items should anchor to a date so they appear in the right review buckets.${projectText}`,
          reasonCode: "scheduled_no_due_date",
          recommendedAction: "set_due_date",
          dueDateRisk: 18,
          projectBlockage: Math.round(projectImpact * 0.35),
          missingMetadata: 12,
          urgency: 6,
        })
      );
    }

    if (isStaleTask(task, now)) {
      suggestions.push(
        makeSuggestion({
          type: "staleTask",
          task,
          project,
          title: `Refresh stale task “${task.title}”`,
          reason: `This task has not been updated for ${ageDays(task, now)} days. Confirm it, defer it, or move it forward.${projectText}`,
          reasonCode: "task_stale",
          recommendedAction: "open_task",
          staleness: stale + 8,
          dueDateRisk: dueRisk,
          projectBlockage: Math.round(projectImpact * 0.5),
          waitingFollowupRisk: waitingBoost,
        })
      );
    }

    if (isOldSomeday(task, now)) {
      suggestions.push(
        makeSuggestion({
          type: "oldSomeday",
          task,
          project,
          title: `Revisit someday item “${task.title}”`,
          reason: `This someday item has been parked for ${ageDays(task, now)} days and should be recommitted or dropped.${projectText}`,
          reasonCode: "someday_old",
          recommendedAction: "open_task",
          staleness: stale + 10,
          projectBlockage: Math.round(projectImpact * 0.25),
        })
      );
    }
  }

  const projects = actionable.filter((task) => task.entityType === "project" && !task.parentTaskId);

  for (const project of projects) {
    const projectStats = statsByProjectId.get(project.taskId);
    if (!projectStats) continue;

    const { openActions, nextActions, actionablePathActions, waitingActionsNeedingFollowUp } = projectStats;

    if (openActions.length > 0 && actionablePathActions.length === 0) {
      suggestions.push(
        makeSuggestion({
          type: "projectMissingNextAction",
          project,
          title: `Project “${project.title}” has no actionable path`,
          reason: `This project has ${openActions.length} open action${openActions.length === 1 ? "" : "s"} but none is in Next, Scheduled, or Waiting.${waitingActionsNeedingFollowUp.length ? ` ${waitingActionsNeedingFollowUp.length} waiting item${waitingActionsNeedingFollowUp.length === 1 ? " is" : "s are"} stalled.` : ""}`,
          reasonCode: "project_no_next",
          recommendedAction: "create_next_action",
          projectBlockage: openActions.length ? 30 : 22,
          waitingFollowupRisk: waitingActionsNeedingFollowUp.length ? Math.min(18, waitingActionsNeedingFollowUp.length * 6) : 0,
          staleness: stalenessScore(project, now),
        })
      );
    }
  }

  suggestions.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));

  const deduped: InsightSuggestion[] = [];
  const seen = new Set<string>();
  for (const suggestion of suggestions) {
    if (seen.has(suggestion.id)) continue;
    seen.add(suggestion.id);
    deduped.push(suggestion);
    if (deduped.length >= MAX_SUGGESTIONS) break;
  }

  return {
    generatedAt: now.toISOString(),
    includeShared,
    suggestions: deduped,
  };
}