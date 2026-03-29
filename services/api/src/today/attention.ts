import type {
  TodayAttentionItem,
  TodayExecutionMetrics,
  TodayFallbackRecommendation,
  TodayGuidedActions,
  TodayTask,
} from "@tm/shared";
import { effortToMinutes, isWaitingFollowUp, daysFromToday } from "./scoring";

function ageDays(task: TodayTask, now: Date): number {
  const updated = new Date(task.updatedAt || task.createdAt);
  return Math.max(0, Math.floor((now.getTime() - updated.getTime()) / 86400000));
}

function compareAttention(a: TodayTask, b: TodayTask, now: Date): number {
  const aOverdue = a.dueDate ? daysFromToday(a.dueDate, now) : Number.POSITIVE_INFINITY;
  const bOverdue = b.dueDate ? daysFromToday(b.dueDate, now) : Number.POSITIVE_INFINITY;
  if (aOverdue !== bOverdue) return aOverdue - bOverdue;
  const aPriority = typeof a.priority === "number" ? a.priority : 0;
  const bPriority = typeof b.priority === "number" ? b.priority : 0;
  if (bPriority !== aPriority) return bPriority - aPriority;
  const aAge = ageDays(a, now);
  const bAge = ageDays(b, now);
  if (bAge != aAge) return bAge - aAge;
  return a.title.localeCompare(b.title);
}

export function buildTodayExecutionMetrics(tasks: TodayTask[], now: Date): TodayExecutionMetrics {
  const staleThresholdMs = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  return {
    readyTasks: tasks.filter((task) => task.entityType !== "project" && task.state === "next").length,
    overdueTasks: tasks.filter((task) => task.entityType !== "project" && !!task.dueDate && daysFromToday(task.dueDate, now) < 0).length,
    dueSoonTasks: tasks.filter((task) => task.entityType !== "project" && !!task.dueDate && daysFromToday(task.dueDate, now) >= 0 && daysFromToday(task.dueDate, now) <= 3).length,
    blockedTasks: tasks.filter((task) => task.entityType !== "project" && task.state === "waiting").length,
    staleTasks: tasks.filter((task) => task.entityType !== "project" && new Date(task.updatedAt || task.createdAt).getTime() < staleThresholdMs).length,
    totalEffortMinutes: tasks.reduce((sum, task) => sum + (effortToMinutes(task.effort) ?? 0), 0),
  };
}

export function buildTodayAttentionItems(tasks: TodayTask[], now: Date): TodayAttentionItem[] {
  const waiting = tasks.filter((task) => task.entityType !== "project" && task.state === "waiting");
  const overdueWaiting = waiting
    .filter((task) => !!task.dueDate && daysFromToday(task.dueDate, now) < 0)
    .sort((a, b) => compareAttention(a, b, now))
    .map<TodayAttentionItem>((task) => ({
      task,
      kind: "overdueWaiting",
      title: task.title,
      explanation: task.waitingFor?.trim()
        ? `This item is overdue and still waiting for ${task.waitingFor.trim()}. It should usually be followed up, rescheduled, or clarified.`
        : "This item is overdue and still in Waiting. It should usually be followed up, rescheduled, or clarified.",
      suggestedActionLabel: "Follow up",
    }));

  const seen = new Set(overdueWaiting.map((item) => item.task.taskId));
  const staleWaiting = waiting
    .filter((task) => !seen.has(task.taskId) && isWaitingFollowUp(task, now))
    .sort((a, b) => compareAttention(a, b, now))
    .map<TodayAttentionItem>((task) => ({
      task,
      kind: "staleWaiting",
      title: task.title,
      explanation: task.waitingFor?.trim()
        ? `This waiting item has gone stale while waiting for ${task.waitingFor.trim()}. It is unlikely to remain trustworthy without a follow-up.`
        : "This waiting item has gone stale and is unlikely to remain trustworthy without a follow-up.",
      suggestedActionLabel: "Review waiting item",
    }));

  return [...overdueWaiting, ...staleWaiting].slice(0, 8);
}

function guidedFallback(guidedActions: TodayGuidedActions): TodayFallbackRecommendation | null {
  if (guidedActions.followUpWaiting) {
    return {
      kind: "guidedAction",
      title: "Follow up waiting work",
      description: `${guidedActions.followUpWaiting.count} waiting item${guidedActions.followUpWaiting.count === 1 ? "" : "s"} are stale enough to deserve attention now.`,
      targetView: "waiting",
      ctaLabel: "Open Waiting",
    };
  }
  if (guidedActions.unblockProjects) {
    return {
      kind: "guidedAction",
      title: "Unblock a waiting project",
      description: `${guidedActions.unblockProjects.count} project${guidedActions.unblockProjects.count === 1 ? " is" : "s are"} being constrained by waiting work.`,
      targetView: "projects",
      ctaLabel: "Open Projects",
    };
  }
  if (guidedActions.clarifyProjects) {
    return {
      kind: "guidedAction",
      title: "Clarify a project path",
      description: `${guidedActions.clarifyProjects.count} project${guidedActions.clarifyProjects.count === 1 ? " has" : "s have"} open work but no clean next action.`,
      targetView: "projects",
      ctaLabel: "Open Projects",
    };
  }
  if (guidedActions.processInbox) {
    return {
      kind: "guidedAction",
      title: "Process the inbox",
      description: `${guidedActions.processInbox.count} inbox item${guidedActions.processInbox.count === 1 ? " needs" : "s need"} clarification before the system can guide cleanly.`,
      targetView: "inbox",
      ctaLabel: "Open Inbox",
    };
  }
  if (guidedActions.prepareNextActions) {
    return {
      kind: "guidedAction",
      title: "Prepare Next actions",
      description: `${guidedActions.prepareNextActions.count} Next or Scheduled item${guidedActions.prepareNextActions.count === 1 ? " is" : "s are"} not fully execution-ready yet.`,
      targetView: "tasks",
      ctaLabel: "Open Tasks",
    };
  }
  if (guidedActions.reviveProjects) {
    return {
      kind: "guidedAction",
      title: "Restore project momentum",
      description: `${guidedActions.reviveProjects.count} project${guidedActions.reviveProjects.count === 1 ? " needs" : "s need"} a restart step.`,
      targetView: "projects",
      ctaLabel: "Open Projects",
    };
  }
  if (guidedActions.breakLargeTasks) {
    return {
      kind: "guidedAction",
      title: "Break down a repeatedly deferred task",
      description: `${guidedActions.breakLargeTasks.count} task${guidedActions.breakLargeTasks.count === 1 ? " keeps" : "s keep"} getting deferred and likely need splitting.`,
      targetView: "tasks",
      ctaLabel: "Open Tasks",
    };
  }
  return null;
}

export function buildFallbackRecommendation(
  bestNextActionExists: boolean,
  attentionItems: TodayAttentionItem[],
  guidedActions: TodayGuidedActions
): TodayFallbackRecommendation | null {
  if (bestNextActionExists) return null;
  const firstAttention = attentionItems[0];
  if (firstAttention) {
    return {
      kind: "attentionTask",
      title:
        firstAttention.kind === "overdueWaiting"
          ? "Best Next Move: follow up overdue waiting item"
          : "Best Next Move: review stale waiting item",
      description: `"${firstAttention.task.title}" is contributing attention pressure but is not a credible execution task right now.`,
      targetView: "waiting",
      ctaLabel: "Open waiting item",
      task: firstAttention.task,
    };
  }
  return guidedFallback(guidedActions);
}
