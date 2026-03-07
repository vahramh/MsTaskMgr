import type { Task } from "@tm/shared";

export type HygieneSignalKey = "missingContext" | "missingEffort" | "scheduledWithoutDueDate" | "stale";

export type HygieneSignal = {
  key: HygieneSignalKey;
  icon: string;
  label: string;
};

const STALE_DAYS = 30;

function ageDays(task: Task, now: Date): number {
  const updated = new Date(task.updatedAt || task.createdAt);
  return Math.max(0, Math.floor((now.getTime() - updated.getTime()) / 86400000));
}

export function isStaleTask(task: Task, now: Date): boolean {
  if (task.state === "completed" || task.state === "reference") return false;
  return ageDays(task, now) >= STALE_DAYS;
}

export function getHygieneSignals(task: Task, now: Date): HygieneSignal[] {
  const signals: HygieneSignal[] = [];
  if (!task.context?.trim()) signals.push({ key: "missingContext", icon: "⚠", label: "No context" });
  if (!task.effort) signals.push({ key: "missingEffort", icon: "⚠", label: "No effort" });
  if (task.state === "scheduled" && !task.dueDate) signals.push({ key: "scheduledWithoutDueDate", icon: "⚠", label: "Scheduled without due date" });
  if (isStaleTask(task, now)) signals.push({ key: "stale", icon: "⚠", label: "Stale" });
  return signals;
}
