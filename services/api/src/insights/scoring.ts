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
import { daysFromToday, effortToMinutes, isWaitingFollowUp, minimumDurationToMinutes } from "../today/scoring";

const MAX_SUGGESTIONS = 24;
const DEFER_COUNT_ATTR = "_egsDeferCount";

function ageDays(task: TodayTask, now: Date): number {
  const updated = new Date(task.updatedAt || task.createdAt);
  return Math.max(0, Math.floor((now.getTime() - updated.getTime()) / 86400000));
}

function urgencyFromDueDate(task: TodayTask, now: Date): number {
  if (!task.dueDate) return 0;
  const diff = daysFromToday(task.dueDate, now);
  if (diff < 0) return 40;
  if (diff === 0) return 30;
  if (diff <= 3) return 18;
  if (diff <= 7) return 8;
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
  if (!task.context?.trim()) score += 12;
  if (!task.effort) score += 12;
  return score;
}

function actionableInbox(task: TodayTask): boolean {
  return task.state === "inbox" && task.entityType !== "project" && !task.parentTaskId;
}

function getDeferCount(task: TodayTask): number {
  const raw = task.attrs?.[DEFER_COUNT_ATTR];
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
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
  scoreBreakdown.total = scoreBreakdown.urgency + scoreBreakdown.staleness + scoreBreakdown.dueDateRisk + scoreBreakdown.projectBlockage + scoreBreakdown.missingMetadata + scoreBreakdown.waitingFollowupRisk;
  return {
    id: [args.type, project ? taskRefKey(project) : null, task ? taskRefKey(task) : null].filter(Boolean).join(":"),
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
  const suggestions: InsightSuggestion[] = [];

  for (const task of actionable) {
    const stale = stalenessScore(task, now);
    const dueRisk = urgencyFromDueDate(task, now);
    const metadata = missingMetadataScore(task);
    const effortMinutes = effortToMinutes(task.effort);
    const minimumDurationMinutes = minimumDurationToMinutes(task.minimumDuration);
    const deferCount = getDeferCount(task);

    if (actionableInbox(task)) {
      suggestions.push(makeSuggestion({
        type: "promoteToNext",
        task,
        title: `Promote “${task.title}” to Next`,
        reason: `This inbox item looks actionable and can be pulled into your execution list now.${task.context ? "" : " Add context when you do."}`,
        reasonCode: "inbox_actionable",
        recommendedAction: "set_next",
        urgency: task.priority ? task.priority * 4 : 6,
        staleness: stale,
        dueDateRisk: dueRisk,
        missingMetadata: metadata,
      }));
    }

    if (task.state === "waiting" && isWaitingFollowUp(task, now)) {
      suggestions.push(makeSuggestion({
        type: "waitingFollowUp",
        task,
        title: `Follow up on “${task.title}”`,
        reason: `This waiting item has been untouched for ${ageDays(task, now)} days${task.waitingFor ? ` and is blocked on ${task.waitingFor}` : ""}.`,
        reasonCode: "waiting_stale",
        recommendedAction: "set_waiting_followup",
        staleness: stale,
        waitingFollowupRisk: 26,
      }));
    }

    if (task.state !== "someday" && task.state !== "reference" && task.state !== "completed" && !task.context?.trim()) {
      suggestions.push(makeSuggestion({
        type: "missingContext",
        task,
        title: `Add context to “${task.title}”`,
        reason: "This task has no context, so it is harder to choose at the right moment.",
        reasonCode: "context_missing",
        recommendedAction: "add_context",
        urgency: task.state === "next" ? 8 : 2,
        staleness: stale,
        missingMetadata: 20,
      }));
    }

    if (task.state !== "someday" && task.state !== "reference" && task.state !== "completed" && !task.effort) {
      suggestions.push(makeSuggestion({
        type: "missingEffort",
        task,
        title: `Estimate effort for “${task.title}”`,
        reason: "An effort estimate improves Today ranking and helps choose the right-sized task.",
        reasonCode: "effort_missing",
        recommendedAction: "add_effort",
        urgency: task.state === "next" ? 8 : 0,
        dueDateRisk: dueRisk,
        missingMetadata: 18,
      }));
    }

    if (task.state !== "someday" && task.state !== "reference" && task.state !== "completed" && !task.minimumDuration && effortMinutes !== null && effortMinutes >= 120) {
      suggestions.push(makeSuggestion({
        type: "missingMinimumDuration",
        task,
        title: `Add minimum focus block to “${task.title}”`,
        reason: "This task has a substantial effort estimate but no minimum uninterrupted block, so planning windows stay fuzzy.",
        reasonCode: "minimum_duration_missing",
        recommendedAction: "add_minimum_duration",
        urgency: task.state === "next" ? 10 : 4,
        dueDateRisk: dueRisk,
        missingMetadata: 22,
      }));
    }

    if (deferCount >= 2 && (minimumDurationMinutes !== null ? minimumDurationMinutes >= 90 : (effortMinutes ?? 0) >= 180)) {
      suggestions.push(makeSuggestion({
        type: "repeatedDeferredLargeBlock",
        task,
        title: `Break down or re-plan “${task.title}”`,
        reason: `This task has been deferred ${deferCount} time${deferCount === 1 ? "" : "s"} and appears to require a larger focus block than your current execution windows.`,
        reasonCode: "deferred_large_block",
        recommendedAction: task.minimumDuration ? "open_task" : "add_minimum_duration",
        urgency: 8,
        dueDateRisk: dueRisk,
        staleness: stale,
        missingMetadata: task.minimumDuration ? 6 : 18,
      }));
    }

    if (task.state === "scheduled" && !task.dueDate) {
      suggestions.push(makeSuggestion({
        type: "scheduledWithoutDueDate",
        task,
        title: `Add a due date to “${task.title}”`,
        reason: "Scheduled items should anchor to a date so they appear in the right review buckets.",
        reasonCode: "scheduled_no_due_date",
        recommendedAction: "set_due_date",
        missingMetadata: 22,
        urgency: 10,
      }));
    }

    if (isStaleTask(task, now)) {
      suggestions.push(makeSuggestion({
        type: "staleTask",
        task,
        title: `Refresh stale task “${task.title}”`,
        reason: `This task has not been updated for ${ageDays(task, now)} days. Confirm it, defer it, or move it forward.`,
        reasonCode: "task_stale",
        recommendedAction: "open_task",
        staleness: stale + 8,
        dueDateRisk: dueRisk,
      }));
    }

    if (isOldSomeday(task, now)) {
      suggestions.push(makeSuggestion({
        type: "oldSomeday",
        task,
        title: `Revisit someday item “${task.title}”`,
        reason: `This someday item has been parked for ${ageDays(task, now)} days and should be recommitted or dropped.`,
        reasonCode: "someday_old",
        recommendedAction: "open_task",
        staleness: stale + 10,
      }));
    }
  }

  const projects = actionable.filter((task) => task.entityType === "project" && !task.parentTaskId);
  for (const project of projects) {
    const descendants = collectDescendants(project, childrenMap);
    const openDescendants = descendants.filter((task) => task.state !== "completed" && task.state !== "reference");
    const openActions = openDescendants.filter((task) => task.entityType !== "project");
    const nextActions = openActions.filter((task) => task.state === "next");
    if (nextActions.length === 0) {
      const stalledWaiting = openActions.filter((task) => isWaitingFollowUp(task, now)).length;
      suggestions.push(makeSuggestion({
        type: "projectMissingNextAction",
        project,
        title: `Project “${project.title}” has no Next action`,
        reason: `This project has ${openActions.length} open action${openActions.length === 1 ? "" : "s"} but none is marked Next.${stalledWaiting ? ` ${stalledWaiting} waiting item${stalledWaiting === 1 ? " is" : "s are"} stalled.` : ""}`,
        reasonCode: "project_no_next",
        recommendedAction: "create_next_action",
        projectBlockage: openActions.length ? 30 : 22,
        waitingFollowupRisk: stalledWaiting ? Math.min(18, stalledWaiting * 6) : 0,
        staleness: stalenessScore(project, now),
      }));
    }

    const nextWithoutMinimumDuration = nextActions.filter((task) => !task.minimumDuration);
    if (nextWithoutMinimumDuration.length > 0) {
      suggestions.push(makeSuggestion({
        type: "projectNextMissingMinimumDuration",
        project,
        title: `Project “${project.title}” has Next actions without focus blocks`,
        reason: `${nextWithoutMinimumDuration.length} Next action${nextWithoutMinimumDuration.length === 1 ? " is" : "s are"} missing minimum focus-block estimates, which weakens execution planning.`,
        reasonCode: "project_next_missing_minimum_duration",
        recommendedAction: "open_task",
        projectBlockage: Math.min(26, 8 + nextWithoutMinimumDuration.length * 6),
        missingMetadata: Math.min(20, nextWithoutMinimumDuration.length * 5),
        staleness: stalenessScore(project, now),
      }));
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
