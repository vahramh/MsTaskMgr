import type { ProjectBlockageTier, ProjectClarityTier, ProjectMomentumTier, ProjectReadinessTier, Task } from "@tm/shared";

function ageDays(task: Task, now: Date): number {
  const updated = new Date(task.updatedAt || task.createdAt);
  return Math.max(0, Math.floor((now.getTime() - updated.getTime()) / 86400000));
}

function daysFromToday(dateIso: string, now: Date): number {
  const due = new Date(dateIso);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  return Math.floor((dueDay.getTime() - today.getTime()) / 86400000);
}

function isOpenAction(task: Task): boolean {
  return task.entityType !== "project" && task.state !== "completed" && task.state !== "reference";
}

function isActionable(task: Task): boolean {
  return task.entityType !== "project" && (task.state === "next" || task.state === "scheduled");
}

function waitingFollowUp(task: Task, now: Date): boolean {
  return task.state === "waiting" && ageDays(task, now) >= 7;
}

export type FocusedProjectDiagnostics = {
  momentum: ProjectMomentumTier;
  clarity: ProjectClarityTier;
  readiness: ProjectReadinessTier;
  blockage: ProjectBlockageTier;
  nextCount: number;
  waitingCount: number;
  dueSoonCount: number;
  recentCompletedCount: number;
  leadTaskTitle?: string;
  outcomePrompt: boolean;
  summary: string;
};

export function computeFocusedProjectDiagnostics(project: Task, descendants: Task[], now: Date): FocusedProjectDiagnostics | null {
  const openActions = descendants.filter(isOpenAction);
  if (!openActions.length) return null;

  const actionable = openActions.filter(isActionable);
  const nextActions = openActions.filter((task) => task.state === "next");
  const inboxActions = openActions.filter((task) => task.state === "inbox");
  const waitingActions = openActions.filter((task) => task.state === "waiting");
  const somedayActions = openActions.filter((task) => task.state === "someday");
  const dueSoonCount = openActions.filter((task) => task.dueDate && daysFromToday(task.dueDate, now) <= 2).length;
  const recentCompletedCount = descendants.filter((task) => task.entityType !== "project" && task.state === "completed" && ageDays(task, now) <= 14).length;
  const recentActive = openActions.filter((task) => ageDays(task, now) <= 14).length;

  let blockage: ProjectBlockageTier = "none";
  if (nextActions.length === 0 && waitingActions.length > 0 && waitingActions.length === openActions.length) {
    blockage = waitingActions.some((task) => waitingFollowUp(task, now)) ? "waitingRisk" : "waiting";
  }

  let clarity: ProjectClarityTier = "clear";
  if (nextActions.length > 0) clarity = "clear";
  else if (blockage !== "none") clarity = "blocked";
  else if (somedayActions.length === openActions.length) clarity = "parked";
  else if (inboxActions.length > 0) clarity = "needsClarification";
  else clarity = "needsNextAction";

  let momentum: ProjectMomentumTier = "warm";
  if (recentCompletedCount > 0 && actionable.length > 0) momentum = "strong";
  else if (recentCompletedCount > 0 || (recentActive > 0 && actionable.length > 0)) momentum = "warm";
  else if (actionable.length === 0 && recentActive === 0) momentum = "stalled";
  else momentum = "cold";

  let readiness: ProjectReadinessTier = "notReady";
  if (blockage !== "none") readiness = "blocked";
  else if (nextActions.length === 0) readiness = "notReady";
  else if (nextActions.some((task) => task.context?.trim() && task.effort && task.minimumDuration)) readiness = "ready";
  else readiness = "weakReady";

  const leadTask = [...nextActions, ...openActions]
    .sort((a, b) => {
      const aScore = (a.state === "next" ? 100 : 0) + (a.priority ?? 0) * 5 + (a.context?.trim() ? 4 : 0) + (a.effort ? 3 : 0);
      const bScore = (b.state === "next" ? 100 : 0) + (b.priority ?? 0) * 5 + (b.context?.trim() ? 4 : 0) + (b.effort ? 3 : 0);
      if (bScore !== aScore) return bScore - aScore;
      return a.title.localeCompare(b.title);
    })[0];

  const summary =
    dueSoonCount > 0
      ? nextActions.length > 0
        ? `Deadline pressure is building. ${nextActions.length} next step${nextActions.length === 1 ? " is" : "s are"} available.`
        : "Deadline pressure is building and the project still needs a clear next step."
      : blockage === "waitingRisk"
      ? `${waitingActions.length} waiting item${waitingActions.length === 1 ? " is" : "s are"} stale enough to follow up.`
      : blockage === "waiting"
      ? "All forward motion is currently blocked by waiting work."
      : clarity === "needsClarification"
      ? "The project has work in flight, but the next step is still not clear enough."
      : clarity === "needsNextAction"
      ? "The project has open work, but nothing is currently marked as Next."
      : momentum === "cold" || momentum === "stalled"
      ? leadTask
        ? `Momentum is low. ${leadTask.title} looks like the best restart step.`
        : "Momentum is low."
      : leadTask
      ? `${leadTask.title} is the clearest next move.`
      : "Project looks healthy.";

  return {
    momentum,
    clarity,
    readiness,
    blockage,
    nextCount: nextActions.length,
    waitingCount: waitingActions.length,
    dueSoonCount,
    recentCompletedCount,
    leadTaskTitle: leadTask?.title,
    outcomePrompt: !project.description?.trim(),
    summary,
  };
}
