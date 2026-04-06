import { priorityRank } from "../lib/priority";
import type {
  ProjectBlockageTier,
  ProjectClarityTier,
  ProjectMomentumTier,
  ProjectReadinessTier,
  TodayProjectHealthProject,
  TodayTask,
} from "../../../../packages/shared/src";
import { buildChildrenMap, collectDescendants, taskRefKey } from "../today/hierarchy";
import { daysFromToday, isWaitingFollowUp } from "../today/scoring";

export type TaskExecutionReadinessTier = "ready" | "weakReady" | "notReady" | "blocked";

export type TaskProjectContext = {
  project?: TodayTask;
  leadTaskId?: string;
  onlyActionableTask: boolean;
  onlyNextTask: boolean;
  projectLowMomentum: boolean;
  projectNeedsClarification: boolean;
  projectHasDeadlinePressure: boolean;
  taskExecutionReadiness: TaskExecutionReadinessTier;
  blockedByAncestorState: boolean;
  blockedByDescendantState: boolean;
  hasOpenChildren: boolean;
  hasActionableChildren: boolean;
  missingReadinessMetadata: number;
};

export type ProjectIntelligenceResult = {
  projects: TodayProjectHealthProject[];
  taskContextByKey: Map<string, TaskProjectContext>;
};

function ageDays(task: TodayTask, now: Date): number {
  const updated = new Date(task.updatedAt || task.createdAt);
  return Math.max(0, Math.floor((now.getTime() - updated.getTime()) / 86400000));
}

function isOpenAction(task: TodayTask): boolean {
  return task.entityType !== "project" && task.state !== "completed" && task.state !== "reference";
}

function isActionable(task: TodayTask): boolean {
  return task.entityType !== "project" && (task.state === "next" || task.state === "scheduled");
}

function isScheduledSoon(task: TodayTask, now: Date): boolean {
  return task.state === "scheduled" && !!task.dueDate && daysFromToday(task.dueDate, now) <= 3;
}

function hasDeadlinePressure(task: TodayTask, now: Date): boolean {
  if (!task.dueDate) return false;
  return daysFromToday(task.dueDate, now) <= 2;
}

function recentCompletionCount(tasks: TodayTask[], now: Date, days: number): number {
  return tasks.filter((task) => task.entityType !== "project" && task.state === "completed" && ageDays(task, now) <= days).length;
}

function recentActivityCount(tasks: TodayTask[], now: Date, days: number): number {
  return tasks.filter((task) => task.entityType !== "project" && task.state !== "completed" && ageDays(task, now) <= days).length;
}

function computeMomentum(
  openActions: TodayTask[],
  descendants: TodayTask[],
  actionable: TodayTask[],
  now: Date,
): ProjectMomentumTier {
  const completed7 = recentCompletionCount(descendants, now, 7);
  const completed14 = recentCompletionCount(descendants, now, 14);
  const active7 = recentActivityCount(openActions, now, 7);
  const active14 = recentActivityCount(openActions, now, 14);

  if (completed7 > 0 && actionable.length > 0) return "strong";
  if (completed14 > 0 || active7 >= 2 || (active14 > 0 && actionable.length > 0)) return "warm";
  if (actionable.length === 0 && active14 === 0) return "stalled";
  return "cold";
}

function computeBlockage(openActions: TodayTask[], nextActions: TodayTask[], waitingActions: TodayTask[], now: Date): ProjectBlockageTier {
  if (nextActions.length > 0) return "none";
  if (waitingActions.length === 0) return "none";
  const allBlocked = waitingActions.length === openActions.length;
  if (!allBlocked) return "none";
  return waitingActions.some((task) => isWaitingFollowUp(task, now)) ? "waitingRisk" : "waiting";
}

function computeClarity(
  openActions: TodayTask[],
  nextActions: TodayTask[],
  inboxActions: TodayTask[],
  somedayActions: TodayTask[],
  blockage: ProjectBlockageTier,
): ProjectClarityTier {
  if (nextActions.length > 0) return "clear";
  if (blockage !== "none") return "blocked";
  if (openActions.length > 0 && somedayActions.length === openActions.length) return "parked";
  if (inboxActions.length > 0) return "needsClarification";
  return "needsNextAction";
}

