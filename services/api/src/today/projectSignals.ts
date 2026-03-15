import type { Task } from "@tm/shared";

export type ProjectMomentumTier =
  | "strong"
  | "warm"
  | "cold"
  | "stalled";

export type ProjectClarityTier =
  | "clear"
  | "needsNextAction";

export type ProjectReadinessTier =
  | "ready"
  | "weakReady"
  | "notReady";

export type ProjectBlockageTier =
  | "none"
  | "waiting"
  | "waitingRisk";

export type ProjectSignals = {
  momentum: ProjectMomentumTier;
  clarity: ProjectClarityTier;
  readiness: ProjectReadinessTier;
  blockage: ProjectBlockageTier;

  nextCount: number;
  waitingCount: number;
  recentCompletedCount: number;
};

export function computeProjectSignals(
  project: Task,
  children: Task[],
  now: Date
): ProjectSignals {

  const next = children.filter(t => t.state === "next");
  const waiting = children.filter(t => t.state === "waiting");
  const completed = children.filter(t => t.state === "completed");

  const recentCompleted = completed.filter(t => {
    if (!t.updatedAt) return false;
    const age = now.getTime() - new Date(t.updatedAt).getTime();
    return age < 7 * 86400000;
  });

  let momentum: ProjectMomentumTier = "cold";

  if (recentCompleted.length >= 3) momentum = "strong";
  else if (recentCompleted.length > 0) momentum = "warm";
  else if (next.length === 0 && waiting.length === 0) momentum = "stalled";

  const clarity: ProjectClarityTier =
    next.length > 0 ? "clear" : "needsNextAction";

  let readiness: ProjectReadinessTier = "notReady";
  if (next.length > 0) readiness = "ready";
  else if (waiting.length > 0) readiness = "weakReady";

  let blockage: ProjectBlockageTier = "none";
  if (waiting.length > 0 && next.length === 0) {
    blockage = waiting.length >= 3 ? "waitingRisk" : "waiting";
  }

  return {
    momentum,
    clarity,
    readiness,
    blockage,
    nextCount: next.length,
    waitingCount: waiting.length,
    recentCompletedCount: recentCompleted.length,
  };
}