function computeReadiness(
  nextActions: TodayTask[],
  clarity: ProjectClarityTier,
  blockage: ProjectBlockageTier,
): ProjectReadinessTier {
  if (blockage !== "none") return "blocked";
  if (nextActions.length === 0) return "notReady";
  const lead = nextActions[0];
  if (lead?.context?.trim() && lead.effort && lead.minimumDuration) return "ready";
  if (clarity === "clear") return "weakReady";
  return "notReady";
}

function leadActionScore(task: TodayTask, now: Date): number {
  let score = 0;
  if (task.state === "next") score += 100;
  if (task.state === "scheduled") score += 80;
  if (task.dueDate) {
    const diff = daysFromToday(task.dueDate, now);
    if (diff < 0) score += 35;
    else if (diff === 0) score += 25;
    else if (diff <= 3) score += 18;
  }
  if (task.priority) score += priorityRank(task.priority) * 5;
  if (task.context?.trim()) score += 5;
  if (task.effort) score += 4;
  if (task.minimumDuration) score += 4;
  return score;
}

function selectLeadTask(openActions: TodayTask[], now: Date): TodayTask | undefined {
  return [...openActions].sort((a, b) => {
    const diff = leadActionScore(b, now) - leadActionScore(a, now);
    if (diff !== 0) return diff;
    return a.title.localeCompare(b.title);
  })[0];
}

function severityScore(args: {
  momentum: ProjectMomentumTier;
  clarity: ProjectClarityTier;
  blockage: ProjectBlockageTier;
  dueSoonCount: number;
  openActions: number;
  waitingCount: number;
}): number {
  let score = 0;
  if (args.dueSoonCount > 0) score += 50 + args.dueSoonCount * 8;
  if (args.blockage === "waitingRisk") score += 38;
  else if (args.blockage === "waiting") score += 28;
  if (args.clarity === "needsClarification") score += 30;
  else if (args.clarity === "needsNextAction") score += 22;
  if (args.momentum === "stalled") score += 34;
  else if (args.momentum === "cold") score += 18;
  score += Math.min(args.openActions, 8);
  score += Math.min(args.waitingCount, 4) * 2;
  return score;
}

function buildDiagnosis(args: {
  clarity: ProjectClarityTier;
  blockage: ProjectBlockageTier;
  momentum: ProjectMomentumTier;
  dueSoonCount: number;
  nextCount: number;
  waitingCount: number;
  leadTask?: TodayTask;
}): string {
  if (args.dueSoonCount > 0) {
    return args.nextCount > 0
      ? `Deadline pressure is building. ${args.nextCount} actionable step${args.nextCount === 1 ? " is" : "s are"} available.`
      : "Deadline pressure is building and there is no clear next step.";
  }
  if (args.blockage === "waitingRisk") {
    return `${args.waitingCount} waiting item${args.waitingCount === 1 ? " is" : "s are"} stale enough to follow up.`;
  }
  if (args.blockage === "waiting") {
    return "All forward motion is currently blocked by waiting work.";
  }
  if (args.clarity === "needsClarification") {
    return "The project has open work, but it still needs a clearer next action.";
  }
  if (args.clarity === "needsNextAction") {
    return "The project has open work, but nothing is currently marked as Next.";
  }
  if (args.momentum === "stalled") {
    return "The project has lost momentum and needs an execution-grade next step.";
  }
  if (args.momentum === "cold") {
    return args.leadTask ? `Momentum is low. ${args.leadTask.title} looks like the best step to restart flow.` : "Momentum is low.";
  }
  return args.leadTask ? `${args.leadTask.title} is the clearest next move.` : "Project looks healthy.";
}

function buildTaskMap(tasks: TodayTask[]): Map<string, TodayTask> {
  return new Map(tasks.map((task) => [taskRefKey(task), task]));
}

function collectAncestors(task: TodayTask, taskMap: Map<string, TodayTask>): TodayTask[] {
  const out: TodayTask[] = [];
  let current = task;
  const seen = new Set<string>();

  while (current.parentTaskId) {
    const key = `${current.source}:${current.parentTaskId}`;
    if (seen.has(key)) break;
    seen.add(key);
    const parent = taskMap.get(key);
    if (!parent) break;
    out.push(parent);
    current = parent;
  }

  return out;
}

function isBlockingState(task: TodayTask): boolean {
  return task.state === "waiting" || task.state === "someday" || task.state === "reference" || task.state === "completed";
}

function metadataCompleteness(task: TodayTask): number {
  let count = 0;
  if (task.context?.trim()) count += 1;
  if (task.effort) count += 1;
  if (task.minimumDuration) count += 1;
  return count;
}

function assessTaskExecutionReadiness(
  task: TodayTask,
  childrenMap: Map<string, TodayTask[]>,
  taskMap: Map<string, TodayTask>,
  now: Date
): {
  tier: TaskExecutionReadinessTier;
  blockedByAncestorState: boolean;
  blockedByDescendantState: boolean;
  hasOpenChildren: boolean;
  hasActionableChildren: boolean;
  missingReadinessMetadata: number;
} {
  const directOpenChildren = (childrenMap.get(taskRefKey(task)) ?? []).filter(isOpenAction);
  const directActionableChildren = directOpenChildren.filter(isActionable);
  const directBlockingChildren = directOpenChildren.filter((child) => child.state === "waiting" || child.state === "inbox");
  const ancestors = collectAncestors(task, taskMap);
  const blockedByAncestorState = ancestors.some(  (ancestor) => ancestor.entityType !== "project" && (isBlockingState(ancestor) || ancestor.state === "inbox"));
  const metadataCount = metadataCompleteness(task);
  const missingReadinessMetadata = 3 - metadataCount;

  if (blockedByAncestorState) {
    return {
      tier: "blocked",
      blockedByAncestorState,
      blockedByDescendantState: false,
      hasOpenChildren: directOpenChildren.length > 0,
      hasActionableChildren: directActionableChildren.length > 0,
      missingReadinessMetadata,
    };
  }

  if (task.state === "waiting" || task.state === "someday" || task.state === "inbox") {
    return {
      tier: task.state === "waiting" ? "blocked" : "notReady",
      blockedByAncestorState: false,
      blockedByDescendantState: false,
      hasOpenChildren: directOpenChildren.length > 0,
      hasActionableChildren: directActionableChildren.length > 0,
      missingReadinessMetadata,
    };
  }

  if (directActionableChildren.length > 0) {
    return {
      tier: "notReady",
      blockedByAncestorState: false,
      blockedByDescendantState: false,
      hasOpenChildren: true,
      hasActionableChildren: true,
      missingReadinessMetadata,
    };
  }

  if (directBlockingChildren.length > 0) {
    return {
      tier: "blocked",
      blockedByAncestorState: false,
      blockedByDescendantState: true,
      hasOpenChildren: directOpenChildren.length > 0,
      hasActionableChildren: directActionableChildren.length > 0,
      missingReadinessMetadata,
    };
  }

  if (directOpenChildren.length > 0) {
    return {
      tier: "notReady",
      blockedByAncestorState: false,
      blockedByDescendantState: false,
      hasOpenChildren: true,
      hasActionableChildren: false,
      missingReadinessMetadata,
    };
  }

  if (metadataCount == 3) {
    return {
      tier: "ready",
      blockedByAncestorState: false,
      blockedByDescendantState: false,
      hasOpenChildren: false,
      hasActionableChildren: false,
      missingReadinessMetadata,
    };
  }

  if (metadataCount >= 2) {
    return {
      tier: "weakReady",
      blockedByAncestorState: false,
      blockedByDescendantState: false,
      hasOpenChildren: false,
      hasActionableChildren: false,
      missingReadinessMetadata,
    };
  }

  if (task.dueDate && daysFromToday(task.dueDate, now) <= 0) {
    return {
      tier: "weakReady",
      blockedByAncestorState: false,
      blockedByDescendantState: false,
      hasOpenChildren: false,
      hasActionableChildren: false,
      missingReadinessMetadata,
    };
  }

  return {
    tier: "notReady",
    blockedByAncestorState: false,
    blockedByDescendantState: false,
    hasOpenChildren: false,
    hasActionableChildren: false,
    missingReadinessMetadata,
  };
}

export function buildProjectIntelligence(tasks: TodayTask[], now: Date): ProjectIntelligenceResult {
  const childrenMap = buildChildrenMap(tasks);
  const taskMap = buildTaskMap(tasks);
  const projects = tasks.filter((task) => task.entityType === "project" && !task.parentTaskId && task.state !== "completed");
  const taskContextByKey = new Map<string, TaskProjectContext>();
  const out: TodayProjectHealthProject[] = [];

  for (const project of projects) {
    const descendants = collectDescendants(project, childrenMap);
    const openActions = descendants.filter(isOpenAction);
    if (!openActions.length) continue;

    const actionable = openActions.filter(isActionable);
    const nextActions = openActions.filter((task) => task.state === "next");
    const inboxActions = openActions.filter((task) => task.state === "inbox");
    const waitingActions = openActions.filter((task) => task.state === "waiting");
    const somedayActions = openActions.filter((task) => task.state === "someday");
    const deadlineActions = openActions.filter((task) => hasDeadlinePressure(task, now));
    const blockage = computeBlockage(openActions, nextActions, waitingActions, now);
    const clarity = computeClarity(openActions, nextActions, inboxActions, somedayActions, blockage);
    const momentum = computeMomentum(openActions, descendants, actionable, now);
    const readiness = computeReadiness(nextActions, clarity, blockage);
    const leadTask = selectLeadTask([
      ...nextActions,
      ...openActions.filter((task) => isScheduledSoon(task, now)),
      ...openActions,
    ], now);
    const recentCompletedCount = recentCompletionCount(descendants, now, 14);
    const severity = severityScore({
      momentum,
      clarity,
      blockage,
      dueSoonCount: deadlineActions.length,
      openActions: openActions.length,
      waitingCount: waitingActions.length,
    });

    const item: TodayProjectHealthProject = {
      project,
      leadTask: leadTask ? { taskId: leadTask.taskId, title: leadTask.title } : undefined,
      diagnosis: buildDiagnosis({
        clarity,
        blockage,
        momentum,
        dueSoonCount: deadlineActions.length,
        nextCount: nextActions.length,
        waitingCount: waitingActions.length,
        leadTask,
      }),
      severity,
      openActions: openActions.length,
      actionableCount: actionable.length,
      nextCount: nextActions.length,
      inboxCount: inboxActions.length,
      waitingCount: waitingActions.length,
      dueSoonCount: deadlineActions.length,
      recentCompletedCount,
      momentum,
      clarity,
      readiness,
      blockage,
    };
    out.push(item);

    for (const task of openActions) {
      const readinessSignals = assessTaskExecutionReadiness(task, childrenMap, taskMap, now);
      taskContextByKey.set(taskRefKey(task), {
        project,
        leadTaskId: leadTask?.taskId,
        onlyActionableTask: actionable.length === 1 && actionable[0]?.taskId === task.taskId && actionable[0]?.source === task.source,
        onlyNextTask: nextActions.length === 1 && nextActions[0]?.taskId === task.taskId && nextActions[0]?.source === task.source,
        projectLowMomentum: momentum === "cold" || momentum === "stalled",
        projectNeedsClarification: clarity === "needsClarification" || clarity === "needsNextAction",
        projectHasDeadlinePressure: deadlineActions.length > 0,
        taskExecutionReadiness: readinessSignals.tier,
        blockedByAncestorState: readinessSignals.blockedByAncestorState,
        blockedByDescendantState: readinessSignals.blockedByDescendantState,
        hasOpenChildren: readinessSignals.hasOpenChildren,
        hasActionableChildren: readinessSignals.hasActionableChildren,
        missingReadinessMetadata: readinessSignals.missingReadinessMetadata,
      });
    }
  }

  out.sort((a, b) => {
    if (b.severity !== a.severity) return b.severity - a.severity;
    return a.project.title.localeCompare(b.project.title);
  });

  return { projects: out, taskContextByKey };
}
